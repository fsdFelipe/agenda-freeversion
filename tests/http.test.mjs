import test from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "../src/modules/agenda/database.ts";
import { migrate } from "../src/modules/agenda/migrations.ts";
import { AuthService } from "../src/modules/agenda/services/auth.service.ts";
import { AgendaService } from "../src/modules/agenda/services/agenda.service.ts";
import { createHttp } from "../src/modules/agenda/controllers/http.ts";
import { secretToken } from "../src/modules/agenda/security.ts";
const origin = "https://agenda.example";
async function fixture(t) {
  const db = await openDatabase({ file: ":memory:" });
  t.after(() => db.close());
  await migrate(db);
  const auth = new AuthService(db),
    agenda = new AgendaService(db),
    handle = createHttp(agenda, auth, origin);
  return { db, auth, agenda, handle };
}
function post(action, data = {}, headers = {}) {
  return new Request(origin + "/api/agenda", {
    method: "POST",
    headers: { origin, "content-type": "application/json", ...headers },
    body: JSON.stringify({ action, data }),
  });
}
test("private dashboard requires real session; browser role headers ignored", async (t) => {
  const f = await fixture(t);
  let r = await f.handle(
    new Request(origin + "/api/agenda?view=admin", {
      headers: { "x-role": "ADMIN" },
    }),
  );
  assert.equal(r.status, 401);
  r = await f.handle(post("service", {}));
  assert.equal(r.status, 401);
});
test("cross-site mutations blocked including login and cancellation", async (t) => {
  const f = await fixture(t);
  const r = await f.handle(
    post("login", {}, { origin: "https://evil.example" }),
  );
  assert.equal(r.status, 403);
});
test("public info excludes admin and cache is disabled", async (t) => {
  const f = await fixture(t),
    r = await f.handle(new Request(origin + "/api/agenda"));
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("cache-control"), "no-store");
  assert.equal(r.headers.get("referrer-policy"), "no-referrer");
  const body = await r.json();
  assert.equal("admin" in body, false);
  assert.equal(body.configured, false);
});
test("malformed JSON and oversized body have controlled status", async (t) => {
  const f = await fixture(t);
  const req = (text) =>
    new Request(origin + "/api/agenda", {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: text,
    });
  assert.equal((await f.handle(req("bad"))).status, 400);
  assert.equal((await f.handle(req("x".repeat(17000)))).status, 413);
});
test("only JSON accepted for mutation", async (t) => {
  const f = await fixture(t);
  assert.equal(
    (await f.handle(post("login", {}, { "content-type": "text/plain" })))
      .status,
    415,
  );
});
test("setup requires bootstrap, login uses HttpOnly Secure SameSite cookie", async (t) => {
  const f = await fixture(t),
    password = secretToken();
  assert.equal(
    (
      await f.handle(
        post("setup", {
          token: secretToken(),
          email: "o@example.com",
          password,
          name: "Teste",
          profession: "Profissional",
          serviceName: "Consulta",
          duration: 30,
        }),
      )
    ).status,
    403,
  );
  const token = await f.auth.issueBootstrap();
  assert.equal(
    (
      await f.handle(
        post("setup", {
          token,
          email: "o@example.com",
          password,
          name: "Teste",
          profession: "Profissional",
          serviceName: "Consulta",
          duration: 30,
        }),
      )
    ).status,
    200,
  );
  const login = await f.handle(
    post("login", { email: "o@example.com", password }),
  );
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie");
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Lax/);
  assert.equal("token" in (await login.json()), false);
  const r = await f.handle(
    new Request(origin + "/api/agenda?view=admin", {
      headers: { cookie: cookie.split(";")[0] },
    }),
  );
  assert.equal(r.status, 200);
});
test("invalid public dates return validation error rather than 500", async (t) => {
  const f = await fixture(t);
  const r = await f.handle(
    new Request(
      origin + "/api/agenda?view=slots&service=unknown&date=2026-13-01",
    ),
  );
  assert.equal(r.status, 422);
});
