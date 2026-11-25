import { Component, ElementRef, OnInit, computed, inject } from '@angular/core';
import { NavigationEnd, NavigationStart, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs';
import { AppUpdateService } from './core/platform/app-update.service';
import { MobileViewportService } from './core/platform/mobile-viewport.service';
import { PlatformService } from './core/platform/platform.service';
import { ScrollRestoreService } from './core/platform/scroll-restore.service';
import { CollectionStore } from './core/state/collection.store';
import { FeedbackStore } from './core/state/feedback.store';
import { FeedbackModalComponent } from './shared/feedback-modal/feedback-modal.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, FeedbackModalComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit {
  readonly store = inject(CollectionStore);
  readonly feedback = inject(FeedbackStore);
  readonly platform = inject(PlatformService);
  readonly updates = inject(AppUpdateService);
  private readonly mobileViewport = inject(MobileViewportService);
  private readonly router = inject(Router);
  private readonly hostEl = inject(ElementRef<HTMLElement>);
  private readonly scrollRestore = inject(ScrollRestoreService);
  private previousUrl = this.router.url;

  constructor() {
    // Scrollpositie onthouden bij doorklikken naar Kaartdetail en herstellen bij terugkeren (verwijderen/opslaan/Terug)
    this.router.events.subscribe((event) => {
      if (event instanceof NavigationStart) {
        this.scrollRestore.onNavigationStart(this.router.url, event.url, this.mainScrollEl()?.scrollTop ?? 0);
      } else if (event instanceof NavigationEnd) {
        const fromUrl = this.previousUrl;
        this.previousUrl = event.urlAfterRedirects;
        const top = this.scrollRestore.resolveScrollTop(fromUrl, event.urlAfterRedirects);
        const mainEl = this.mainScrollEl();
        if (mainEl) this.scrollRestore.applyScrollTop(mainEl, top);
      }
    });
  }

  private mainScrollEl(): HTMLElement | null {
    return this.hostEl.nativeElement.querySelector('.shell__main') as HTMLElement | null;
  }

  ngOnInit(): void {
    this.platform.initializeNavigationTracking();
    this.mobileViewport.initialize();
    void this.platform.initializeNativeShell();
    void this.updates.initialize();
    void this.feedback.refreshHub(true);
  }

  readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
      startWith(this.router.url)
    ),
    { initialValue: '/dashboard' }
  );

  readonly isQuickAddRoute = computed(() => this.currentUrl().startsWith('/toevoegen'));
  readonly isCardDetailRoute = computed(() => this.currentUrl().startsWith('/collectie/kaart/'));
  readonly isMoreSubRoute = computed(() => /^\/meer\/.+/.test(this.currentUrl()));
  readonly isMoreHubRoute = computed(() => {
    const clean = this.currentUrl().split('?')[0];
    return clean === '/meer' || clean === '/meer/';
  });
  readonly hideBottomNav = computed(() => this.isQuickAddRoute() || this.isCardDetailRoute());
  readonly showTopbarBack = computed(
    () => this.isQuickAddRoute() || this.isMoreSubRoute() || this.isCardDetailRoute()
  );

  readonly pageSubtitle = computed(() => {
    const url = this.currentUrl();
    if (url.startsWith('/collectie/kaart/')) return 'Kaartdetail';
    if (url.startsWith('/collectie')) return 'Collectie';
    if (url.startsWith('/toevoegen')) return 'Kaart Toevoegen';
    if (url.startsWith('/pokedex')) return 'Pokédex Binder';
    if (url.startsWith('/meer/sets')) return 'Set Voortgang';
    if (url.startsWith('/meer/verlanglijst')) return 'Verlanglijst';
    if (url.startsWith('/meer/ruil-verkoop')) return 'Ruil & Verkoop';
    if (url.startsWith('/meer/instellingen')) return 'Instellingen';
    if (url.startsWith('/meer/feedback') || url.startsWith('/feedback')) return 'Feedback Hub';
    if (url === '/meer') return 'Meer';
    return 'Dashboard';
  });

  readonly syncLabel = computed(() => {
    const pending = this.store.pendingCount();
    switch (this.store.syncStatus()) {
      case 'syncing':
        return pending > 0 ? `Syncen (${pending})…` : 'Syncen…';
      case 'offline':
        return pending > 0 ? `Offline (${pending})` : 'Offline';
      case 'demo':
        return 'Demo-modus';
      case 'unconfigured':
        return 'Niet gekoppeld';
      case 'error':
        return pending > 0 ? `Wachtrij (${pending})` : 'Sync-fout';
      default:
        return pending > 0 ? `${pending} in wachtrij` : 'Gesynct';
    }
  });

  onSyncPillClick(): void {
    const status = this.store.syncStatus();
    if (status === 'unconfigured') {
      void this.router.navigateByUrl('/meer/instellingen');
      return;
    }
    if (this.store.pendingCount() > 0 && !this.store.isSyncing()) {
      void this.store.flushOfflineQueue(false);
      return;
    }
    void this.store.syncFromRemote(false);
  }

  openPageFeedback(): void {
    const page = this.feedback.mapUrlToFeedbackPage(this.currentUrl());
    this.feedback.openComposer(page);
  }

  goBack(): void {
    this.platform.goBackFromStack();
  }
}
