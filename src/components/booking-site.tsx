"use client";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type CSSProperties,
} from "react";
import type {
  Settings,
  Service,
  Slot,
  Booking,
} from "../modules/agenda/types.ts";
import { addDays } from "../modules/agenda/policy.ts";
import { Field, Messages, api, query, money, token } from "./ui";
type Info = {
  settings: Settings;
  services: Service[];
  configured: boolean;
  today: string;
};
export function BookingSite() {
  const [info, setInfo] = useState<Info | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false);
  const [serviceId, setService] = useState(""),
    [day, setDay] = useState(""),
    [slots, setSlots] = useState<Slot[]>([]),
    [selected, setSelected] = useState("");
  const [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [phone, setPhone] = useState(""),
    [note, setNote] = useState(""),
    [consent, setConsent] = useState(false),
    [website, setWebsite] = useState("");
  const requestToken = useRef<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    query<Info>("view=public", controller.signal)
      .then((data) => {
        setInfo(data);
        setDay(data.today);
        setService(data.services[0]?.id ?? "");
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    setSelected("");
    setSlots([]);
    if (!serviceId || !day) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    query<Slot[]>(
      "view=slots&service=" + encodeURIComponent(serviceId) + "&date=" + day,
      controller.signal,
    )
      .then(setSlots)
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [serviceId, day]);
  const service = info?.services.find((s) => s.id === serviceId),
    settings = info?.settings;
  async function reserve(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      requestToken.current ??= token();
      const result = await api<{ booking: Booking; token: string }>("reserve", {
        serviceId,
        startsAt: selected,
        name,
        email,
        phone,
        note,
        consent,
        website,
        requestToken: requestToken.current,
      });
      window.location.assign("/reserva#" + result.token);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível reservar.");
      setBusy(false);
    }
  }
  if (!settings)
    return (
      <main className="container narrow loading">
        <p className="eyebrow">AGENDA FREE</p>
        <h1>Preparando sua visita.</h1>
        <Messages error={error} />
        {!error && <p role="status">Carregando informações…</p>}
      </main>
    );
  return (
    <div style={{ "--accent": settings.color } as CSSProperties}>
      <header className="site-header container">
        <a className="brand" href="/">
          <span className="brand-icon">
            {settings.name.slice(0, 1).toUpperCase()}
          </span>
          <span>
            {settings.name}
            <small>{settings.profession}</small>
          </span>
        </a>
        <a className="button ghost small" href="/entrar">
          Área profissional ↗
        </a>
      </header>
      <main className="container">
        <section className="hero">
          <div>
            <p className="eyebrow">ATENDIMENTO COM HORA MARCADA</p>
            <h1>
              Um tempo
              <br />
              só para <em>você.</em>
            </h1>
            <p className="lead">{settings.description}</p>
            <a className="button" href="#agendar">
              Escolher meu horário <span>↗</span>
            </a>
            <div className="hero-notes">
              <span>✓ Reserva sem criar conta</span>
              <span>✓ Confirmação na hora</span>
            </div>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="art-circle" />
            <div className="art-card">
              <span className="eyebrow">SIMPLES. NO SEU TEMPO.</span>
              <h2>
                Seu próximo
                <br />
                bom encontro.
              </h2>
              <div className="art-line" />
              <div className="art-week">D S T Q Q S S</div>
              <div className="art-days">
                {Array.from({ length: 14 }, (_, i) => (
                  <span key={i} className={i === 9 ? "chosen" : ""}>
                    {i + 1}
                  </span>
                ))}
              </div>
              <p>Você escolhe. A gente cuida.</p>
            </div>
            <span className="art-tag">
              Mais atenção.
              <br />
              Menos espera.
            </span>
          </div>
        </section>
        <section className="booking-section" id="agendar">
          <div className="section-heading">
            <div>
              <p className="eyebrow">SUA PRÓXIMA VISITA</p>
              <h2>Reserve em poucos passos.</h2>
            </div>
            <p>
              Horários de {settings.timeZone}.<br />
              Preços informativos; pagamento combinado diretamente.
            </p>
          </div>
          <Messages error={error} />
          {!info.configured ? (
            <div className="panel">
              <h3>Este espaço está sendo preparado.</h3>
              <p>
                O proprietário ainda precisa concluir a configuração da agenda.
              </p>
            </div>
          ) : !info.services.length ? (
            <div className="panel">
              <h3>Novos horários em breve.</h3>
              <p>
                Ainda não há serviços publicados. Entre em contato para mais
                informações.
              </p>
            </div>
          ) : (
            <div className="booking-grid">
              <div>
                <section className="panel">
                  <h3>
                    <span className="step">1</span> Escolha seu atendimento
                  </h3>
                  <div className="services">
                    {info.services.map((s) => (
                      <button
                        className={
                          "service-option " +
                          (serviceId === s.id ? "is-selected" : "")
                        }
                        type="button"
                        key={s.id}
                        aria-pressed={serviceId === s.id}
                        onClick={() => setService(s.id)}
                      >
                        <span>
                          <strong>{s.name}</strong>
                          <small>
                            {s.description ||
                              "Atendimento individual com horário reservado."}
                          </small>
                        </span>
                        <span className="service-meta">
                          {s.duration} min<strong>{money(s.priceCents)}</strong>
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
                <section className="panel">
                  <h3>
                    <span className="step">2</span> Encontre o melhor horário
                  </h3>
                  <Field label="Dia do atendimento">
                    <input
                      type="date"
                      value={day}
                      min={info.today}
                      max={addDays(info.today, settings.horizonDays)}
                      onChange={(e) => setDay(e.target.value)}
                    />
                  </Field>
                  <div className="slots" aria-label="Horários disponíveis">
                    {loading ? (
                      <p role="status">Buscando horários…</p>
                    ) : slots.length ? (
                      slots.map((s) => (
                        <button
                          type="button"
                          key={s.startsAt}
                          className={
                            selected === s.startsAt ? "is-selected" : ""
                          }
                          aria-pressed={selected === s.startsAt}
                          onClick={() => setSelected(s.startsAt)}
                        >
                          {s.label}
                        </button>
                      ))
                    ) : (
                      <p className="empty">
                        Nenhum horário disponível neste dia. Escolha outra data.
                      </p>
                    )}
                  </div>
                </section>
              </div>
              <form className="panel customer-form" onSubmit={reserve}>
                <h3>
                  <span className="step">3</span> Seus dados e confirmação
                </h3>
                {service && (
                  <div className="booking-summary">
                    <strong>{service.name}</strong>
                    <span>
                      {service.duration} minutos · {money(service.priceCents)}
                    </span>
                    <span>
                      {day?.split("-").reverse().join("/")}{" "}
                      {slots.find((s) => s.startsAt === selected)?.label ??
                        "• escolha um horário"}
                    </span>
                  </div>
                )}
                <Field label="Seu nome">
                  <input
                    autoComplete="name"
                    required
                    maxLength={100}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </Field>
                <Field label="E-mail">
                  <input
                    type="email"
                    autoComplete="email"
                    required
                    maxLength={254}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </Field>
                <Field label="Telefone com DDD">
                  <input
                    type="tel"
                    autoComplete="tel"
                    required
                    maxLength={30}
                    placeholder="(11) 99999-9999"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </Field>
                <Field
                  label="Observação (opcional)"
                  hint="Não informe dados sensíveis."
                >
                  <input
                    maxLength={500}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </Field>
                <div hidden aria-hidden="true">
                  <label>
                    Website
                    <input
                      name="website"
                      tabIndex={-1}
                      autoComplete="off"
                      value={website}
                      onChange={(e) => setWebsite(e.target.value)}
                    />
                  </label>
                </div>
                <p className="privacy">{settings.privacyNotice}</p>
                <label className="check">
                  <input
                    type="checkbox"
                    required
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                  />
                  Li o aviso de uso dos dados para este agendamento.
                </label>
                <button
                  className="button wide"
                  disabled={busy || loading || !selected}
                >
                  {busy ? "Confirmando…" : "Confirmar meu horário ↗"}
                </button>
                <small>
                  Guarde o link privado exibido depois da confirmação. Não
                  enviamos e-mails automáticos nesta versão.
                </small>
              </form>
            </div>
          )}
        </section>
        <section className="contact-panel">
          <div>
            <p className="eyebrow">VAMOS NOS ENCONTRAR</p>
            <h2>{settings.name}</h2>
            <p>{settings.address || settings.profession}</p>
          </div>
          <div>
            {settings.phone && (
              <a href={"tel:" + settings.phone.replace(/[^\d+]/g, "")}>
                {settings.phone}
              </a>
            )}
            {settings.email && (
              <a href={"mailto:" + settings.email}>{settings.email}</a>
            )}
            <a href="/privacidade">Privacidade e seus dados ↗</a>
          </div>
        </section>
      </main>
      <footer className="container site-footer">
        <span>{settings.name} · Feito para cuidar do seu tempo.</span>
        <a href="/entrar">Gerenciar agenda</a>
      </footer>
    </div>
  );
}
