import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { openDatabase } from "../src/modules/agenda/database.ts";
import { migrate } from "../src/modules/agenda/migrations.ts";
import { AuthService } from "../src/modules/agenda/services/auth.service.ts";
import { AgendaService } from "../src/modules/agenda/services/agenda.service.ts";
import {
  secretToken,
  hashPassword,
  verifyPassword,
} from "../src/modules/agenda/security.ts";
import {
  defaultSettings,
  wallInstant,
  dayBounds,
  availableSlots,
} from "../src/modules/agenda/policy.ts";
import * as v from "../src/modules/agenda/validators.ts";
export async function fixture(t, file = ":memory:") {
  const db = await openDatabase({ file });
  await migrate(db);
  t.after(() => db.close());
  let now = Date.parse("2026-10-16T12:00:00Z");
  const clock = () => now;
  const auth = new AuthService(db, clock),
    agenda = new AgendaService(db, clock),
    password = secretToken();
  const bootstrap = await auth.issueBootstrap();
  await auth.setup({
    token: bootstrap,
    email: "owner@example.com",
    password,
    name: "Ateliê do Tempo",
    profession: "Atendimento individual",
    serviceName: "Sessão inicial",
    duration: 30,
  });
  const service = (await agenda.dashboard("2026-10-19")).services[0];
  await agenda.saveService({ ...service, active: true, priceCents: 8000 });
  return {
    db,
    auth,
    agenda,
    service: { ...service, active: true, priceCents: 8000 },
    password,
    advance: (ms) => {
      now += ms;
    },
    now: clock,
  };
}
export function input(f, extra = {}) {
  return {
    serviceId: f.service.id,
    startsAt: "2026-10-19T12:00:00.000Z",
    name: "Cliente de teste",
    email: "client@example.com",
    phone: "11999999999",
    note: "",
    consent: true,
    website: "",
    requestToken: secretToken(),
    ...extra,
  };
}
test("fresh installation exposes no fake bookings and first service is paused", async (t) => {
  const db = await openDatabase({ file: ":memory:" });
  t.after(() => db.close());
  await migrate(db);
  const auth = new AuthService(db),
    agenda = new AgendaService(db);
  assert.equal((await agenda.publicInfo()).configured, false);
  assert.equal((await agenda.publicInfo()).services.length, 0);
  const token = await auth.issueBootstrap();
  await auth.setup({
    token,
    email: "a@example.com",
    password: secretToken(),
    name: "Meu espaço",
    profession: "Fotografia",
    serviceName: "Ensaio",
    duration: 60,
  });
  assert.equal((await agenda.publicInfo()).services.length, 0);
  assert.equal((await agenda.dashboard("2026-10-19")).bookings.length, 0);
});
test("bootstrap token is single-use and configuration cannot be taken over", async (t) => {
  const f = await fixture(t);
  assert.equal(await f.auth.issueBootstrap(), null);
  await assert.rejects(
    f.auth.setup({
      token: secretToken(),
      email: "x@example.com",
      password: secretToken(),
      name: "X",
      profession: "Y",
      serviceName: "Z",
      duration: 30,
    }),
    /concluída/,
  );
});
test("password hash is salted and verified without storing plaintext", () => {
  const a = hashPassword("a sufficiently long password"),
    b = hashPassword("a sufficiently long password");
  assert.notEqual(a, b);
  assert.equal(verifyPassword("a sufficiently long password", a), true);
  assert.equal(verifyPassword("another long password", a), false);
});
test("login creates real expiring sessions and logout invalidates", async (t) => {
  const f = await fixture(t);
  await assert.rejects(
    f.auth.login({ email: "owner@example.com", password: secretToken() }),
    /incorretos/,
  );
  const session = await f.auth.login({
    email: "owner@example.com",
    password: f.password,
  });
  assert.equal(await f.auth.authenticated(session.token), true);
  await f.auth.logout(session.token);
  assert.equal(await f.auth.authenticated(session.token), false);
  const other = await f.auth.login({
    email: "owner@example.com",
    password: f.password,
  });
  f.advance(8 * 3600000);
  assert.equal(await f.auth.authenticated(other.token), false);
});
test("password change and operator reset revoke all sessions", async (t) => {
  const f = await fixture(t),
    session = await f.auth.login({
      email: "owner@example.com",
      password: f.password,
    }),
    next = secretToken();
  await f.auth.changePassword(f.password, next);
  assert.equal(await f.auth.authenticated(session.token), false);
  const session2 = await f.auth.login({
    email: "owner@example.com",
    password: next,
  });
  await f.auth.resetPassword(secretToken());
  assert.equal(await f.auth.authenticated(session2.token), false);
});
test("availability respects weekday, breaks, duration and lead time", async (t) => {
  const f = await fixture(t),
    slots = await f.agenda.slots(f.service.id, "2026-10-19");
  assert.equal(slots[0].label, "09:00");
  assert.equal(slots.at(-1).label, "17:30");
  assert.equal(
    slots.some((s) => s.label === "12:00"),
    false,
  );
  assert.equal((await f.agenda.slots(f.service.id, "2026-10-18")).length, 0);
  assert.equal((await f.agenda.slots(f.service.id, "2026-10-15")).length, 0);
  assert.equal((await f.agenda.slots(f.service.id, "2027-10-19")).length, 0);
});
test("nonexistent DST wall times rejected; day bounds reflect timezone transitions", () => {
  assert.equal(wallInstant("2026-03-08", "02:30", "America/New_York"), null);
  const bounds = dayBounds("2026-03-08", "America/New_York");
  assert.equal(Date.parse(bounds.to) - Date.parse(bounds.from), 23 * 3600000);
});
test("reserve stores snapshot and only a hash of private token", async (t) => {
  const f = await fixture(t),
    data = input(f),
    result = await f.agenda.reserve(data);
  assert.equal(result.booking.status, "CONFIRMED");
  assert.equal(result.booking.priceCents, 8000);
  const row = (
    await f.db.transaction((sql) =>
      sql.all("SELECT token_hash,payload FROM agenda_bookings"),
    )
  )[0];
  assert.equal(row.token_hash.includes(data.requestToken), false);
  assert.equal(row.payload.includes(data.requestToken), false);
  assert.equal(
    (await f.agenda.privateBooking(data.requestToken)).booking.id,
    result.booking.id,
  );
});
test("concurrent same-slot reservations never double book", async (t) => {
  const f = await fixture(t),
    results = await Promise.allSettled([
      f.agenda.reserve(input(f)),
      f.agenda.reserve(input(f)),
    ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal((await f.agenda.dashboard("2026-10-19")).bookings.length, 1);
});
test("overlap blocked across different service durations; adjacent interval allowed", async (t) => {
  const f = await fixture(t);
  await f.agenda.reserve(input(f));
  await assert.rejects(
    f.agenda.reserve(input(f, { startsAt: "2026-10-19T12:15:00.000Z" })),
    /indisponível/,
  );
  const second = await f.agenda.reserve(
    input(f, { startsAt: "2026-10-19T12:30:00.000Z" }),
  );
  assert.equal(second.booking.startsAt, "2026-10-19T12:30:00.000Z");
});
test("repeated submission is idempotent, different data with same token rejected", async (t) => {
  const f = await fixture(t),
    data = input(f),
    a = await f.agenda.reserve(data),
    b = await f.agenda.reserve(data);
  assert.equal(a.booking.id, b.booking.id);
  await assert.rejects(
    f.agenda.reserve({ ...data, name: "Outro cliente" }),
    /outros dados/,
  );
});
test("cancel by private link releases slot and repeating cancellation is safe", async (t) => {
  const f = await fixture(t),
    data = input(f);
  await f.agenda.reserve(data);
  await f.agenda.customerCancel(data.requestToken);
  await f.agenda.customerCancel(data.requestToken);
  assert.equal(
    (await f.agenda.privateBooking(data.requestToken)).booking.status,
    "CANCELLED",
  );
  await f.agenda.reserve(input(f));
});
test("wrong private token cannot inspect or cancel a reservation", async (t) => {
  const f = await fixture(t);
  await f.agenda.reserve(input(f));
  await assert.rejects(
    f.agenda.privateBooking(secretToken()),
    /não encontrada/,
  );
  await assert.rejects(
    f.agenda.customerCancel(secretToken()),
    /não encontrada/,
  );
});
test("cancellation cutoff exact boundary and late cancellation rejected", async (t) => {
  const f = await fixture(t),
    data = input(f);
  await f.agenda.reserve(data);
  f.advance(Date.parse(data.startsAt) - f.now() - 2 * 3600000 + 1);
  assert.equal(
    (await f.agenda.privateBooking(data.requestToken)).canCancel,
    false,
  );
  await assert.rejects(f.agenda.customerCancel(data.requestToken), /Prazo/);
});
test("internal blocks hide availability and cannot silently overwrite appointments", async (t) => {
  const f = await fixture(t);
  await f.agenda.addBlock({
    startsAt: "2026-10-19T12:00:00.000Z",
    endsAt: "2026-10-19T13:00:00.000Z",
    reason: "Compromisso privado",
  });
  assert.equal(
    (await f.agenda.slots(f.service.id, "2026-10-19")).some(
      (s) => s.label === "09:00",
    ),
    false,
  );
  await assert.rejects(f.agenda.reserve(input(f)), /indisponível/);
  await f.agenda.reserve(input(f, { startsAt: "2026-10-19T13:00:00.000Z" }));
  await assert.rejects(
    f.agenda.addBlock({
      startsAt: "2026-10-19T13:00:00.000Z",
      endsAt: "2026-10-19T14:00:00.000Z",
      reason: "Sobreposição",
    }),
    /reservas/,
  );
});
test("remove block restores availability", async (t) => {
  const f = await fixture(t),
    block = await f.agenda.addBlock({
      startsAt: "2026-10-19T12:00:00.000Z",
      endsAt: "2026-10-19T13:00:00.000Z",
      reason: "Pausa",
    });
  await f.agenda.removeBlock(block.id);
  assert.equal(
    (await f.agenda.slots(f.service.id, "2026-10-19"))[0].label,
    "09:00",
  );
});
test("service edits never rewrite historical price/duration/name", async (t) => {
  const f = await fixture(t),
    data = input(f);
  await f.agenda.reserve(data);
  await f.agenda.saveService({
    ...f.service,
    name: "Novo nome",
    priceCents: 50000,
    duration: 60,
  });
  const original = (await f.agenda.privateBooking(data.requestToken)).booking;
  assert.equal(original.serviceName, "Sessão inicial");
  assert.equal(original.duration, 30);
  assert.equal(original.priceCents, 8000);
});
test("inactive service disappears publicly and cannot be booked", async (t) => {
  const f = await fixture(t);
  await f.agenda.saveService({ ...f.service, active: false });
  assert.equal((await f.agenda.publicInfo()).services.length, 0);
  await assert.rejects(f.agenda.reserve(input(f)), /indisponível/);
});
test("timezone cannot change while future reservations exist", async (t) => {
  const f = await fixture(t);
  await f.agenda.reserve(input(f));
  const { settings } = await f.agenda.dashboard("2026-10-19");
  await assert.rejects(
    f.agenda.saveSettings({ ...settings, timeZone: "Europe/Lisbon" }),
    /fuso/,
  );
});
test("admin cannot complete future appointment; revision protects stale writes", async (t) => {
  const f = await fixture(t),
    { booking } = await f.agenda.reserve(input(f));
  await assert.rejects(
    f.agenda.changeStatus({ id: booking.id, revision: 1, status: "COMPLETED" }),
    /Aguarde/,
  );
  await assert.rejects(
    f.agenda.changeStatus({ id: booking.id, revision: 2, status: "CANCELLED" }),
    /mudou/,
  );
  await f.agenda.changeStatus({
    id: booking.id,
    revision: 1,
    status: "CANCELLED",
  });
});
test("persistent limiter enforces window and recovers after expiry", async (t) => {
  const f = await fixture(t);
  assert.equal(await f.auth.limit("test", 1, 60), true);
  assert.equal(await f.auth.limit("test", 1, 60), false);
  f.advance(60001);
  assert.equal(await f.auth.limit("test", 1, 60), true);
});
test("SQL transaction rollback leaves no partial state", async (t) => {
  const f = await fixture(t);
  await assert.rejects(
    f.db.transaction(async (sql) => {
      await sql.run("DELETE FROM agenda_services");
      throw new Error("rollback");
    }),
  );
  assert.equal((await f.agenda.publicInfo()).services.length, 1);
});
test("personal details never appear in public settings/availability", async (t) => {
  const f = await fixture(t);
  await f.agenda.reserve(input(f));
  const serialized = JSON.stringify([
    await f.agenda.publicInfo(),
    await f.agenda.slots(f.service.id, "2026-10-19"),
  ]);
  assert.equal(serialized.includes("client@example.com"), false);
  assert.equal(serialized.includes("Cliente de teste"), false);
});
test("validator rejects invalid dates, HTML and overlapping schedules", () => {
  for (const value of ["2026-13-01", "2026-02-30", "x"])
    assert.throws(() => v.date(value));
  assert.throws(() => v.text("<script>"));
  assert.throws(() =>
    v.settings({
      ...defaultSettings,
      weekly: [
        { day: 1, from: "09:00", to: "12:00" },
        { day: 1, from: "11:00", to: "13:00" },
      ],
    }),
  );
});
test("consent, honeypot and non-canonical dates are enforced by backend", async (t) => {
  const f = await fixture(t);
  await assert.rejects(f.agenda.reserve(input(f, { consent: false })), /aviso/);
  await assert.rejects(
    f.agenda.reserve(input(f, { website: "bot" })),
    /formulário/,
  );
  await assert.rejects(
    f.agenda.reserve(input(f, { startsAt: "2026-10-19T09:00:00-03:00" })),
    /UTC/,
  );
});
test("data survives closing and reopening actual SQLite file", async (t) => {
  await mkdir("work", { recursive: true });
  const lab = await mkdtemp(resolve("work", "persist-")),
    file = resolve(lab, "agenda.sqlite"),
    f = await fixture({ after: () => {} }, file),
    data = input(f);
  await f.agenda.reserve(data);
  await f.db.close();
  const db = await openDatabase({ file });
  t.after(() => db.close());
  await migrate(db);
  const agenda = new AgendaService(db, () =>
    Date.parse("2026-10-16T12:00:00Z"),
  );
  assert.equal(
    (await agenda.privateBooking(data.requestToken)).booking.name,
    "Cliente de teste",
  );
  assert.equal((await agenda.dashboard("2026-10-19")).bookings.length, 1);
});
test("large cancelled history cannot hide a confirmed booking from conflict checking", async (t) => {
  const f = await fixture(t),
    { booking } = await f.agenda.reserve(
      input(f, { startsAt: "2026-10-19T12:30:00.000Z" }),
    );
  await f.db.transaction(async (sql) => {
    for (let i = 0; i < 501; i++) {
      const previous = {
        ...booking,
        id: "cancelled-" + i,
        startsAt: "2026-10-19T12:00:00.000Z",
        endsAt: "2026-10-19T12:30:00.000Z",
        status: "CANCELLED",
      };
      await sql.run(
        "INSERT INTO agenda_bookings(id,starts_at,ends_at,status,token_hash,request_hash,payload) VALUES(?,?,?,?,?,?,?)",
        [
          previous.id,
          previous.startsAt,
          previous.endsAt,
          previous.status,
          "cancel-token-" + i,
          "cancel-request-" + i,
          JSON.stringify(previous),
        ],
      );
    }
  });
  await assert.rejects(
    f.agenda.reserve(input(f, { startsAt: booking.startsAt })),
    /indisponível/,
  );
  assert.equal((await f.agenda.dashboard("2026-10-19")).bookings.length, 502);
});
