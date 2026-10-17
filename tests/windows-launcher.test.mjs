import test from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";
const windows = process.platform === "win32";
const powershell = windows
  ? join(
      process.env.SystemRoot,
      "System32/WindowsPowerShell/v1.0/powershell.exe",
    )
  : "";
test("launcher uses FAQ-compatible visible GUI startup, STA and failure reporting", async () => {
  for (const file of ["Iniciar Agenda.vbs", "Parar Agenda.vbs"]) {
    const text = await readFile(file, "utf8");
    assert.match(text, /-STA/);
    assert.match(text, /-WindowStyle Hidden/);
    assert.match(text, /, 1, True/);
    assert.match(text, /FileExists/);
    assert.match(text, /result <> 0/);
    assert.match(text, /SystemRoot/);
  }
});
test(
  "native Windows PowerShell 5.1 opens the interface without user data",
  { skip: !windows },
  async () => {
    for (const script of ["scripts/windows.ps1"]) {
      const result = spawnSync(
        powershell,
        [
          "-NoProfile",
          "-STA",
          "-WindowStyle",
          "Hidden",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          resolve(script),
          "-SmokeTest",
        ],
        { windowsHide: true, encoding: "utf8", timeout: 30000 },
      );
      assert.equal(result.status, 0, result.stderr + result.stdout);
      assert.match(result.stdout, /PASS:/);
    }
  },
);
