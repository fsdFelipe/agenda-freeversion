"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type CSSProperties,
} from "react";
import type {
  Settings,
  Service,
  Booking,
  Block,
} from "../modules/agenda/types.ts";
import { wallInstant, localDay, addDays } from "../modules/agenda/policy.ts";
import { api, query, Field, Messages, money, formatTime, download } from "./ui";
type Data = {
  settings: Settings;
  services: Service[];
  bookings: Booking[];
  blocks: Block[];
  day: string;
};
const days = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];
const labels = {
  CONFIRMED: "Confirmado",
  CANCELLED: "Cancelado",
  COMPLETED: "Concluído",
  NO_SHOW: "Não compareceu",
};
const blank: Service = {
  id: "",
  name: "",
  description: "",
  duration: 30,
  priceCents: 0,
  active: false,
  sortOrder: 0,
};
function csv(value: unknown) {
  let text = String(value ?? "");
  if (/^\s*[=+\-@]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
export function Dashboard() {
  const [data, setData] = useState<Data | null>(null),
    [settings, setSettings] = useState<Settings | null>(null),
    [day, setDay] = useState(""),
    [tab, setTab] = useState("agenda"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Service | null>(null),
    [price, setPrice] = useState("0,00"),
    [blockFrom, setFrom] = useState(""),
    [blockTo, setTo] = useState(""),
    [reason, setReason] = useState(""),
    [current, setCurrent] = useState(""),
    [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState("");
  const loadVersion = useRef(0);
  const load = useCallback(async () => {
    const version = ++loadVersion.current;
    const result = await query<Data>(
      "view=admin" + (day ? "&date=" + day : ""),
    );
    if (version !== loadVersion.current) return;
    setData(result);
    setSettings(result.settings);
    if (!day) setDay(result.day);
  }, [day]);
  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, [load]);
  async function action(name: string, value: unknown) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(name, value);
      await load();
      setNotice("Alterações salvas.");
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
      return false;
    } finally {
      setBusy(false);
    }
  }
  function edit(service: Service) {
    setEditing(structuredClone(service));
    setPrice((service.priceCents / 100).toFixed(2).replace(".", ","));
  }
  async function saveService(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    if (!/^\d{1,6}([.,]\d{1,2})?$/.test(price)) {
      setError("Informe um preço como 80,00.");
      return;
    }
    const priceCents = Math.round(Number(price.replace(",", ".")) * 100);
    if (await action("service", { ...editing, priceCents })) setEditing(null);
  }
  async function saveSettings(e: FormEvent) {
    e.preventDefault();
    if (settings) await action("settings", settings);
  }
  async function block(e: FormEvent) {
    e.preventDefault();
    if (!settings) return;
    const from = wallInstant(
        blockFrom.slice(0, 10),
        blockFrom.slice(11, 16),
        settings.timeZone,
      ),
      to = wallInstant(
        blockTo.slice(0, 10),
        blockTo.slice(11, 16),
        settings.timeZone,
      );
    if (
      from === null ||
      to === null ||
      !Number.isFinite(from) ||
      !Number.isFinite(to)
    ) {
      setError("Confira as datas e horários do bloqueio.");
      return;
    }
    if (
      await action("block", {
        startsAt: new Date(from).toISOString(),
        endsAt: new Date(to).toISOString(),
        reason,
      })
    ) {
      setDay(blockFrom.slice(0, 10));
      setFrom("");
      setTo("");
      setReason("");
    }
  }
  function exportCsv() {
    if (!data) return;
    const rows = [
      [
        "Data/hora UTC",
        "Serviço",
        "Cliente",
        "E-mail",
        "Telefone",
        "Estado",
        "Preço informativo em centavos",
      ],
      ...data.bookings.map((b) => [
        b.startsAt,
        b.serviceName,
        b.name,
        b.email,
        b.phone,
        labels[b.status],
        b.priceCents,
      ]),
    ];
    download(
      "agenda-" + day + ".csv",
      "\uFEFF" + rows.map((row) => row.map(csv).join(";")).join("\r\n"),
      "text/csv;charset=utf-8",
    );
  }
  if (!data || !settings)
    return (
      <main className="container loading">
        <p className="eyebrow">ÁREA PROFISSIONAL</p>
        <h1>Sua agenda.</h1>
        <Messages error={error} />
        {!error && <p role="status">Conferindo seu acesso…</p>}
        <a href="/entrar">Entrar</a>
      </main>
    );
  const future = data.bookings.filter((b) => b.status === "CONFIRMED").length;
  return (
    <div
      className="dashboard"
      style={{ "--accent": settings.color } as CSSProperties}
    >
      <header className="dashboard-header container">
        <a href="/dashboard" className="brand">
          <span className="brand-icon">{settings.name.slice(0, 1)}</span>
          <span>
            {settings.name}
            <small>Painel profissional · Agenda Free</small>
          </span>
        </a>
        <div className="actions">
          <a
            className="button ghost small"
            href="/"
            target="_blank"
            rel="noopener"
          >
            Ver meu site ↗
          </a>
          <button
            className="small"
            type="button"
            onClick={async () => {
              try {
                await api("logout", {});
                window.location.assign("/entrar");
              } catch (e) {
                setError(e instanceof Error ? e.message : "Falha ao sair.");
              }
            }}
          >
            Sair
          </button>
        </div>
      </header>
      <main className="container dashboard-main">
        <div className="section-heading">
          <div>
            <p className="eyebrow">ORGANIZE COM TRANQUILIDADE</p>
            <h1>Seu dia, em ordem.</h1>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => void load().catch((e) => setError(e.message))}
          >
            Atualizar agenda ↻
          </button>
        </div>
        <Messages error={error} notice={notice} />
        <nav className="tabs" aria-label="Seções do painel">
          {[
            ["agenda", "Minha agenda"],
            ["services", "Serviços"],
            ["hours", "Expediente"],
            ["blocks", "Bloqueios"],
            ["site", "Meu site"],
            ["account", "Minha conta"],
          ].map(([key, label]) => (
            <button
              type="button"
              key={key}
              aria-pressed={tab === key}
              onClick={() => {
                setTab(key);
                setError("");
                setNotice("");
                setEditing(null);
              }}
            >
              {label}
            </button>
          ))}
        </nav>
        {tab === "agenda" && (
          <>
            <div className="day-toolbar">
              <div className="actions">
                <button
                  type="button"
                  aria-label="Dia anterior"
                  onClick={() => setDay(addDays(day, -1))}
                >
                  ←
                </button>
                <Field label="Dia da agenda">
                  <input
                    type="date"
                    value={day}
                    onChange={(e) => setDay(e.target.value)}
                  />
                </Field>
                <button
                  type="button"
                  aria-label="Próximo dia"
                  onClick={() => setDay(addDays(day, 1))}
                >
                  →
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setDay(localDay(Date.now(), settings.timeZone))
                  }
                >
                  Hoje
                </button>
              </div>
              <button type="button" onClick={exportCsv}>
                Exportar este dia ↓
              </button>
            </div>
            <div className="stats">
              <article>
                <small>Agendamentos no dia</small>
                <strong>{data.bookings.length}</strong>
              </article>
              <article>
                <small>Confirmados</small>
                <strong>{future}</strong>
              </article>
              <article>
                <small>Concluídos</small>
                <strong>
                  {data.bookings.filter((b) => b.status === "COMPLETED").length}
                </strong>
              </article>
              <article>
                <small>Bloqueios no dia</small>
                <strong>{data.blocks.length}</strong>
              </article>
            </div>
            <p className="muted">
              Todos os horários abaixo usam {settings.timeZone}. Os valores são
              informativos, sem cobrança online.
            </p>
            {!data.bookings.length ? (
              <section className="panel empty">
                <div className="reservation-icon small-icon">☷</div>
                <h2>Espaço para um novo encontro.</h2>
                <p>
                  Nenhum agendamento neste dia. Compartilhe o endereço público
                  para seus clientes escolherem um horário.
                </p>
                <a
                  href="/#agendar"
                  className="button ghost"
                  target="_blank"
                  rel="noopener"
                >
                  Abrir minha página ↗
                </a>
              </section>
            ) : (
              <div className="appointments">
                {data.bookings.map((b) => (
                  <article className="panel appointment" key={b.id}>
                    <div className="appointment-time">
                      <strong>
                        {formatTime(b.startsAt, settings.timeZone)}
                      </strong>
                      <small>
                        até {formatTime(b.endsAt, settings.timeZone)}
                      </small>
                    </div>
                    <div className="appointment-body">
                      <span
                        className={
                          "badge " + (b.status === "CONFIRMED" ? "green" : "")
                        }
                      >
                        {labels[b.status]}
                      </span>
                      <h2>{b.name}</h2>
                      <p>
                        {b.serviceName} · {b.duration} minutos ·{" "}
                        {money(b.priceCents)}
                      </p>
                      <div className="client-contact">
                        <a href={"tel:" + b.phone.replace(/[^\d+]/g, "")}>
                          {b.phone}
                        </a>
                        <a href={"mailto:" + b.email}>{b.email}</a>
                      </div>
                      {b.note && (
                        <p className="client-note">Observação: {b.note}</p>
                      )}
                      <small>Referência: {b.id}</small>
                    </div>
                    {b.status === "CONFIRMED" && (
                      <div className="appointment-actions">
                        <button
                          type="button"
                          disabled={busy || Date.parse(b.startsAt) > Date.now()}
                          onClick={() =>
                            void action("status", {
                              id: b.id,
                              revision: b.revision,
                              status: "COMPLETED",
                            })
                          }
                        >
                          Concluir
                        </button>
                        <button
                          type="button"
                          disabled={busy || Date.parse(b.startsAt) > Date.now()}
                          onClick={() => {
                            if (
                              window.confirm(
                                "Registrar ausência neste atendimento?",
                              )
                            )
                              void action("status", {
                                id: b.id,
                                revision: b.revision,
                                status: "NO_SHOW",
                              });
                          }}
                        >
                          Não compareceu
                        </button>
                        <button
                          className="danger-text"
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            if (
                              window.confirm(
                                "Cancelar este agendamento e liberar o horário? Avise o cliente pelo seu canal de contato.",
                              )
                            )
                              void action("status", {
                                id: b.id,
                                revision: b.revision,
                                status: "CANCELLED",
                              });
                          }}
                        >
                          Cancelar
                        </button>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
          </>
        )}
        {tab === "services" && (
          <>
            <div className="section-heading">
              <div>
                <h2>O que você oferece.</h2>
                <p>
                  Publique ou pause serviços sem perder o histórico das
                  reservas.
                </p>
              </div>
              <button
                type="button"
                className="button"
                onClick={() => edit(blank)}
              >
                + Novo serviço
              </button>
            </div>
            <div className="cards-grid">
              {data.services.map((s) => (
                <article className="panel" key={s.id}>
                  <span className={"badge " + (s.active ? "green" : "")}>
                    {s.active ? "Publicado" : "Pausado"}
                  </span>
                  <h2>{s.name}</h2>
                  <p>{s.description || "Sem descrição."}</p>
                  <p>
                    {s.duration} minutos ·{" "}
                    <strong>{money(s.priceCents)}</strong>
                  </p>
                  <button type="button" onClick={() => edit(s)}>
                    Editar serviço
                  </button>
                </article>
              ))}
            </div>
            {editing && (
              <form className="panel edit-form" onSubmit={saveService}>
                <h2>{editing.id ? "Editar serviço" : "Criar serviço"}</h2>
                <div className="form-grid">
                  <Field label="Nome do serviço">
                    <input
                      required
                      maxLength={100}
                      value={editing.name}
                      onChange={(e) =>
                        setEditing({ ...editing, name: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="Duração (minutos)">
                    <input
                      type="number"
                      min={5}
                      max={480}
                      required
                      value={editing.duration}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          duration: Number(e.target.value),
                        })
                      }
                    />
                  </Field>
                  <Field label="Preço informativo (R$)">
                    <input
                      inputMode="decimal"
                      required
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                    />
                  </Field>
                  <Field label="Ordem de exibição">
                    <input
                      type="number"
                      min={0}
                      max={999}
                      required
                      value={editing.sortOrder}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          sortOrder: Number(e.target.value),
                        })
                      }
                    />
                  </Field>
                  <Field label="Descrição curta">
                    <input
                      maxLength={500}
                      value={editing.description}
                      onChange={(e) =>
                        setEditing({ ...editing, description: e.target.value })
                      }
                    />
                  </Field>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={editing.active}
                      onChange={(e) =>
                        setEditing({ ...editing, active: e.target.checked })
                      }
                    />
                    Publicado e disponível para agendar
                  </label>
                </div>
                <div className="actions">
                  <button className="button" disabled={busy}>
                    Salvar serviço
                  </button>
                  <button type="button" onClick={() => setEditing(null)}>
                    Fechar
                  </button>
                </div>
              </form>
            )}
          </>
        )}
        {tab === "hours" && (
          <form onSubmit={saveSettings}>
            <div className="section-heading">
              <div>
                <h2>Um ritmo que funciona para você.</h2>
                <p>
                  Marque dias e períodos disponíveis. Intervalos entre períodos
                  ficam livres de reservas.
                </p>
              </div>
              <button className="button" disabled={busy}>
                Salvar expediente
              </button>
            </div>
            <div className="hours-list">
              {days.map((label, index) => {
                const periods = settings.weekly
                  .map((p, i) => ({ ...p, index: i }))
                  .filter((p) => p.day === index);
                return (
                  <section className="panel hours-day" key={label}>
                    <div>
                      <label className="check">
                        <input
                          type="checkbox"
                          checked={!!periods.length}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              weekly: e.target.checked
                                ? [
                                    ...settings.weekly,
                                    { day: index, from: "09:00", to: "18:00" },
                                  ]
                                : settings.weekly.filter(
                                    (p) => p.day !== index,
                                  ),
                            })
                          }
                        />
                        <strong>{label}</strong>
                      </label>
                      {!periods.length && <small>Sem atendimento</small>}
                    </div>
                    <div>
                      {periods.map((p) => (
                        <div className="hours-period" key={p.index}>
                          <Field label="Das">
                            <input
                              type="time"
                              required
                              value={p.from}
                              onChange={(e) =>
                                setSettings({
                                  ...settings,
                                  weekly: settings.weekly.map((r, i) =>
                                    i === p.index
                                      ? { ...r, from: e.target.value }
                                      : r,
                                  ),
                                })
                              }
                            />
                          </Field>
                          <Field label="Até">
                            <input
                              type="time"
                              required
                              value={p.to}
                              onChange={(e) =>
                                setSettings({
                                  ...settings,
                                  weekly: settings.weekly.map((r, i) =>
                                    i === p.index
                                      ? { ...r, to: e.target.value }
                                      : r,
                                  ),
                                })
                              }
                            />
                          </Field>
                          <button
                            type="button"
                            aria-label={"Remover período de " + label}
                            onClick={() =>
                              setSettings({
                                ...settings,
                                weekly: settings.weekly.filter(
                                  (_, i) => i !== p.index,
                                ),
                              })
                            }
                          >
                            ×
                          </button>
                        </div>
                      ))}
                      {!!periods.length && periods.length < 4 && (
                        <button
                          type="button"
                          className="link-button"
                          onClick={() =>
                            setSettings({
                              ...settings,
                              weekly: [
                                ...settings.weekly,
                                { day: index, from: "13:00", to: "18:00" },
                              ],
                            })
                          }
                        >
                          + Adicionar período
                        </button>
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
            <section className="panel">
              <h2>Regras de reserva</h2>
              <div className="form-grid">
                <Field label="Antecedência mínima (minutos)">
                  <input
                    type="number"
                    min={0}
                    max={10080}
                    required
                    value={settings.leadMinutes}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        leadMinutes: Number(e.target.value),
                      })
                    }
                  />
                </Field>
                <Field label="Até quantos dias no futuro">
                  <input
                    type="number"
                    min={1}
                    max={180}
                    required
                    value={settings.horizonDays}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        horizonDays: Number(e.target.value),
                      })
                    }
                  />
                </Field>
                <Field label="Intervalo entre opções (minutos)">
                  <input
                    type="number"
                    min={5}
                    max={60}
                    required
                    value={settings.stepMinutes}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        stepMinutes: Number(e.target.value),
                      })
                    }
                  />
                </Field>
                <Field label="Cancelamento até quantas horas antes">
                  <input
                    type="number"
                    min={0}
                    max={168}
                    required
                    value={settings.cancelHours}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        cancelHours: Number(e.target.value),
                      })
                    }
                  />
                </Field>
                <Field label="Fuso horário">
                  <select
                    value={settings.timeZone}
                    onChange={(e) =>
                      setSettings({ ...settings, timeZone: e.target.value })
                    }
                  >
                    {[
                      ["America/Sao_Paulo", "Brasília / São Paulo"],
                      ["America/Manaus", "Manaus"],
                      ["America/Rio_Branco", "Rio Branco"],
                      ["America/Noronha", "Fernando de Noronha"],
                      ["Europe/Lisbon", "Lisboa"],
                      ["UTC", "UTC"],
                    ].map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <p className="muted">
                Reservas existentes mantêm seus horários. Alterar o fuso é
                bloqueado enquanto houver reservas futuras confirmadas.
              </p>
              <button className="button" disabled={busy}>
                Salvar expediente
              </button>
            </section>
          </form>
        )}
        {tab === "blocks" && (
          <div className="cards-grid">
            <form className="panel" onSubmit={block}>
              <h2>Reserve um tempo para você.</h2>
              <p>
                Férias, compromissos e pausas. Horários interpretados em{" "}
                {settings.timeZone}.
              </p>
              <Field label="Início do bloqueio">
                <input
                  type="datetime-local"
                  required
                  value={blockFrom}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </Field>
              <Field label="Fim do bloqueio">
                <input
                  type="datetime-local"
                  required
                  value={blockTo}
                  onChange={(e) => setTo(e.target.value)}
                />
              </Field>
              <Field label="Motivo interno">
                <input
                  required
                  maxLength={200}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </Field>
              <button className="button" disabled={busy}>
                Criar bloqueio
              </button>
              <small>
                Se houver reservas no período, resolva-as antes de bloquear. O
                motivo não aparece para os clientes.
              </small>
            </form>
            <section className="panel">
              <h2>Bloqueios de {day.split("-").reverse().join("/")}</h2>
              <Field label="Dia para consultar">
                <input
                  type="date"
                  value={day}
                  onChange={(e) => setDay(e.target.value)}
                />
              </Field>
              {!data.blocks.length ? (
                <p className="empty">Nenhum bloqueio neste dia.</p>
              ) : (
                data.blocks.map((b) => (
                  <article className="block-item" key={b.id}>
                    <strong>{b.reason}</strong>
                    <p>
                      {new Date(b.startsAt).toLocaleString("pt-BR", {
                        timeZone: settings.timeZone,
                      })}{" "}
                      até{" "}
                      {new Date(b.endsAt).toLocaleString("pt-BR", {
                        timeZone: settings.timeZone,
                      })}
                    </p>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        if (
                          window.confirm(
                            "Remover este bloqueio e disponibilizar horários?",
                          )
                        )
                          void action("removeBlock", { id: b.id });
                      }}
                    >
                      Remover bloqueio
                    </button>
                  </article>
                ))
              )}
            </section>
          </div>
        )}
        {tab === "site" && (
          <form className="panel edit-form" onSubmit={saveSettings}>
            <p className="eyebrow">IDENTIDADE E CONTATO</p>
            <h2>Faça o site parecer seu.</h2>
            <div className="form-grid">
              {(
                [
                  ["name", "Nome do espaço", 100],
                  ["profession", "Profissão / especialidade", 100],
                  ["description", "Apresentação", 1000],
                  ["phone", "Telefone público", 30],
                  ["email", "E-mail público", 254],
                  ["address", "Endereço / orientação de atendimento", 200],
                ] as const
              ).map(([key, label, max]) => (
                <Field key={key} label={label}>
                  <input
                    maxLength={max}
                    required={key === "name" || key === "profession"}
                    type={key === "email" ? "email" : "text"}
                    value={settings[key]}
                    onChange={(e) =>
                      setSettings({ ...settings, [key]: e.target.value })
                    }
                  />
                </Field>
              ))}
              <Field label="Cor principal">
                <input
                  type="color"
                  value={settings.color}
                  onChange={(e) =>
                    setSettings({ ...settings, color: e.target.value })
                  }
                />
              </Field>
              <Field
                label="Como os dados dos clientes serão utilizados"
                hint="Adapte o aviso à sua operação. Não solicite informações sensíveis."
              >
                <input
                  required
                  maxLength={1500}
                  value={settings.privacyNotice}
                  onChange={(e) =>
                    setSettings({ ...settings, privacyNotice: e.target.value })
                  }
                />
              </Field>
            </div>
            <button className="button" disabled={busy}>
              Salvar meu site
            </button>
            <p className="muted">
              Esse e-mail público não altera o e-mail usado para entrar no
              painel.
            </p>
          </form>
        )}
        {tab === "account" && (
          <section className="panel edit-form">
            <h2>Proteja seu acesso.</h2>
            <p>Ao alterar a senha, todas as sessões são encerradas.</p>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (password !== confirm) {
                  setError("As senhas não coincidem.");
                  return;
                }
                setBusy(true);
                try {
                  await api("password", { current, next: password });
                  window.location.assign("/entrar");
                } catch (e) {
                  setError(
                    e instanceof Error
                      ? e.message
                      : "Não foi possível alterar.",
                  );
                  setBusy(false);
                }
              }}
            >
              <Field label="Senha atual">
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  minLength={12}
                  maxLength={128}
                  value={current}
                  onChange={(e) => setCurrent(e.target.value)}
                />
              </Field>
              <Field label="Nova senha">
                <input
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={12}
                  maxLength={128}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>
              <Field label="Repetir nova senha">
                <input
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={12}
                  maxLength={128}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </Field>
              <button className="button" disabled={busy}>
                Alterar senha
              </button>
            </form>
            <hr />
            <p>
              Versão gratuita · uma agenda · sem limite mensal artificial de
              reservas.
            </p>
            <p className="muted">
              Banco persistente, sem e-mails automáticos ou cobrança online.
              Faça backups pelo procedimento do manual.
            </p>
          </section>
        )}
      </main>
      <footer className="container site-footer">
        <span>Agenda Free · Um profissional, uma agenda.</span>
        <a href="/">Voltar ao site ↗</a>
      </footer>
    </div>
  );
}
