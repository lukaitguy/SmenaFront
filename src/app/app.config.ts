import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, inject, isDevMode, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideServiceWorker } from '@angular/service-worker';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { routes } from './app.routes';
import { AuthService } from './core/auth';
import { authInterceptor } from './core/auth.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withInterceptors([authInterceptor])),
    // Pre prvog prikaza pokušava da vrati sesiju iz refresh cookie-ja, pa guardovi znaju ko je prijavljen.
    provideAppInitializer(() => inject(AuthService).restore()),
    // Service worker daje instalaciju na početni ekran i prima push obaveštenja. Radi samo u produkcionom
    // build-u (i samo preko https ili localhost), da razvoj ne bi pokazivao stare keširane fajlove.
    provideServiceWorker('ngsw-worker.js', { enabled: !isDevMode(), registrationStrategy: 'registerWhenStable:30000' }),
  ],
};
