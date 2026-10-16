import { randomUUID } from "node:crypto";
import type { Database } from "../types.ts";
import { ensure } from "../errors.ts";
import * as v from "../validators.ts";
import {
  digest,
  secretToken,
  hashPassword,
  verifyPassword,
} from "../security.ts";
import { defaultSettings } from "../policy.ts";
export class AuthService {
  db: Database;
  clock: () => number;
  constructor(db: Database, clock = Date.now) {
    this.db = db;
    this.clock = clock;
  }
  async initialized() {
    return this.db.transaction(
      async (sql) =>
        !!(await sql.all("SELECT id FROM agenda_admin WHERE id=1")).length,
    );
  }
  async issueBootstrap() {
    return this.db.transaction(async (sql) => {
      if ((await sql.all("SELECT id FROM agenda_admin WHERE id=1")).length)
        return null;
      const token = secretToken();
      await sql.run(
        "INSERT INTO agenda_bootstrap(id,token_hash,expires_at) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET token_hash=excluded.token_hash,expires_at=excluded.expires_at",
        [digest(token), new Date(this.clock() + 30 * 60000).toISOString()],
      );
      return token;
    });
  }
  async setup(input: unknown) {
    const row = v.obj(input),
      token = v.token(row.token),
      email = v.email(row.email),
      password = v.password(row.password);
    const name = v.text(row.name),
      profession = v.text(row.profession),
      serviceName = v.text(row.serviceName),
      duration = v.number(row.duration, 5, 480);
    await this.db.transaction(async (sql) => {
      ensure(
        !(await sql.all("SELECT id FROM agenda_admin WHERE id=1")).length,
        "INITIALIZED",
        "A configuração inicial já foi concluída.",
        409,
      );
      const record = (
        await sql.all<{ token_hash: string; expires_at: string }>(
          "SELECT token_hash,expires_at FROM agenda_bootstrap WHERE id=1",
        )
      )[0];
      ensure(
        record &&
          record.token_hash === digest(token) &&
          record.expires_at > new Date(this.clock()).toISOString(),
        "SETUP_TOKEN",
        "Link de configuração inválido ou vencido. Execute novamente a preparação no servidor.",
        403,
      );
      await sql.run(
        "INSERT INTO agenda_admin(id,email,password_hash) VALUES(1,?,?)",
        [email, hashPassword(password)],
      );
      await sql.run("UPDATE agenda_settings SET payload=? WHERE id=1", [
        JSON.stringify({ ...defaultSettings, name, profession }),
      ]);
      const serviceId = randomUUID();
      await sql.run("INSERT INTO agenda_services(id,payload) VALUES(?,?)", [
        serviceId,
        JSON.stringify({
          id: serviceId,
          name: serviceName,
          description: "",
          duration,
          priceCents: 0,
          active: false,
          sortOrder: 0,
        }),
      ]);
      await sql.run("DELETE FROM agenda_bootstrap WHERE id=1");
    });
  }
  async login(input: unknown) {
    const row = v.obj(input),
      email = v.email(row.email),
      password = v.password(row.password);
    return this.db.transaction(async (sql) => {
      const admin = (
        await sql.all<{ email: string; password_hash: string }>(
          "SELECT email,password_hash FROM agenda_admin WHERE id=1",
        )
      )[0];
      const valid = admin
        ? verifyPassword(password, admin.password_hash) && email === admin.email
        : false;
      ensure(valid, "LOGIN", "E-mail ou senha incorretos.", 401);
      const token = secretToken(),
        now = new Date(this.clock()).toISOString(),
        expiresAt = new Date(this.clock() + 8 * 3600000).toISOString();
      await sql.run("DELETE FROM agenda_sessions WHERE expires_at<=?", [now]);
      await sql.run(
        "INSERT INTO agenda_sessions(token_hash,expires_at) VALUES(?,?)",
        [digest(token), expiresAt],
      );
      return { token, expiresAt };
    });
  }
  async authenticated(token: string | null) {
    if (!token || !/^[\w-]{43}$/.test(token)) return false;
    return this.db.transaction(
      async (sql) =>
        !!(
          await sql.all(
            "SELECT token_hash FROM agenda_sessions WHERE token_hash=? AND expires_at>?",
            [digest(token), new Date(this.clock()).toISOString()],
          )
        ).length,
    );
  }
  async logout(token: string | null) {
    if (token)
      await this.db.transaction((sql) =>
        sql.run("DELETE FROM agenda_sessions WHERE token_hash=?", [
          digest(token),
        ]),
      );
  }
  async changePassword(current: unknown, next: unknown) {
    const password = v.password(current),
      newPassword = v.password(next);
    await this.db.transaction(async (sql) => {
      const admin = (
        await sql.all<{ password_hash: string }>(
          "SELECT password_hash FROM agenda_admin WHERE id=1",
        )
      )[0];
      ensure(
        admin && verifyPassword(password, admin.password_hash),
        "PASSWORD",
        "Senha atual incorreta.",
        403,
      );
      await sql.run("UPDATE agenda_admin SET password_hash=? WHERE id=1", [
        hashPassword(newPassword),
      ]);
      await sql.run("DELETE FROM agenda_sessions");
    });
  }
  /** Operator-only CLI recovery, never exposed as a public HTTP action. */
  async resetPassword(next: unknown) {
    const password = v.password(next);
    await this.db.transaction(async (sql) => {
      ensure(
        (await sql.all("SELECT id FROM agenda_admin WHERE id=1")).length,
        "ADMIN",
        "Primeiro conclua a configuração.",
        409,
      );
      await sql.run("UPDATE agenda_admin SET password_hash=? WHERE id=1", [
        hashPassword(password),
      ]);
      await sql.run("DELETE FROM agenda_sessions");
    });
  }
  async limit(key: string, max: number, seconds: number) {
    return this.db.transaction(async (sql) => {
      const now = new Date(this.clock()).toISOString();
      await sql.run("DELETE FROM agenda_limits WHERE expires_at<=?", [now]);
      const id = digest(key),
        row = (
          await sql.all<{ hits: number }>(
            "SELECT hits FROM agenda_limits WHERE id=?",
            [id],
          )
        )[0];
      if (row && row.hits >= max) return false;
      if (row)
        await sql.run("UPDATE agenda_limits SET hits=hits+1 WHERE id=?", [id]);
      else
        await sql.run(
          "INSERT INTO agenda_limits(id,expires_at,hits) VALUES(?,?,1)",
          [id, new Date(this.clock() + seconds * 1000).toISOString()],
        );
      return true;
    });
  }
}
