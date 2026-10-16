import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { SessionStore } from './session.store';

// toda chamada à API leva o cookie de sessão e o cabeçalho exigido pelo servidor
export const apiInterceptor: HttpInterceptorFn = (req, next) => {
  const session = inject(SessionStore);
  const router = inject(Router);
  const authed = req.clone({
    withCredentials: true,
    setHeaders: { 'X-Requested-With': 'UrbanTalk' },
  });
  return next(authed).pipe(
    catchError((err) => {
      // sessão expirou no meio do uso: limpa e manda para o login, guardando a volta
      const isAuthCall = req.url.includes('/auth/');
      if (err?.status === 401 && !isAuthCall && session.user()) {
        session.clear();
        router.navigate(['/entrar'], { queryParams: { volta: router.url, motivo: 'sessao' } });
      }
      return throwError(() => err);
    }),
  );
};
