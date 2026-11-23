import { Component, computed, inject } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs';
import { CollectionStore } from './core/state/collection.store';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  readonly store = inject(CollectionStore);
  private readonly router = inject(Router);

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
      case 'error':
        return 'Sync-fout';
      default:
        return 'Gesynct';
    }
  });

  goBack(): void {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      window.history.back();
    } else {
      void this.router.navigateByUrl('/dashboard');
    }
  }
}
