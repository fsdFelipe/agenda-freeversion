import type { Settings, Service, Booking, Block, Slot } from "./types.ts";
import { ensure } from "./errors.ts";
export const defaultSettings: Settings = {
  name: "Seu espaço",
  profession: "Atendimento com hora marcada",
  description:
    "Escolha o serviço e reserve seu melhor horário. Sem espera, com atenção a cada detalhe.",
  phone: "",
  email: "",
  address: "",
  color: "#38574b",
  timeZone: "America/Sao_Paulo",
  leadMinutes: 60,
  horizonDays: 60,
  cancelHours: 2,
  stepMinutes: 15,
  weekly: [1, 2, 3, 4, 5].flatMap((day) => [
    { day, from: "09:00", to: "12:00" },
    { day, from: "13:00", to: "18:00" },
  ]),
  privacyNotice:
    "Usamos nome e contato para organizar e administrar seu atendimento. Não informe dados sensíveis no campo de observações.",
};
export function localDay(ms: number, timeZone: string) {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(ms);
  const part = (type: string) => p.find((item) => item.type === type)!.value;
  return part("year") + "-" + part("month") + "-" + part("day");
}
export function addDays(date: string, days: number) {
  return new Date(Date.parse(date + "T12:00:00Z") + days * 86400000)
    .toISOString()
    .slice(0, 10);
}
export function wallInstant(
  date: string,
  time: string,
  timeZone: string,
): number | null {
  const target = Date.parse(date + "T" + time + ":00Z");
  let utc = target;
  for (let i = 0; i < 6; i++) {
    const p = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(utc);
    const n = (key: string) =>
      Number(p.find((item) => item.type === key)!.value);
    const local = Date.UTC(
      n("year"),
      n("month") - 1,
      n("day"),
      n("hour"),
      n("minute"),
      n("second"),
    );
    if (local === target) return utc;
    utc += target - local;
  }
  return null;
}
export function dayBounds(date: string, zone: string) {
  const from = wallInstant(date, "00:00", zone),
    to = wallInstant(addDays(date, 1), "00:00", zone);
  ensure(
    from !== null && to !== null,
    "DATE",
    "Não foi possível determinar este dia no fuso configurado.",
  );
  return { from: new Date(from).toISOString(), to: new Date(to).toISOString() };
}
export const overlaps = (a: number, b: number, c: number, d: number) =>
  a < d && c < b;
export function availableSlots(
  settings: Settings,
  service: Service,
  date: string,
  bookings: Booking[],
  blocks: Block[],
  now = Date.now(),
): Slot[] {
  const today = localDay(now, settings.timeZone);
  if (
    !service.active ||
    date < today ||
    date > addDays(today, settings.horizonDays)
  )
    return [];
  const weekday = new Date(date + "T12:00:00Z").getUTCDay();
  const slots: Slot[] = [];
  for (const period of settings.weekly.filter((p) => p.day === weekday)) {
    const periodEnd = wallInstant(date, period.to, settings.timeZone);
    if (periodEnd === null) continue;
    const [fh, fm] = period.from.split(":").map(Number),
      [th, tm] = period.to.split(":").map(Number);
    for (
      let minute = fh * 60 + fm;
      minute + service.duration <= th * 60 + tm;
      minute += settings.stepMinutes
    ) {
      const label =
        String(Math.floor(minute / 60)).padStart(2, "0") +
        ":" +
        String(minute % 60).padStart(2, "0");
      const start = wallInstant(date, label, settings.timeZone);
      if (start === null) continue;
      const end = start + service.duration * 60000;
      if (end > periodEnd) continue;
      if (start < now + settings.leadMinutes * 60000) continue;
      if (
        bookings.some(
          (b) =>
            b.status === "CONFIRMED" &&
            overlaps(start, end, Date.parse(b.startsAt), Date.parse(b.endsAt)),
        )
      )
        continue;
      if (
        blocks.some((b) =>
          overlaps(start, end, Date.parse(b.startsAt), Date.parse(b.endsAt)),
        )
      )
        continue;
      slots.push({
        startsAt: new Date(start).toISOString(),
        endsAt: new Date(end).toISOString(),
        label,
      });
    }
  }
  return slots.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}
