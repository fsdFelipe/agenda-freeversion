import type { Database } from "./types.ts";
import { defaultSettings } from "./policy.ts";
export const schemaVersion = 1;
export const statements = [
  "CREATE TABLE IF NOT EXISTS agenda_meta (id INTEGER PRIMARY KEY CHECK(id=1), version INTEGER NOT NULL)",
  "CREATE TABLE IF NOT EXISTS agenda_settings (id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS agenda_admin (id INTEGER PRIMARY KEY CHECK(id=1), email TEXT NOT NULL, password_hash TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS agenda_bootstrap (id INTEGER PRIMARY KEY CHECK(id=1), token_hash TEXT NOT NULL, expires_at TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS agenda_sessions (token_hash TEXT PRIMARY KEY, expires_at TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS agenda_services (id TEXT PRIMARY KEY, payload TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS agenda_bookings (id TEXT PRIMARY KEY, starts_at TEXT NOT NULL, ends_at TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('CONFIRMED','CANCELLED','COMPLETED','NO_SHOW')), token_hash TEXT NOT NULL UNIQUE, request_hash TEXT NOT NULL UNIQUE, payload TEXT NOT NULL, CHECK(ends_at>starts_at))",
  "CREATE INDEX IF NOT EXISTS agenda_booking_period ON agenda_bookings (status, starts_at, ends_at)",
  "CREATE TABLE IF NOT EXISTS agenda_blocks (id TEXT PRIMARY KEY, starts_at TEXT NOT NULL, ends_at TEXT NOT NULL, payload TEXT NOT NULL, CHECK(ends_at>starts_at))",
  "CREATE TABLE IF NOT EXISTS agenda_limits (id TEXT PRIMARY KEY, expires_at TEXT NOT NULL, hits INTEGER NOT NULL)",
  "CREATE TABLE IF NOT EXISTS agenda_audit (id TEXT PRIMARY KEY, action TEXT NOT NULL, subject_id TEXT NOT NULL, created_at TEXT NOT NULL)",
];
export async function migrate(db: Database) {
  await db.transaction(async (sql) => {
    for (const statement of statements) await sql.run(statement);
    const meta = (
      await sql.all<{ version: number }>(
        "SELECT version FROM agenda_meta WHERE id=1",
      )
    )[0];
    if (meta && meta.version !== schemaVersion)
      throw new Error(
        "Versão do banco incompatível. Faça backup e consulte a migração.",
      );
    await sql.run(
      "INSERT INTO agenda_meta(id,version) VALUES(1,?) ON CONFLICT(id) DO NOTHING",
      [schemaVersion],
    );
    await sql.run(
      "INSERT INTO agenda_settings(id,payload) VALUES(1,?) ON CONFLICT(id) DO NOTHING",
      [JSON.stringify(defaultSettings)],
    );
  });
}
