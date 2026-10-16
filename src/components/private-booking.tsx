"use client";
import { useEffect, useState } from "react";
import type { Booking, Settings } from "../modules/agenda/types.ts";
import { api, Messages, money, formatDate, download } from "./ui";
type Data = { booking: Booking; settings: Settings; canCancel: boolean };
const labels = {
  CONFIRMED: "Reserva confirmada",
  CANCELLED: "Reserva cancelada",
  COMPLETED: "Atendimento concluído",
  NO_SHOW: "Ausência registrada",
};
const icsEscape = (value: string) =>
  value
    .replaceAll("\\", "\\\\")
    .replaceAll("\n", "\\n")
    .replaceAll(",", "\\,")
    .replaceAll(";", "\\;");
const icsDate = (value: string) =>
  value.replace(/[-:]/g, "").replace(/\.\d{3}/, "");
export function PrivateBooking() {
  const [data, setData] = useState<Data | null>(null),
    [secret, setSecret] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const token = window.location.hash.slice(1);
    setSecret(token);
    if (!token) {
      setError(
        "O link está incompleto. Abra o endereço privado recebido na confirmação.",
      );
      return;
    }
    api<Data>("lookup", { token })
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);
  async function cancel() {
    if (!window.confirm("Cancelar este atendimento e liberar o horário?"))
      return;
    setBusy(true);
    setError("");
    try {
      await api("cancel", { token: secret });
      setData(await api<Data>("lookup", { token: secret }));
      setNotice(
        "Reserva cancelada. Você pode escolher um novo horário no site.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao cancelar.");
    } finally {
      setBusy(false);
    }
  }
  function calendar() {
    if (!data) return;
    const b = data.booking;
    const content = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Agenda Free//PT-BR",
      "BEGIN:VEVENT",
      "UID:" + b.id + "@agenda-free",
      "DTSTAMP:" + icsDate(new Date().toISOString()),
      "DTSTART:" + icsDate(b.startsAt),
      "DTEND:" + icsDate(b.endsAt),
      "SUMMARY:" + icsEscape(b.serviceName + " · " + data.settings.name),
      "LOCATION:" + icsEscape(data.settings.address),
      "DESCRIPTION:Pagamento combinado diretamente com o profissional.",
      "END:VEVENT",
      "END:VCALENDAR",
      "",
    ].join("\r\n");
    download("meu-atendimento.ics", content, "text/calendar;charset=utf-8");
  }
  return (
    <main className="container narrow reservation-page">
      <a className="back-link" href="/">
        ← Voltar ao site
      </a>
      <p className="eyebrow">SEU ATENDIMENTO</p>
      <Messages error={error} notice={notice} />
      {!data && !error && <p role="status">Conferindo sua reserva…</p>}
      {data && (
        <>
          <div className="reservation-icon">
            {data.booking.status === "CONFIRMED" ? "✓" : "—"}
          </div>
          <h1>{labels[data.booking.status]}</h1>
          <p className="lead">
            {data.settings.name} · {data.booking.name}
          </p>
          <section className="panel">
            <h2>{data.booking.serviceName}</h2>
            <p className="appointment-date">
              {formatDate(data.booking.startsAt, data.settings.timeZone)}
            </p>
            <p>
              {data.booking.duration} minutos · {money(data.booking.priceCents)}{" "}
              <small>Preço informativo</small>
            </p>
            <p>{data.settings.address}</p>
            <small>
              Fuso: {data.settings.timeZone} · Referência: {data.booking.id}
            </small>
          </section>
          <div className="panel soft">
            <h3>Guarde este link privado.</h3>
            <p>
              Ele permite consultar e cancelar sua reserva. Não há envio
              automático por e-mail e você não precisa criar conta.
            </p>
            <div className="actions">
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(window.location.href);
                    setNotice("Link copiado. Guarde em um local privado.");
                  } catch {
                    setNotice(
                      "Copie o endereço completo da barra do navegador.",
                    );
                  }
                }}
              >
                Copiar meu link
              </button>
              {data.booking.status === "CONFIRMED" && (
                <button type="button" onClick={calendar}>
                  Adicionar ao calendário
                </button>
              )}
            </div>
          </div>
          {data.canCancel ? (
            <button
              className="button danger"
              disabled={busy}
              onClick={() => void cancel()}
            >
              {busy ? "Cancelando…" : "Cancelar atendimento"}
            </button>
          ) : (
            data.booking.status === "CONFIRMED" && (
              <p>
                O prazo para cancelar online encerrou. Entre em contato com o
                profissional.
              </p>
            )
          )}
          {data.booking.status === "CANCELLED" && (
            <a className="button" href="/#agendar">
              Escolher novo horário ↗
            </a>
          )}
          <p className="privacy">
            Cancelamento online permitido até {data.settings.cancelHours}{" "}
            hora(s) antes do atendimento.{" "}
            {data.settings.phone && (
              <a href={"tel:" + data.settings.phone.replace(/[^\d+]/g, "")}>
                {data.settings.phone}
              </a>
            )}
          </p>
        </>
      )}
    </main>
  );
}
