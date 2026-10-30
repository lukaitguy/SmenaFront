import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { AuthService } from './auth';

const AUTH_ENDPOINTS = /^\/api\/auth\/(login|register|refresh|logout)$/;

/** Dodaje access token na pozive ka API-ju, a na 401 jednom osvežava token pa ponavlja zahtev. */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  if (!request.url.startsWith('/api/')) {
    return next(request);
  }

  const withToken = (r: HttpRequest<unknown>) => {
    const token = auth.token();
    return token ? r.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : r;
  };

  return next(withToken(request)).pipe(
    catchError((error: unknown) => {
      const expired = error instanceof HttpErrorResponse && error.status === 401;
      if (!expired || AUTH_ENDPOINTS.test(request.url) || auth.token() === null) {
        return throwError(() => error);
      }

      return from(auth.refresh()).pipe(
        switchMap((ok) => {
          if (ok) {
            return next(withToken(request));
          }
          void auth.expire();
          return throwError(() => error);
        }),
      );
    }),
  );
};
