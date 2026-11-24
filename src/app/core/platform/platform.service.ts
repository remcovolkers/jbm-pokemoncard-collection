import { Injectable, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { App as CapApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { filter } from 'rxjs';
import { ModalScrollLockService } from './modal-scroll-lock.service';

export type RuntimePlatform = 'android' | 'ios' | 'web';

/**
 * Dunne platform-shell adapter tussen de Angular app en Capacitor.
 * Bevat geen domeinlogica — puur platformdetectie, statusbalk, Android terug-knop,
 * externe downloads en uitbreidingspunt voor toekomstige Android-only features
 * (zoals native notificaties en home-screen widgets).
 */
@Injectable({ providedIn: 'root' })
export class PlatformService {
  private readonly router = inject(Router, { optional: true });
  private readonly scrollLock = inject(ModalScrollLockService);

  readonly isNative = signal<boolean>(Capacitor.isNativePlatform());
  readonly platform = signal<RuntimePlatform>(this.detectPlatform());
  readonly isPwaStandalone = signal<boolean>(this.detectStandalonePwa());
  readonly lastTabUrl = signal<string>('/dashboard');

  readonly isAndroidNative = computed(() => this.isNative() && this.platform() === 'android');
  readonly runtimeLabel = computed(() => {
    if (this.isAndroidNative()) return 'Android App (APK)';
    if (this.isNative()) return `Native App (${this.platform()})`;
    if (this.isPwaStandalone()) return 'Geïnstalleerde PWA';
    return 'Web App (PWA)';
  });

  private initialized = false;
  private navTrackingInitialized = false;

  initializeNavigationTracking(): void {
    if (this.navTrackingInitialized || !this.router) return;
    this.navTrackingInitialized = true;

    if (this.router.url && !this.isStackRoute(this.router.url)) {
      this.lastTabUrl.set(this.router.url);
    }

    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((event) => {
        const url = event.urlAfterRedirects || event.url;
        if (url && !this.isStackRoute(url)) {
          this.lastTabUrl.set(url);
        }
      });
  }

  isStackRoute(url: string): boolean {
    return (
      url.startsWith('/toevoegen') ||
      /^\/meer\/.+/.test(url) ||
      url.startsWith('/collectie/kaart/')
    );
  }

  goBackFromStack(): void {
    if (!this.router) return;
    const prev = this.lastTabUrl();
    const target = prev && !this.isStackRoute(prev) ? prev : '/dashboard';
    void this.router.navigateByUrl(target, { replaceUrl: true });
  }

  handleMobileBackButton(): 'dismissed_overlay' | 'popped_stack' | 'exit' {
    if (this.scrollLock.dismissTopOverlay()) {
      return 'dismissed_overlay';
    }

    const currentUrl = this.router?.url || '';
    if (this.isStackRoute(currentUrl)) {
      this.goBackFromStack();
      return 'popped_stack';
    }

    if (this.isNative()) {
      void this.minimizeOrExitNativeApp();
    }
    return 'exit';
  }

  private async minimizeOrExitNativeApp(): Promise<void> {
    const appPlugin = CapApp as unknown as {
      minimizeApp?: () => Promise<void>;
      exitApp: () => Promise<void>;
    };
    try {
      if (typeof appPlugin.minimizeApp === 'function') {
        await appPlugin.minimizeApp();
        return;
      }
      await appPlugin.exitApp();
    } catch {
      try {
        await appPlugin.exitApp();
      } catch {
        // Negeer op niet-native testomgevingen
      }
    }
  }

  async initializeNativeShell(): Promise<void> {
    this.initializeNavigationTracking();
    if (this.initialized || !this.isNative()) return;
    this.initialized = true;

    try {
      await StatusBar.setStyle({ style: Style.Dark });
      if (this.platform() === 'android') {
        await StatusBar.setBackgroundColor({ color: '#0b1326' });
      }
    } catch {
      // StatusBar plugin is optioneel op web/test-omgevingen
    }

    try {
      await CapApp.addListener('backButton', () => {
        this.handleMobileBackButton();
      });
    } catch {
      // Negeer als plugin niet geregistreerd is
    }
  }

  /**
   * Opent een externe URL (zoals de directe APK-downloadlink op GitHub Releases)
   * in de systeem-browser op Android, of in een nieuw tabblad op het web.
   */
  async openExternalUrl(url: string): Promise<void> {
    if (!url) return;
    if (this.isNative()) {
      try {
        await Browser.open({ url });
        return;
      } catch {
        // Fallback naar window.open
      }
    }
    if (typeof window !== 'undefined') {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }

  private detectPlatform(): RuntimePlatform {
    const p = Capacitor.getPlatform();
    if (p === 'android' || p === 'ios') return p;
    return 'web';
  }

  private detectStandalonePwa(): boolean {
    if (typeof window === 'undefined' || this.isNative()) return false;
    const standaloneMedia =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(display-mode: standalone)').matches;
    const iosStandalone = Boolean((window.navigator as { standalone?: boolean }).standalone);
    return standaloneMedia || iosStandalone;
  }
}
