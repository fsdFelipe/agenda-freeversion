export type Period = { day: number; from: string; to: string };
export type Settings = {
  name: string;
  profession: string;
  description: string;
  phone: string;
  email: string;
  address: string;
  color: string;
  timeZone: string;
  leadMinutes: number;
  horizonDays: number;
  cancelHours: number;
  stepMinutes: number;
  weekly: Period[];
  privacyNotice: string;
};
export type Service = {
  id: string;
  name: string;
  description: string;
  duration: number;
  priceCents: number;
  active: boolean;
  sortOrder: number;
};
export type Booking = {
  id: string;
  professionalId: "owner";
  serviceId: string;
  serviceName: string;
  duration: number;
  priceCents: number;
  name: string;
  email: string;
  phone: string;
  note: string;
  startsAt: string;
  endsAt: string;
  status: "CONFIRMED" | "CANCELLED" | "COMPLETED" | "NO_SHOW";
  createdAt: string;
  cancelledAt: string | null;
  revision: number;
};
export type Block = {
  id: string;
  startsAt: string;
  endsAt: string;
  reason: string;
};
export type Slot = { startsAt: string; endsAt: string; label: string };
export type DbValue = string | number | null;
export interface Sql {
  all<T>(statement: string, params?: DbValue[]): Promise<T[]>;
  run(statement: string, params?: DbValue[]): Promise<void>;
}
export interface Database {
  transaction<T>(work: (sql: Sql) => Promise<T>): Promise<T>;
  close(): Promise<void>;
  kind: "sqlite" | "postgres";
}
