import { Injectable, computed, inject, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { AuthService } from './auth';
import { BoardConnection } from './board';
import { Announcement } from './models';
import { SmenaApi } from './smena-api';
import { ToastService } from '../ui/toast';

/**
 * Najave prijavljenog korisnika, uživo. Menadžer vidi sve najave restorana sa spiskom ko je pročitao, a ostali samo
 * ono što su primili. Drži se na jednom mestu da značka sa brojem nepročitanih u meniju i stranica prikazuju isto.
 */
@Injectable({ providedIn: 'root' })
export class AnnouncementsStore {
  private readonly api = inject(SmenaApi);
  private readonly auth = inject(AuthService);
  private readonly board = inject(BoardConnection);
  private readonly toast = inject(ToastService);

  readonly items = signal<Announcement[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');

  /** Najave koje su za mene, a nisam potvrdio "Pročitao sam". */
  readonly unreadCount = computed(() => this.items().filter((a) => a.forMe && !a.readAt).length);

  private started = false;
  private subscriptions = new Subscription();

  /** Učitava i počinje da sluša promene; bezbedno je zvati više puta. */
  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    void this.load();

    const board = this.board;
    this.subscriptions.add(board.announcementCreated.subscribe((added) => {
      this.upsert({ ...added, forMe: true, readAt: null });
      this.toast.success(`Nova najava: ${added.title}`);
    }));
    this.subscriptions.add(board.announcementDeleted.subscribe((id) => this.remove(id)));
    this.subscriptions.add(board.announcementsChanged.subscribe(() => void this.load(false)));
    this.subscriptions.add(board.announcementRead.subscribe((read) =>
      this.items.update((list) =>
        list.map((a) =>
          a.id === read.announcementId && a.recipients
            ? { ...a, recipients: a.recipients.map((r) => (r.employeeId === read.employeeId ? { ...r, readAt: read.readAt } : r)) }
            : a,
        ),
      ),
    ));
    // Posle prekida veze (ili tek uspostavljene) se povlači ceo spisak, jer događaji mogu biti propušteni.
    this.subscriptions.add(board.reconnected.subscribe(() => void this.load(false)));
  }

  /** Zaustavlja se pri odjavi, da sledeći korisnik ne vidi tuđe najave i da se pretplate ne dupliraju. */
  stop(): void {
    this.subscriptions.unsubscribe();
    this.subscriptions = new Subscription();
    this.started = false;
    this.items.set([]);
    this.error.set('');
  }

  async load(showLoading = true): Promise<void> {
    if (showLoading) {
      this.loading.set(true);
    }
    this.error.set('');
    try {
      this.items.set(this.auth.isManager() ? await this.api.announcements() : await this.api.myAnnouncements());
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Najave nisu učitane.');
    } finally {
      this.loading.set(false);
    }
  }

  async markRead(announcement: Announcement): Promise<void> {
    await this.api.markAnnouncementRead(announcement.id);
    const readAt = new Date().toISOString();
    this.items.update((list) => list.map((a) => (a.id === announcement.id ? { ...a, readAt } : a)));
  }

  async delete(announcement: Announcement): Promise<void> {
    await this.api.deleteAnnouncement(announcement.id);
    this.remove(announcement.id);
  }

  /** Sačuvana najava se ubacuje odmah (ne čeka događaj) i bez duplikata. */
  added(announcement: Announcement): void {
    this.upsert(announcement);
  }

  private upsert(announcement: Announcement): void {
    this.items.update((list) =>
      [announcement, ...list.filter((a) => a.id !== announcement.id)].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    );
  }

  private remove(id: string): void {
    this.items.update((list) => list.filter((a) => a.id !== id));
  }
}
