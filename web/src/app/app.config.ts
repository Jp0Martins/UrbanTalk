import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { apiInterceptor } from './core/http.interceptor';
import { SessionStore } from './core/session.store';
import { StatusCatalog } from './core/status-catalog';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withInterceptors([apiInterceptor])),
    provideRouter(routes, withComponentInputBinding(), withInMemoryScrolling({ scrollPositionRestoration: 'top', anchorScrolling: 'enabled' })),
    // descobre se já existe sessão antes de decidir as rotas protegidas
    provideAppInitializer(() => {
      const session = inject(SessionStore);
      const statuses = inject(StatusCatalog);
      return Promise.all([session.load(), statuses.load()]).then(() => undefined);
    }),
  ],
};
