import { registerLauncherChecks } from "./windows-launcher-helper.mjs";
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
test("CMD launchers hide the console, preserve quoted paths and report failures", async () => {
  for (const file of ["Iniciar Agenda.cmd", "Parar Agenda.cmd"]) {
    const text = await readFile(file, "utf8");
    assert.match(text, /DisableDelayedExpansion/);
    assert.match(text, /%~dp0/);
    assert.match(text, /if not exist "%SCRIPT%"/);
    assert.match(
      text,
      /-STA -WindowStyle Hidden -ExecutionPolicy Bypass -File "%SCRIPT%"/,
    );
    assert.ok(text.includes("exit /b %EXIT_CODE%"));
    assert.match(text, /if not defined CI.*-WindowStyle Normal/);
    assert.doesNotMatch(text, /wscript|cscript|RunAs/i);
  }
});

registerLauncherChecks([
  ["Iniciar Agenda", "scripts\\windows.ps1", ""],
  ["Parar Agenda", "scripts\\windows.ps1", "-StopServer"],
]);

test(
  "native PowerShell opens the interface without operational data",
  { skip: !windows },
  async () => {
    for (const script of ["scripts/windows.ps1"]) {
      const result = spawnSync(
        powershell,
        [
          "-NoProfile",
          "-STA",
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
