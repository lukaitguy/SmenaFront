/** Tipovi koji odgovaraju DTO-ovima iz Smena API-ja (JSON je camelCase, enumi su stringovi). */

export type Role = 'Staff' | 'Manager' | 'Owner';

export interface Position {
  id: string;
  name: string;
}

export interface CurrentUser {
  employeeId: string;
  firstName: string;
  lastName: string;
  role: Role;
  restaurantId: string;
  restaurantName: string;
  restaurantTimeZoneId: string;
  positions: Position[];
}

export interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  role: Role;
  status: 'Active' | 'Inactive';
  positions: Position[];
}

export interface Shift {
  id: string;
  /** null je otvorena smena, bez zaposlenog. */
  employeeId: string | null;
  employeeName: string | null;
  positionId: string;
  positionName: string;
  startsAt: string;
  endsAt: string;
  note: string | null;
  seriesId: string | null;
  /** null je nacrt: vidi ga samo menadžer. */
  publishedAt: string | null;
  /** Šablon po kome je smena napravljena (npr. "I"); null je smena sa proizvoljnim vremenom (Od-Do). */
  templateId: string | null;
  templateName: string | null;
}

/** Unapred definisana smena jedne pozicije; vreme je lokalno vreme restorana ("HH:mm:ss"). */
export interface ShiftTemplate {
  id: string;
  positionId: string;
  positionName: string;
  name: string;
  startTime: string;
  endTime: string;
  endsNextDay: boolean;
}

export interface AccessTokenResponse {
  accessToken: string;
  expiresAt: string;
}

export interface SaveShiftRequest {
  employeeId: string | null;
  positionId: string;
  startsAt: string;
  endsAt: string;
  note: string | null;
  templateId?: string | null;
}

export interface RecurringShiftsRequest {
  employeeId: string | null;
  positionId: string;
  fromDate: string;
  untilDate: string;
  daysOfWeek: string[];
  startTime: string;
  endTime: string;
  note: string | null;
  onConflict: 'Fail' | 'Skip';
  templateId?: string | null;
}

export interface RecurringShiftsResult {
  seriesId: string;
  created: number;
  skipped: string[];
  shifts: Shift[];
}

export interface PublishRequest {
  from: string;
  to: string;
  positionIds: string[];
}

export interface RegisterRequest {
  restaurantName: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  timeZoneId?: string | null;
}

export type DayOffStatus = 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';

export interface DayOff {
  id: string;
  status: DayOffStatus;
  /** Kalendarski dan "YYYY-MM-DD" u zoni restorana. */
  date: string;
  employeeId: string;
  employeeName: string;
  reason: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Želja radnika za dan: "mogu smenu {preferredShift} ili sam slobodan". Važi odmah i ništa ne blokira. */
export interface Wish {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string;
  preferredShift: string;
  createdAt: string;
}

/** Pending čeka kolegu, Accepted čeka menadžera. */
export type SwapStatus = 'Pending' | 'Accepted' | 'Declined' | 'Approved' | 'Rejected' | 'Cancelled';

/** Prepuštanje smene kolegi, ili razmena kad postoji targetShiftId. */
export interface Swap {
  id: string;
  status: SwapStatus;
  shiftId: string;
  shiftStartsAt: string;
  shiftEndsAt: string;
  positionName: string;
  requesterId: string;
  requesterName: string;
  targetId: string;
  targetName: string;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  targetShiftId: string | null;
  targetShiftStartsAt: string | null;
  targetShiftEndsAt: string | null;
  targetPositionName: string | null;
}

export type ClaimStatus = 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';

/** Zahtev zaposlenog da preuzme otvorenu smenu. */
export interface Claim {
  id: string;
  status: ClaimStatus;
  shiftId: string;
  shiftStartsAt: string;
  shiftEndsAt: string;
  positionName: string;
  employeeId: string;
  employeeName: string;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Stavka sa 86 liste: nema je na stanju. Odeljak je pozicija Kuvar (kuhinja) ili Šanker (šank). */
export interface EightySixItem {
  id: string;
  positionId: string;
  positionName: string;
  name: string;
  note: string | null;
  createdByEmployeeId: string;
  createdByName: string;
  createdAt: string;
}
