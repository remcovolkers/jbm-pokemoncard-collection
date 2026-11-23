import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'dashboard',
  },
  {
    path: 'dashboard',
    title: 'PokéBinder — Dashboard',
    loadComponent: () =>
      import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
  },
  {
    path: 'collectie',
    title: 'PokéBinder — Collectie',
    loadComponent: () =>
      import('./features/collection/collection.component').then((m) => m.CollectionComponent),
  },
  {
    path: 'toevoegen',
    title: 'PokéBinder — Kaart Toevoegen',
    loadComponent: () =>
      import('./features/quick-add/quick-add.component').then((m) => m.QuickAddComponent),
  },
  {
    path: 'pokedex',
    title: 'PokéBinder — Pokédex Binder',
    loadComponent: () =>
      import('./features/pokedex-binder/pokedex-binder.component').then(
        (m) => m.PokedexBinderComponent
      ),
  },
  {
    path: 'meer',
    loadComponent: () =>
      import('./features/more/more-shell.component').then((m) => m.MoreShellComponent),
    children: [
      {
        path: '',
        pathMatch: 'full',
        title: 'PokéBinder — Meer',
        loadComponent: () =>
          import('./features/more/more-hub.component').then((m) => m.MoreHubComponent),
      },
      {
        path: 'sets',
        title: 'PokéBinder — Set Voortgang',
        loadComponent: () =>
          import('./features/set-progress/set-progress.component').then(
            (m) => m.SetProgressComponent
          ),
      },
      {
        path: 'verlanglijst',
        title: 'PokéBinder — Verlanglijst',
        loadComponent: () =>
          import('./features/wishlist/wishlist.component').then((m) => m.WishlistComponent),
      },
      {
        path: 'ruil-verkoop',
        title: 'PokéBinder — Ruil & Verkoop',
        loadComponent: () =>
          import('./features/trades/trades.component').then((m) => m.TradesComponent),
      },
      {
        path: 'instellingen',
        title: 'PokéBinder — Instellingen',
        loadComponent: () =>
          import('./features/settings/settings.component').then((m) => m.SettingsComponent),
      },
      {
        path: 'feedback',
        title: 'PokéBinder — Feedback Hub',
        loadComponent: () =>
          import('./features/feedback-hub/feedback-hub.component').then(
            (m) => m.FeedbackHubComponent
          ),
      },
    ],
  },
  {
    path: 'feedback',
    pathMatch: 'full',
    redirectTo: 'meer/feedback',
  },
  {
    path: '**',
    redirectTo: 'dashboard',
  },
];
