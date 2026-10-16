"use client";
import { useEffect, useState } from "react";
import type { Settings } from "../modules/agenda/types.ts";
import { query, Messages } from "./ui";
export function Privacy() {
  const [settings, setSettings] = useState<Settings | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    query<{ settings: Settings }>("view=public")
      .then((r) => setSettings(r.settings))
      .catch((e) => setError(e.message));
  }, []);
  return (
    <main className="container narrow reservation-page">
      <a className="back-link" href="/">
        ← Voltar
      </a>
      <p className="eyebrow">PRIVACIDADE</p>
      <h1>
        Seus dados,
        <br />
        com <em>clareza.</em>
      </h1>
      <Messages error={error} />
      {settings && (
        <div className="panel">
          <h2>{settings.name}</h2>
          <p>{settings.privacyNotice}</p>
          <h3>Informações da reserva</h3>
          <p>
            A agenda solicita nome, e-mail, telefone e observação opcional para
            administrar seu atendimento. Não informe informações sensíveis nas
            observações.
          </p>
          <h3>Acesso e contato</h3>
          <p>
            O profissional acessa os dados pelo painel protegido. Quem possui o
            link privado da reserva pode consultá-la e solicitar cancelamento
            dentro do prazo.
          </p>
          <p>
            Para dúvidas ou solicitações sobre seus dados, entre em contato com{" "}
            {settings.name}:{" "}
            {settings.email ||
              settings.phone ||
              "pelo canal de atendimento informado pelo profissional"}
            .
          </p>
          <h3>Funcionamento do site</h3>
          <p>
            O painel administrativo utiliza um cookie de sessão. Esta versão não
            inclui publicidade ou rastreadores analíticos. Serviços de
            hospedagem podem manter registros técnicos conforme sua
            configuração.
          </p>
        </div>
      )}
    </main>
  );
}
