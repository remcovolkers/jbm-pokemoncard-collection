import { Component, OnInit, computed, inject } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs';
import { AppUpdateService } from './core/platform/app-update.service';
import { PlatformService } from './core/platform/platform.service';
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
  private readonly router = inject(Router);

  ngOnInit(): void {
    void this.platform.initializeNativeShell();
    void this.updates.initialize();
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

  readonly pageSubtitle = computed(() => {
    const url = this.currentUrl();
    if (url.startsWith('/collectie')) return 'Collectie';
    if (url.startsWith('/toevoegen')) return 'Kaart Toevoegen';
    if (url.startsWith('/pokedex')) return 'Pokédex Binder';
    if (url.startsWith('/meer/sets')) return 'Set Voortgang';
    if (url.startsWith('/meer/verlanglijst')) return 'Verlanglijst';
    if (url.startsWith('/meer/ruil-verkoop')) return 'Ruil & Verkoop';
    if (url.startsWith('/meer/instellingen')) return 'Instellingen';
    if (url.startsWith('/meer/feedback') || url.startsWith('/feedback')) return 'Feedback Hub';
    return 'Dashboard';
  });

  readonly syncLabel = computed(() => {
    switch (this.store.syncStatus()) {
      case 'syncing':
        return 'Syncen…';
      case 'offline':
        return 'Offline';
      case 'demo':
        return 'Demo-modus';
      case 'unconfigured':
        return 'Niet gekoppeld';
      case 'error':
        return 'Sync-fout';
      default:
        return 'Gesynct';
    }
  });

  openPageFeedback(): void {
    const page = this.feedback.mapUrlToFeedbackPage(this.currentUrl());
    this.feedback.openComposer(page);
  }

  goBack(): void {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      window.history.back();
    } else {
      void this.router.navigateByUrl('/dashboard');
    }
  }
}
