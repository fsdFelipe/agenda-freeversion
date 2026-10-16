import { randomUUID } from "node:crypto";
import type { Database, Sql, Booking, Block } from "../types.ts";
import * as repo from "../repository.ts";
import * as v from "../validators.ts";
import { ensure } from "../errors.ts";
import { availableSlots, dayBounds, localDay, addDays } from "../policy.ts";
import { digest } from "../security.ts";
export class AgendaService {
  db: Database;
  clock: () => number;
  constructor(db: Database, clock = Date.now) {
    this.db = db;
    this.clock = clock;
  }
  private async audit(sql: Sql, action: string, id: string) {
    await sql.run(
      "INSERT INTO agenda_audit(id,action,subject_id,created_at) VALUES(?,?,?,?)",
      [randomUUID(), action, id, new Date(this.clock()).toISOString()],
    );
  }
  async publicInfo() {
    return this.db.transaction(async (sql) => {
      const settings = await repo.getSettings(sql),
        configured = !!(await sql.all("SELECT id FROM agenda_admin WHERE id=1"))
          .length;
      return {
        settings,
        services: configured
          ? (await repo.getServices(sql)).filter((s) => s.active)
          : [],
        configured,
        today: localDay(this.clock(), settings.timeZone),
        edition: "free",
        schemaVersion: 1,
      };
    });
  }
  async slots(serviceId: unknown, dateValue: unknown) {
    const id = v.text(serviceId),
      day = v.date(dateValue);
    return this.db.transaction(async (sql) => {
      const settings = await repo.getSettings(sql),
        service = (await repo.getServices(sql)).find(
          (s) => s.id === id && s.active,
        );
      ensure(service, "SERVICE", "Serviço indisponível.", 404);
      const today = localDay(this.clock(), settings.timeZone);
      if (day < today || day > addDays(today, settings.horizonDays)) return [];
      const bounds = dayBounds(day, settings.timeZone);
      return availableSlots(
        settings,
        service,
        day,
        await repo.getBookings(sql, bounds.from, bounds.to),
        await repo.getBlocks(sql, bounds.from, bounds.to),
        this.clock(),
      );
    });
  }
  async reserve(input: unknown) {
    const row = v.obj(input),
      serviceId = v.text(row.serviceId),
      startsAt = v.instant(row.startsAt),
      name = v.text(row.name),
      email = v.email(row.email),
      phone = v.phone(row.phone),
      note = v.text(row.note ?? "", 500, true),
      requestToken = v.token(row.requestToken);
    ensure(
      row.consent === true,
      "CONSENT",
      "Confirme que leu o aviso de uso dos seus dados.",
    );
    ensure(!row.website, "BOT", "Não foi possível enviar o formulário.", 400);
    return this.db.transaction(async (sql) => {
      ensure(
        (await sql.all("SELECT id FROM agenda_admin WHERE id=1")).length,
        "SETUP",
        "Agenda ainda não configurada.",
        409,
      );
      const old = (
        await sql.all<{ payload: string }>(
          "SELECT payload FROM agenda_bookings WHERE request_hash=?",
          [digest("request:" + requestToken)],
        )
      )[0];
      if (old) {
        const booking = JSON.parse(old.payload) as Booking;
        ensure(
          booking.serviceId === serviceId &&
            booking.startsAt === startsAt &&
            booking.name === name &&
            booking.email === email &&
            booking.phone === phone &&
            booking.note === note,
          "IDEMPOTENCY",
          "Este envio já foi utilizado com outros dados.",
          409,
        );
        return { booking, token: requestToken };
      }
      const settings = await repo.getSettings(sql),
        service = (await repo.getServices(sql)).find(
          (s) => s.id === serviceId && s.active,
        );
      ensure(service, "SERVICE", "Serviço indisponível.", 404);
      const day = localDay(Date.parse(startsAt), settings.timeZone),
        bounds = dayBounds(day, settings.timeZone);
      const slot = availableSlots(
        settings,
        service,
        day,
        await repo.getBookings(sql, bounds.from, bounds.to),
        await repo.getBlocks(sql, bounds.from, bounds.to),
        this.clock(),
      ).find((s) => s.startsAt === startsAt);
      ensure(
        slot,
        "UNAVAILABLE",
        "Este horário acabou de ficar indisponível. Escolha outro.",
        409,
      );
      const booking: Booking = {
        id: randomUUID(),
        professionalId: "owner",
        serviceId,
        serviceName: service.name,
        duration: service.duration,
        priceCents: service.priceCents,
        name,
        email,
        phone,
        note,
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
        status: "CONFIRMED",
        createdAt: new Date(this.clock()).toISOString(),
        cancelledAt: null,
        revision: 1,
      };
      await sql.run(
        "INSERT INTO agenda_bookings(id,starts_at,ends_at,status,token_hash,request_hash,payload) VALUES(?,?,?,?,?,?,?)",
        [
          booking.id,
          booking.startsAt,
          booking.endsAt,
          booking.status,
          digest("booking:" + requestToken),
          digest("request:" + requestToken),
          JSON.stringify(booking),
        ],
      );
      await this.audit(sql, "BOOKING_CREATED", booking.id);
      return { booking, token: requestToken };
    });
  }
  async privateBooking(tokenValue: unknown) {
    const token = v.token(tokenValue);
    return this.db.transaction(async (sql) => {
      const row = (
        await sql.all<{ payload: string }>(
          "SELECT payload FROM agenda_bookings WHERE token_hash=?",
          [digest("booking:" + token)],
        )
      )[0];
      ensure(
        row,
        "NOT_FOUND",
        "Reserva não encontrada. Confira seu link privado.",
        404,
      );
      const booking = JSON.parse(row.payload) as Booking,
        settings = await repo.getSettings(sql);
      return {
        booking,
        settings,
        canCancel:
          booking.status === "CONFIRMED" &&
          Date.parse(booking.startsAt) - this.clock() >=
            settings.cancelHours * 3600000,
      };
    });
  }
  async customerCancel(tokenValue: unknown) {
    const token = v.token(tokenValue);
    return this.db.transaction(async (sql) => {
      const row = (
        await sql.all<{ payload: string }>(
          "SELECT payload FROM agenda_bookings WHERE token_hash=?",
          [digest("booking:" + token)],
        )
      )[0];
      ensure(row, "NOT_FOUND", "Reserva não encontrada.", 404);
      const booking = JSON.parse(row.payload) as Booking,
        settings = await repo.getSettings(sql);
      if (booking.status === "CANCELLED") return booking;
      ensure(
        booking.status === "CONFIRMED" &&
          Date.parse(booking.startsAt) - this.clock() >=
            settings.cancelHours * 3600000,
        "CANCELLATION",
        "Prazo de cancelamento online encerrado. Entre em contato com o profissional.",
        409,
      );
      booking.status = "CANCELLED";
      booking.cancelledAt = new Date(this.clock()).toISOString();
      booking.revision++;
      await repo.updateBooking(sql, booking);
      await this.audit(sql, "CUSTOMER_CANCELLED", booking.id);
      return booking;
    });
  }
  async dashboard(dayValue: unknown) {
    return this.db.transaction(async (sql) => {
      const settings = await repo.getSettings(sql),
        day = dayValue
          ? v.date(dayValue)
          : localDay(this.clock(), settings.timeZone),
        bounds = dayBounds(day, settings.timeZone);
      return {
        settings,
        services: await repo.getServices(sql),
        bookings: await repo.getBookings(sql, bounds.from, bounds.to),
        blocks: await repo.getBlocks(sql, bounds.from, bounds.to),
        day,
        edition: "free",
        schemaVersion: 1,
      };
    });
  }
  async saveService(input: unknown) {
    const row = v.obj(input),
      service = v.service(row, row.id ? v.text(row.id) : randomUUID());
    return this.db.transaction(async (sql) => {
      await sql.run(
        "INSERT INTO agenda_services(id,payload) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload",
        [service.id, JSON.stringify(service)],
      );
      await this.audit(sql, "SERVICE_SAVED", service.id);
      return service;
    });
  }
  async saveSettings(input: unknown) {
    const settings = v.settings(input);
    return this.db.transaction(async (sql) => {
      const previous = await repo.getSettings(sql);
      if (previous.timeZone !== settings.timeZone)
        ensure(
          !(
            await sql.all(
              "SELECT id FROM agenda_bookings WHERE status='CONFIRMED' AND ends_at>?",
              [new Date(this.clock()).toISOString()],
            )
          ).length,
          "TIMEZONE",
          "Cancele ou conclua as reservas futuras antes de alterar o fuso.",
          409,
        );
      await sql.run("UPDATE agenda_settings SET payload=? WHERE id=1", [
        JSON.stringify(settings),
      ]);
      await this.audit(sql, "SETTINGS_SAVED", "owner");
      return settings;
    });
  }
  async addBlock(input: unknown) {
    const row = v.obj(input),
      startsAt = v.instant(row.startsAt),
      endsAt = v.instant(row.endsAt),
      reason = v.text(row.reason, 200);
    ensure(
      endsAt > startsAt &&
        Date.parse(endsAt) - Date.parse(startsAt) <= 366 * 86400000,
      "BLOCK",
      "Confira o período, limitado a um ano.",
    );
    return this.db.transaction(async (sql) => {
      ensure(
        !(await repo.getBookings(sql, startsAt, endsAt)).some(
          (b) => b.status === "CONFIRMED",
        ),
        "BLOCK_CONFLICT",
        "Existem reservas nesse período. Resolva-as antes de bloquear.",
        409,
      );
      const block: Block = { id: randomUUID(), startsAt, endsAt, reason };
      await sql.run(
        "INSERT INTO agenda_blocks(id,starts_at,ends_at,payload) VALUES(?,?,?,?)",
        [block.id, startsAt, endsAt, JSON.stringify(block)],
      );
      await this.audit(sql, "BLOCK_CREATED", block.id);
      return block;
    });
  }
  async removeBlock(idValue: unknown) {
    const id = v.text(idValue);
    await this.db.transaction(async (sql) => {
      await sql.run("DELETE FROM agenda_blocks WHERE id=?", [id]);
      await this.audit(sql, "BLOCK_REMOVED", id);
    });
  }
  async changeStatus(input: unknown) {
    const row = v.obj(input),
      id = v.text(row.id),
      revision = v.number(row.revision, 1, 999999),
      status = v.text(row.status);
    ensure(
      ["CANCELLED", "COMPLETED", "NO_SHOW"].includes(status),
      "STATUS",
      "Estado inválido.",
    );
    return this.db.transaction(async (sql) => {
      const booking = await repo.getBooking(sql, id);
      ensure(booking, "NOT_FOUND", "Reserva não encontrada.", 404);
      ensure(
        booking.revision === revision,
        "REVISION",
        "A reserva mudou. Atualize a agenda.",
        409,
      );
      ensure(
        booking.status === "CONFIRMED",
        "STATUS",
        "Reserva já encerrada.",
        409,
      );
      if (status !== "CANCELLED")
        ensure(
          Date.parse(booking.startsAt) <= this.clock(),
          "STATUS",
          "Aguarde o horário do atendimento.",
          409,
        );
      booking.status = status as Booking["status"];
      booking.revision++;
      if (status === "CANCELLED")
        booking.cancelledAt = new Date(this.clock()).toISOString();
      await repo.updateBooking(sql, booking);
      await this.audit(sql, "ADMIN_" + status, id);
      return booking;
    });
  }
}
