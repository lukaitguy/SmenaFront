import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  Employee,
  Position,
  PublishRequest,
  RecurringShiftsRequest,
  RecurringShiftsResult,
  SaveShiftRequest,
  Shift,
  ShiftTemplate,
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
}

function range(from: Date, to: Date): HttpParams {
  return new HttpParams().set('from', from.toISOString()).set('to', to.toISOString());
}
