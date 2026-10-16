import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { openDatabase } from "../src/modules/agenda/database.ts";
import { AuthService } from "../src/modules/agenda/services/auth.service.ts";
import { AgendaService } from "../src/modules/agenda/services/agenda.service.ts";
import { secretToken } from "../src/modules/agenda/security.ts";
const root = process.cwd();
await mkdir("work", { recursive: true });
function run(script, cwd, env, extra = []) {
  const result = spawnSync(
    process.execPath,
    [resolve(root, "scripts", script), ...extra],
    {
      cwd,
      env: { ...process.env, ...env },
      encoding: "utf8",
      windowsHide: true,
    },
  );
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}
test("setup CLI, consistent SQLite backup and private export work in clean folder", async () => {
  const lab = await mkdtemp(resolve("work", "operator-")),
    file = resolve(lab, "agenda.sqlite"),
    env = {
      SQLITE_PATH: file,
      DATABASE_URL: "",
      APP_URL: "http://localhost:5199",
    };
  const first = JSON.parse(run("setup.mts", lab, env, ["--json"]));
  assert.equal(first.configured, false);
  const db = await openDatabase({ file }),
    auth = new AuthService(db),
    password = secretToken();
  try {
    await auth.setup({
      token: new URL(first.url).hash.slice(1),
      email: "owner@example.com",
      password,
      name: "Teste",
      profession: "Teste",
      serviceName: "Sessão",
      duration: 30,
    });
  } finally {
    await db.close();
  }
  const next = JSON.parse(run("setup.mts", lab, env, ["--json"]));
  assert.equal(next.configured, true);
  assert.equal(new URL(next.url).pathname, "/entrar");
  run("backup.mts", lab, env);
  run("export.mts", lab, env);
  const files = await readdir(resolve(lab, "backups"));
  assert.equal(files.filter((f) => f.endsWith(".sqlite")).length, 1);
  const exported = JSON.parse(
    await readFile(
      resolve(
        lab,
        "backups",
        files.find((f) => f.endsWith(".json")),
      ),
      "utf8",
    ),
  );
  assert.equal(exported.schemaVersion, 1);
  assert.equal("agenda_admin" in exported.tables, false);
  assert.equal("agenda_sessions" in exported.tables, false);
  const backup = await openDatabase({
    file: resolve(
      lab,
      "backups",
      files.find((f) => f.endsWith(".sqlite")),
    ),
  });
  try {
    assert.equal(await new AuthService(backup).initialized(), true);
    const session = await new AuthService(backup).login({
      email: "owner@example.com",
      password,
    });
    assert.ok(session.token);
  } finally {
    await backup.close();
  }
});
test("separate Node processes cannot reserve overlapping SQLite appointments", async () => {
  const lab = await mkdtemp(resolve("work", "process-race-")),
    file = resolve(lab, "agenda.sqlite"),
    env = {
      SQLITE_PATH: file,
      DATABASE_URL: "",
      APP_URL: "http://localhost:5199",
    };
  const setup = JSON.parse(run("setup.mts", lab, env, ["--json"])),
    db = await openDatabase({ file }),
    clock = () => Date.parse("2026-10-16T12:00:00Z");
  const auth = new AuthService(db, clock),
    agenda = new AgendaService(db, clock);
  let service;
  try {
    // Bootstrap was issued against real clock; setup must also use the real clock.
    await new AuthService(db).setup({
      token: new URL(setup.url).hash.slice(1),
      email: "owner@example.com",
      password: secretToken(),
      name: "Teste",
      profession: "Teste",
      serviceName: "Sessão",
      duration: 30,
    });
    service = (await agenda.dashboard("2026-10-19")).services[0];
    await agenda.saveService({ ...service, active: true });
  } finally {
    await db.close();
  }
  const reserve = () =>
    new Promise((accept, reject) => {
      const worker = spawn(
        process.execPath,
        [resolve(root, "tests/reserve-worker.mts")],
        {
          stdio: ["pipe", "pipe", "pipe"],
          windowsHide: true,
          env: { ...process.env, DATABASE_URL: "" },
        },
      );
      let output = "",
        error = "";
      worker.stdout.on("data", (d) => (output += d));
      worker.stderr.on("data", (d) => (error += d));
      worker.on("error", reject);
      worker.on("exit", (code) => {
        if (code !== 0) reject(new Error(error));
        else
          try {
            accept(JSON.parse(output));
          } catch (e) {
            reject(e);
          }
      });
      worker.stdin.end(
        JSON.stringify({
          file,
          now: clock(),
          booking: {
            serviceId: service.id,
            startsAt: "2026-10-19T12:00:00.000Z",
            name: "Teste",
            email: "client@example.com",
            phone: "11999999999",
            note: "",
            consent: true,
            website: "",
            requestToken: secretToken(),
          },
        }),
      );
    });
  const results = await Promise.all([reserve(), reserve()]);
  assert.equal(results.filter((r) => r.ok).length, 1);
  assert.equal(results.find((r) => !r.ok).code, "UNAVAILABLE");
});
