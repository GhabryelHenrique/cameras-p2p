import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding, withHashLocation } from '@angular/router';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Hash routing: funciona em qualquer hospedagem estática (GitHub Pages, Netlify…) sem configurar fallback.
    provideRouter(routes, withHashLocation(), withComponentInputBinding()),
  ],
};
