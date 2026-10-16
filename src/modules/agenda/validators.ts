import { ensure } from "./errors.ts";
import type { Settings, Service } from "./types.ts";
export function obj(value: unknown): Record<string, unknown> {
  ensure(
    value !== null && typeof value === "object" && !Array.isArray(value),
    "INPUT",
    "Dados inválidos.",
  );
  return value as Record<string, unknown>;
}
export function text(value: unknown, max = 100, optional = false) {
  ensure(
    typeof value === "string" &&
      value.trim().length <= max &&
      (optional || !!value.trim()) &&
      !/[<>\u0000-\u001f]/u.test(value),
    "TEXT",
    "Confira os campos de texto e seus limites.",
  );
  return value.trim();
}
export function number(value: unknown, min: number, max: number) {
  ensure(
    typeof value === "number" &&
      Number.isSafeInteger(value) &&
      value >= min &&
      value <= max,
    "NUMBER",
    "Número fora do intervalo permitido.",
  );
  return value;
}
export function bool(value: unknown) {
  ensure(typeof value === "boolean", "BOOLEAN", "Opção inválida.");
  return value;
}
export function email(value: unknown) {
  const result = text(value, 254).toLowerCase();
  ensure(
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result),
    "EMAIL",
    "Informe um e-mail válido.",
  );
  return result;
}
export function phone(value: unknown, optional = false) {
  const result = text(value, 30, optional);
  ensure(
    (optional && !result) || /^\+?[\d ()-]{8,30}$/.test(result),
    "PHONE",
    "Informe telefone com DDD.",
  );
  return result;
}
export function date(value: unknown) {
  const result = text(value, 10);
  const stamp = Date.parse(result + "T12:00:00Z");
  ensure(
    /^\d{4}-\d{2}-\d{2}$/.test(result) &&
      Number.isFinite(stamp) &&
      new Date(stamp).toISOString().slice(0, 10) === result,
    "DATE",
    "Data inválida.",
  );
  return result;
}
export function instant(value: unknown) {
  const result = text(value, 30);
  ensure(
    Number.isFinite(Date.parse(result)) &&
      new Date(result).toISOString() === result,
    "INSTANT",
    "Use uma data completa no formato UTC.",
  );
  return result;
}
export function password(value: unknown) {
  ensure(
    typeof value === "string" &&
      value.length >= 12 &&
      value.length <= 128 &&
      Buffer.byteLength(value) <= 256,
    "PASSWORD",
    "Use uma senha entre 12 e 128 caracteres.",
  );
  return value;
}
export function token(value: unknown) {
  const result = text(value, 100);
  ensure(
    /^[A-Za-z0-9_-]{43}$/.test(result),
    "TOKEN",
    "Link privado inválido.",
    404,
  );
  return result;
}
export function service(value: unknown, id: string): Service {
  const r = obj(value);
  return {
    id,
    name: text(r.name),
    description: text(r.description, 500, true),
    duration: number(r.duration, 5, 480),
    priceCents: number(r.priceCents, 0, 99999999),
    active: bool(r.active),
    sortOrder: number(r.sortOrder, 0, 999),
  };
}
export function settings(value: unknown): Settings {
  const r = obj(value),
    timeZone = text(r.timeZone, 100);
  try {
    new Intl.DateTimeFormat("en", { timeZone });
  } catch {
    ensure(false, "TIMEZONE", "Fuso inválido.");
  }
  ensure(
    typeof r.color === "string" && /^#[a-fA-F0-9]{6}$/.test(r.color),
    "COLOR",
    "Cor inválida.",
  );
  ensure(
    Array.isArray(r.weekly) && r.weekly.length <= 28,
    "WEEKLY",
    "Informe até quatro períodos por dia.",
  );
  const weekly = r.weekly.map((value) => {
    const p = obj(value),
      day = number(p.day, 0, 6),
      from = text(p.from, 5),
      to = text(p.to, 5);
    ensure(
      /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(from) &&
        /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(to) &&
        from < to,
      "HOURS",
      "Confira início e fim do expediente.",
    );
    return { day, from, to };
  });
  for (let day = 0; day < 7; day++) {
    const rows = weekly
      .filter((p) => p.day === day)
      .sort((a, b) => a.from.localeCompare(b.from));
    ensure(
      rows.length <= 4 && rows.every((p, i) => !i || rows[i - 1].to <= p.from),
      "HOURS",
      "Períodos de expediente não podem se sobrepor.",
    );
  }
  return {
    name: text(r.name),
    profession: text(r.profession),
    description: text(r.description, 1000, true),
    phone: phone(r.phone, true),
    email: r.email ? email(r.email) : "",
    address: text(r.address, 200, true),
    color: r.color,
    timeZone,
    leadMinutes: number(r.leadMinutes, 0, 10080),
    horizonDays: number(r.horizonDays, 1, 180),
    cancelHours: number(r.cancelHours, 0, 168),
    stepMinutes: number(r.stepMinutes, 5, 60),
    weekly,
    privacyNotice: text(r.privacyNotice, 1500),
  };
}
