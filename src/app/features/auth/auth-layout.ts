import { Component, input } from '@angular/core';

/** Zajednički okvir za prijavu i registraciju. */
@Component({
  selector: 'app-auth-layout',
  template: `
    <div class="grid min-h-screen place-items-center bg-gradient-to-br from-brand-50 via-slate-50 to-white px-4 py-10">
      <div class="w-full max-w-md">
        <div class="mb-6 flex items-center justify-center gap-3">
          <span class="grid h-11 w-11 place-items-center rounded-xl bg-brand-600 text-white shadow-md" aria-hidden="true">
            <svg viewBox="0 0 24 24" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
              <path d="M3 9.5h18M8 3v3M16 3v3" />
            </svg>
          </span>
          <span class="text-2xl font-semibold tracking-tight">Smena</span>
        </div>
        <div class="rounded-2xl bg-white p-6 shadow-xl ring-1 ring-slate-900/5 sm:p-8">
          <h1 class="text-xl font-semibold">{{ heading() }}</h1>
          <p class="mt-1 text-sm text-slate-500">{{ subheading() }}</p>
          <div class="mt-6"><ng-content /></div>
        </div>
        <p class="mt-5 text-center text-sm text-slate-600"><ng-content select="[footer]" /></p>
      </div>
    </div>
  `,
})
export class AuthLayout {
  readonly heading = input.required<string>();
  readonly subheading = input('');
}
