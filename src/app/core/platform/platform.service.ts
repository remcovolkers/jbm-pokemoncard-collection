import { Injectable, computed, signal } from '@angular/core';
import { App as CapApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';

export type RuntimePlatform = 'android' | 'ios' | 'web';

/**
 * Dunne platform-shell adapter tussen de Angular app en Capacitor.
 * Bevat geen domeinlogica — puur platformdetectie, statusbalk, Android terug-knop,
 * externe downloads en uitbreidingspunt voor toekomstige Android-only features
 * (zoals native notificaties en home-screen widgets).
 */
@Injectable({ providedIn: 'root' })
export class PlatformService {
  readonly isNative = signal<boolean>(Capacitor.isNativePlatform());
  readonly platform = signal<RuntimePlatform>(this.detectPlatform());
  readonly isPwaStandalone = signal<boolean>(this.detectStandalonePwa());

  readonly isAndroidNative = computed(() => this.isNative() && this.platform() === 'android');
  readonly runtimeLabel = computed(() => {
    if (this.isAndroidNative()) return 'Android App (APK)';
    if (this.isNative()) return `Native App (${this.platform()})`;
    if (this.isPwaStandalone()) return 'Geïnstalleerde PWA';
    return 'Web App (PWA)';
  });

  private initialized = false;

  async initializeNativeShell(): Promise<void> {
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
      await CapApp.addListener('backButton', ({ canGoBack }) => {
        if (canGoBack && typeof window !== 'undefined') {
          window.history.back();
        } else {
          void CapApp.exitApp();
        }
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
