import { inject } from '@angular/core';
import { Routes } from '@angular/router';
import { AuthService } from './core/auth';
import { authGuard, guestGuard, managerMatch } from './core/guards';
import { Shell } from './layout/shell';

export const routes: Routes = [
  {
    path: 'prijava',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'registracija',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/register.page').then((m) => m.RegisterPage),
  },
  // Linkovi iz mejla rade i kad je u istom browseru neko već prijavljen.
  {
    path: 'pozivnica',
    loadComponent: () => import('./features/auth/invitation.page').then((m) => m.InvitationPage),
  },
  {
    path: 'zaboravljena-lozinka',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/forgot-password.page').then((m) => m.ForgotPasswordPage),
  },
  {
    path: 'nova-lozinka',
    loadComponent: () => import('./features/auth/reset-password.page').then((m) => m.ResetPasswordPage),
  },
  {
    path: '',
    component: Shell,
    canActivate: [authGuard],
    children: [
      // Menadžer počinje od rasporeda, zaposleni od svojih smena.
      { path: '', pathMatch: 'full', redirectTo: () => (inject(AuthService).isManager() ? 'raspored' : 'moje-smene') },
      {
        path: 'raspored',
        canMatch: [managerMatch],
        loadComponent: () => import('./features/schedule/manager-schedule.page').then((m) => m.ManagerSchedulePage),
      },
      {
        path: 'raspored',
        loadComponent: () => import('./features/schedule/roster.page').then((m) => m.RosterPage),
      },
      {
        path: 'slobodni-dani',
        loadComponent: () => import('./features/days-off/days-off.page').then((m) => m.DaysOffPage),
      },
      {
        path: 'sabloni',
        canMatch: [managerMatch],
        loadComponent: () => import('./features/templates/templates.page').then((m) => m.TemplatesPage),
      },
      {
        path: 'pozicije',
        canMatch: [managerMatch],
        loadComponent: () => import('./features/positions/positions.page').then((m) => m.PositionsPage),
      },
      {
        path: 'zaposleni',
        canMatch: [managerMatch],
        loadComponent: () => import('./features/employees/employees.page').then((m) => m.EmployeesPage),
      },
      {
        path: 'najave',
        loadComponent: () => import('./features/announcements/announcements.page').then((m) => m.AnnouncementsPage),
      },
      {
        path: '86-lista',
        loadComponent: () => import('./features/eighty-six/eighty-six.page').then((m) => m.EightySixPage),
      },
      {
        path: 'zamene',
        loadComponent: () => import('./features/swaps/my-requests.page').then((m) => m.MyRequestsPage),
      },
      {
        path: 'zahtevi',
        canMatch: [managerMatch],
        loadComponent: () => import('./features/requests/requests.page').then((m) => m.RequestsPage),
      },
      {
        path: 'moje-smene',
        loadComponent: () => import('./features/my/my-shifts.page').then((m) => m.MyShiftsPage),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
