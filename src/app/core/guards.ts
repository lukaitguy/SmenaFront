import { inject } from '@angular/core';
import { CanActivateFn, CanMatchFn, Router } from '@angular/router';
import { AuthService } from './auth';

/** Samo prijavljeni; ostali idu na prijavu. */
export const authGuard: CanActivateFn = () =>
  inject(AuthService).isAuthenticated() ? true : inject(Router).createUrlTree(['/prijava']);

/** Prijava i registracija su samo za neprijavljene. */
export const guestGuard: CanActivateFn = () =>
  inject(AuthService).isAuthenticated() ? inject(Router).createUrlTree(['/']) : true;

/** Ruta važi samo za menadžera i vlasnika; inače se probava sledeća ruta sa istom putanjom. */
export const managerMatch: CanMatchFn = () => inject(AuthService).isManager();
