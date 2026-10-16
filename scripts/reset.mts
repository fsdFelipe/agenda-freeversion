import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { Writable } from "node:stream";
import { openDatabase } from "../src/modules/agenda/database.ts";
import { AuthService } from "../src/modules/agenda/services/auth.service.ts";
if (!stdin.isTTY) throw new Error("Execute em um terminal interativo local.");
async function secret(label: string) {
  const muted = new Writable({
    write(_chunk, _encoding, callback) {
      callback();
    },
  });
  const prompt = createInterface({
    input: stdin,
    output: muted,
    terminal: true,
  });
  stdout.write(label);
  try {
    return await prompt.question("");
  } finally {
    prompt.close();
    stdout.write("\n");
  }
}
console.log(
  "Recuperação pelo operador do servidor. A digitação da senha fica oculta.",
);
const password = await secret("Nova senha (mínimo 12 caracteres): ");
const confirm = await secret("Repita a nova senha: ");
if (password !== confirm) throw new Error("As senhas não coincidem.");
const db = await openDatabase({
  file: process.env.SQLITE_PATH,
  url: process.env.DATABASE_URL,
});
try {
  await new AuthService(db).resetPassword(password);
  console.log("Senha alterada. Todas as sessões foram encerradas.");
} finally {
  await db.close();
}
