import { HttpErrorResponse } from '@angular/common/http';

/** Čitljiva poruka iz greške HTTP poziva (ProblemDetails iz API-ja, validacione greške ili mrežna greška). */
export function errorMessage(error: unknown): string {
  if (!(error instanceof HttpErrorResponse)) {
    return 'Došlo je do greške. Pokušaj ponovo.';
  }

  if (error.status === 0) {
    return 'Server nije dostupan. Proveri vezu i pokušaj ponovo.';
  }
  if (error.status === 429) {
    return 'Previše pokušaja u kratkom roku. Sačekaj malo pa pokušaj ponovo.';
  }

  const body = error.error as { detail?: string; title?: string; errors?: Record<string, string[]> } | null;
  const validation = body?.errors ? Object.values(body.errors).flat() : [];
  if (validation.length > 0) {
    return validation.join(' ');
  }
  if (body?.detail) {
    return body.detail;
  }
  if (error.status === 403) {
    return 'Nemaš dozvolu za ovu radnju.';
  }
  return body?.title ?? 'Došlo je do greške. Pokušaj ponovo.';
}

export function isStatus(error: unknown, status: number): boolean {
  return error instanceof HttpErrorResponse && error.status === status;
}
