import { ApplicationConfig, isDevMode, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import { AppsScriptSheetsAdapter } from './core/adapters/apps-script-sheets.adapter';
import { TcgdexAdapter } from './core/adapters/tcgdex.adapter';
import { CARD_CATALOG_PORT } from './core/ports/card-catalog.port';
import { COLLECTION_REPOSITORY } from './core/ports/collection-repository.port';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
      withInMemoryScrolling({ scrollPositionRestoration: 'top', anchorScrolling: 'enabled' })
    ),
    { provide: COLLECTION_REPOSITORY, useExisting: AppsScriptSheetsAdapter },
    { provide: CARD_CATALOG_PORT, useExisting: TcgdexAdapter },
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
