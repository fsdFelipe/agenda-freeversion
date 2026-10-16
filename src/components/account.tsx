"use client";
import { useEffect, useState, type FormEvent } from "react";
import { api, Field, Messages } from "./ui";
export function Account({ setup = false }: { setup?: boolean }) {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState(""),
    [name, setName] = useState(""),
    [profession, setProfession] = useState(""),
    [serviceName, setService] = useState(""),
    [duration, setDuration] = useState(30),
    [secret, setSecret] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  useEffect(() => {
    if (setup) setSecret(window.location.hash.slice(1));
  }, [setup]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (setup) {
        if (password !== confirm) throw new Error("As senhas não coincidem.");
        await api("setup", {
          token: secret,
          email,
          password,
          name,
          profession,
          serviceName,
          duration,
        });
        setNotice(
          "Sua agenda foi criada. Entre com seu e-mail e senha para publicar o primeiro serviço.",
        );
      } else {
        await api("login", { email, password });
        window.location.assign("/dashboard");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível continuar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="container auth-page">
      <a className="back-link" href="/">
        ← Voltar ao site
      </a>
      <div className="auth-grid">
        <div>
          <p className="eyebrow">AGENDA FREE</p>
          <h1>
            {setup ? (
              <>
                Seu espaço.
                <br />
                Do seu <em>jeito.</em>
              </>
            ) : (
              <>
                Um lugar para
                <br />
                organizar seu <em>dia.</em>
              </>
            )}
          </h1>
          <p>
            {setup
              ? "Uma configuração curta, uma agenda pronta para receber seus clientes."
              : "Entre para administrar serviços, horários e atendimentos."}
          </p>
          <div className="feature-list">
            <span>01 · Uma agenda, sem limite mensal artificial</span>
            <span>02 · Seus dados em armazenamento persistente</span>
            <span>03 · Operação diária pelo painel</span>
          </div>
        </div>
        <form className="panel" onSubmit={submit}>
          <h2>{setup ? "Configuração inicial" : "Acessar minha agenda"}</h2>
          <Messages error={error} notice={notice} />
          {notice ? (
            <a className="button" href="/entrar">
              Entrar no painel ↗
            </a>
          ) : (
            <>
              {setup &&
                (!secret ? (
                  <p className="message error">
                    Abra o link privado gerado por Iniciar Agenda.vbs ou npm run
                    setup. O cadastro inicial não é público.
                  </p>
                ) : (
                  <>
                    <Field label="Nome do espaço ou profissional">
                      <input
                        required
                        maxLength={100}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                      />
                    </Field>
                    <Field label="Profissão ou especialidade">
                      <input
                        required
                        maxLength={100}
                        value={profession}
                        onChange={(e) => setProfession(e.target.value)}
                      />
                    </Field>
                    <Field label="Nome do primeiro serviço">
                      <input
                        required
                        maxLength={100}
                        value={serviceName}
                        onChange={(e) => setService(e.target.value)}
                      />
                    </Field>
                    <Field label="Duração em minutos">
                      <input
                        type="number"
                        min={5}
                        max={480}
                        required
                        value={duration}
                        onChange={(e) => setDuration(Number(e.target.value))}
                      />
                    </Field>
                  </>
                ))}
              <Field label="E-mail do administrador">
                <input
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>
              <Field label="Senha" hint="Entre 12 e 128 caracteres.">
                <input
                  type="password"
                  autoComplete={setup ? "new-password" : "current-password"}
                  minLength={12}
                  maxLength={128}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>
              {setup && (
                <Field label="Repetir senha">
                  <input
                    type="password"
                    autoComplete="new-password"
                    minLength={12}
                    maxLength={128}
                    required
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                  />
                </Field>
              )}
              <button
                className="button wide"
                disabled={busy || (setup && !secret)}
              >
                {busy ? "Aguarde…" : setup ? "Criar minha agenda" : "Entrar ↗"}
              </button>
              <small>
                {setup
                  ? "O primeiro serviço começa pausado: confira preço, expediente e privacidade antes de publicar."
                  : "Esqueceu a senha? O responsável pela instalação pode redefini-la pelo procedimento do manual."}
              </small>
            </>
          )}
        </form>
      </div>
    </main>
  );
}
