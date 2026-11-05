import { Role } from './models';

/** Nazivi uloga u sistemu (dozvole), ne pozicija u smeni. */
export const ROLE_LABELS: Record<Role, string> = {
  Owner: 'Vlasnik',
  Manager: 'Menadžer',
  Staff: 'Zaposleni',
};

export const ROLE_BADGES: Record<Role, string> = {
  Owner: 'bg-violet-100 text-violet-800',
  Manager: 'bg-sky-100 text-sky-800',
  Staff: 'bg-slate-100 text-slate-700',
};
