import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  writeFile,
  copyFile,
  unlink,
} from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

export function registerLauncherChecks(entries) {
  test(
    "native CMD launchers handle special paths, propagate failures and reject incomplete packages",
    { skip: process.platform !== "win32" },
    async () => {
      await mkdir(resolve("work"), { recursive: true });
      const root = await mkdtemp(resolve("work", "cliente ação ! & (teste)-"));
      const record = join(root, "result.json");
      const command = join(process.env.SystemRoot, "System32", "cmd.exe");
      function run(name, extra = {}) {
        return spawnSync(
          command,
          ["/d", "/s", "/c", `""${join(root, name + ".cmd")}""`],
          {
            cwd: root,
            windowsHide: true,
            windowsVerbatimArguments: true,
            encoding: "utf8",
            timeout: 20000,
            env: {
              ...process.env,
              CI: "true",
              LAUNCHER_TEST_RECORD: record,
              ...extra,
            },
          },
        );
      }
      for (const [name, script, args] of entries) {
        const target = join(root, script);
        await mkdir(dirname(target), { recursive: true });
        await copyFile(resolve(name + ".cmd"), join(root, name + ".cmd"));
        // The real CMD launches a fixture PS1, never operational data or servers.
        await writeFile(
          target,
          `param([switch]$StopServer)
@{ stop = [bool]$StopServer; hidden = ([Environment]::GetCommandLineArgs() -contains 'Hidden'); sta = ([Threading.Thread]::CurrentThread.ApartmentState -eq 'STA'); script = $PSCommandPath } | ConvertTo-Json | Set-Content -LiteralPath $env:LAUNCHER_TEST_RECORD -Encoding UTF8
if ($env:LAUNCHER_TEST_EXIT) { exit ([int]$env:LAUNCHER_TEST_EXIT) }
exit 0
`,
        );
        const success = run(name);
        assert.equal(
          success.status,
          0,
          success.stdout + success.stderr + String(success.error ?? ""),
        );
        const data = JSON.parse(
          (await readFile(record, "utf8")).replace(/^\uFEFF/, ""),
        );
        assert.equal(data.sta, true);
        assert.equal(data.hidden, true);
        assert.equal(data.stop, args === "-StopServer");
        assert.equal(data.script.toLowerCase(), target.toLowerCase());
        const failure = run(name, { LAUNCHER_TEST_EXIT: "7" });
        assert.equal(failure.status, 7, failure.stdout + failure.stderr);
        assert.match(failure.stdout, /Codigo: 7/);
        await unlink(target);
        const incomplete = run(name);
        assert.equal(
          incomplete.status,
          2,
          incomplete.stdout + incomplete.stderr,
        );
        assert.match(incomplete.stdout, /ZIP completo/);
      }
    },
  );
}
