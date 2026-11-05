import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  Announcement,
  Claim,
  CreateAnnouncementRequest,
  EightySixItem,
  ClaimStatus,
  DayOff,
  DayOffStatus,
  Employee,
  Position,
  PublishRequest,
  RecurringShiftsRequest,
  RecurringShiftsResult,
  SaveShiftRequest,
  Shift,
  ShiftTemplate,
  Swap,
  SwapStatus,
  Wish,
} from './models';

/** Tanak omotač oko HTTP poziva ka Smena API-ju. Auth pozivi su u AuthService. */
@Injectable({ providedIn: 'root' })
export class SmenaApi {
  private readonly http = inject(HttpClient);

  positions(): Promise<Position[]> {
    return firstValueFrom(this.http.get<Position[]>('/api/positions'));
  }

  shiftTemplates(): Promise<ShiftTemplate[]> {
    return firstValueFrom(this.http.get<ShiftTemplate[]>('/api/shift-templates'));
  }

  employees(): Promise<Employee[]> {
    return firstValueFrom(this.http.get<Employee[]>('/api/employees'));
  }

  /** Raspored restorana za menadžera, uključujući nacrte. */
  managerShifts(from: Date, to: Date): Promise<Shift[]> {
    return firstValueFrom(this.http.get<Shift[]>('/api/shifts', { params: range(from, to) }));
  }

  myShifts(from: Date, to: Date): Promise<Shift[]> {
    return firstValueFrom(this.http.get<Shift[]>('/api/shifts/mine', { params: range(from, to) }));
  }

  /** Objavljen raspored uloga prijavljenog zaposlenog. */
  roster(from: Date, to: Date, positionId?: string): Promise<Shift[]> {
    let params = range(from, to);
    if (positionId) {
      params = params.set('positionId', positionId);
    }
    return firstValueFrom(this.http.get<Shift[]>('/api/schedule', { params }));
  }

  createShift(request: SaveShiftRequest): Promise<Shift> {
    return firstValueFrom(this.http.post<Shift>('/api/shifts', request));
  }

  updateShift(id: string, request: SaveShiftRequest): Promise<Shift> {
    return firstValueFrom(this.http.put<Shift>(`/api/shifts/${id}`, request));
  }

  deleteShift(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`/api/shifts/${id}`));
  }

  createRecurring(request: RecurringShiftsRequest): Promise<RecurringShiftsResult> {
    return firstValueFrom(this.http.post<RecurringShiftsResult>('/api/shifts/recurring', request));
  }

  publish(request: PublishRequest): Promise<{ published: number; employeesNotified: number }> {
    return firstValueFrom(this.http.post<{ published: number; employeesNotified: number }>('/api/shifts/publish', request));
  }

  unpublish(request: PublishRequest): Promise<{ unpublished: number; swapRequestsRemoved: number; claimRequestsRemoved: number }> {
    return firstValueFrom(
      this.http.post<{ unpublished: number; swapRequestsRemoved: number; claimRequestsRemoved: number }>(
        '/api/shifts/unpublish',
        request,
      ),
    );
  }

  requestDayOff(date: string, reason: string | null): Promise<DayOff> {
    return firstValueFrom(this.http.post<DayOff>('/api/dayoffs', { date, reason }));
  }

  myDayOffs(from: string, to: string): Promise<DayOff[]> {
    return firstValueFrom(this.http.get<DayOff[]>('/api/dayoffs/mine', { params: { from, to } }));
  }

  /** Zahtevi cele ekipe (menadžer), opciono samo sa jednim statusom. */
  dayOffs(status?: DayOffStatus): Promise<DayOff[]> {
    return firstValueFrom(this.http.get<DayOff[]>('/api/dayoffs', { params: status ? { status } : {} }));
  }

  cancelDayOff(id: string): Promise<DayOff> {
    return firstValueFrom(this.http.post<DayOff>(`/api/dayoffs/${id}/cancel`, null));
  }

  decideDayOff(id: string, decision: 'approve' | 'reject'): Promise<DayOff> {
    return firstValueFrom(this.http.post<DayOff>(`/api/dayoffs/${id}/${decision}`, null));
  }

  saveWish(date: string, preferredShift: string): Promise<Wish> {
    return firstValueFrom(this.http.put<Wish>('/api/wishes', { date, preferredShift }));
  }

  myWishes(from: string, to: string): Promise<Wish[]> {
    return firstValueFrom(this.http.get<Wish[]>('/api/wishes/mine', { params: { from, to } }));
  }

  /** Želje cele ekipe (menadžer) u periodu. */
  wishes(from: string, to: string): Promise<Wish[]> {
    return firstValueFrom(this.http.get<Wish[]>('/api/wishes', { params: { from, to } }));
  }

  deleteWish(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`/api/wishes/${id}`));
  }

  eightySix(): Promise<EightySixItem[]> {
    return firstValueFrom(this.http.get<EightySixItem[]>('/api/eighty-six'));
  }

  addEightySix(positionId: string, name: string, note: string | null = null): Promise<EightySixItem> {
    return firstValueFrom(this.http.post<EightySixItem>('/api/eighty-six', { positionId, name, note }));
  }

  removeEightySix(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`/api/eighty-six/${id}`));
  }

  /** Sve najave sa spiskom ko je pročitao (menadžer). */
  announcements(): Promise<Announcement[]> {
    return firstValueFrom(this.http.get<Announcement[]>('/api/announcements'));
  }

  myAnnouncements(): Promise<Announcement[]> {
    return firstValueFrom(this.http.get<Announcement[]>('/api/announcements/mine'));
  }

  createAnnouncement(request: CreateAnnouncementRequest): Promise<Announcement> {
    return firstValueFrom(this.http.post<Announcement>('/api/announcements', request));
  }

  markAnnouncementRead(id: string): Promise<void> {
    return firstValueFrom(this.http.post<void>(`/api/announcements/${id}/read`, null));
  }

  deleteAnnouncement(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`/api/announcements/${id}`));
  }

  /** Otvorene smene koje prijavljeni zaposleni može da traži (njegove pozicije, tek počinju). */
  openShifts(from: Date, to: Date): Promise<Shift[]> {
    return firstValueFrom(this.http.get<Shift[]>('/api/shifts/open', { params: range(from, to) }));
  }

  claimShift(shiftId: string, note: string | null): Promise<Claim> {
    return firstValueFrom(this.http.post<Claim>(`/api/shifts/${shiftId}/claims`, { note }));
  }

  myClaims(status?: ClaimStatus): Promise<Claim[]> {
    return firstValueFrom(this.http.get<Claim[]>('/api/claims/mine', { params: status ? { status } : {} }));
  }

  claims(status?: ClaimStatus): Promise<Claim[]> {
    return firstValueFrom(this.http.get<Claim[]>('/api/claims', { params: status ? { status } : {} }));
  }

  cancelClaim(id: string): Promise<Claim> {
    return firstValueFrom(this.http.post<Claim>(`/api/claims/${id}/cancel`, null));
  }

  decideClaim(id: string, decision: 'approve' | 'reject'): Promise<Claim> {
    return firstValueFrom(this.http.post<Claim>(`/api/claims/${id}/${decision}`, null));
  }

  /** Prepuštanje smene kolegi (targetEmployeeId) ili razmena za njegovu smenu (targetShiftId). */
  createSwap(request: { shiftId: string; targetEmployeeId: string | null; targetShiftId: string | null; note: string | null }): Promise<Swap> {
    return firstValueFrom(this.http.post<Swap>('/api/swaps', request));
  }

  mySwaps(status?: SwapStatus): Promise<Swap[]> {
    return firstValueFrom(this.http.get<Swap[]>('/api/swaps/mine', { params: status ? { status } : {} }));
  }

  swaps(status?: SwapStatus): Promise<Swap[]> {
    return firstValueFrom(this.http.get<Swap[]>('/api/swaps', { params: status ? { status } : {} }));
  }

  respondToSwap(id: string, action: 'accept' | 'decline' | 'cancel'): Promise<Swap> {
    return firstValueFrom(this.http.post<Swap>(`/api/swaps/${id}/${action}`, null));
  }

  decideSwap(id: string, decision: 'approve' | 'reject'): Promise<Swap> {
    return firstValueFrom(this.http.post<Swap>(`/api/swaps/${id}/${decision}`, null));
  }
}

function range(from: Date, to: Date): HttpParams {
  return new HttpParams().set('from', from.toISOString()).set('to', to.toISOString());
}
