import { useState, useEffect, useRef, useCallback } from "react";
import { ImageWithFallback } from "@/app/components/figma/ImageWithFallback";
import logoAstra from "@/imports/LogoAstra.png";

// ── Types ──────────────────────────────────────────────────────────────────

type AlarmStatus  = "ATIVO" | "OFF";
type DeviceStatus = "ONLINE" | "OFFLINE";
type DoseStatus   = "OK" | "PENDENTE" | "PERDIDO";

interface Estado {
  alarme: AlarmStatus;
  manha:  DoseStatus;
  noite:  DoseStatus;
  status: DeviceStatus;
  simon:  string;  // Status do jogo Simon
}

interface DoseLog {
  data:                string;
  periodo:             string;
  medicamento_nome:    string;
  horario_programado:  string;
  horario_tomado:      string | null;
  status:              string;
}

interface Config {
  paciente_nome: string;
  manha: { nome: string; hora: number | null; minuto: number | null };
  noite: { nome: string; hora: number | null; minuto: number | null };
}

// ── Design tokens (inline for portability) ─────────────────────────────────

const C = {
  bg:          "#07090d",
  card:        "#0d1018",
  cardBorder:  "#1a2035",
  text:        "#dde3ef",
  textMuted:   "#4a5568",
  textSub:     "#8897b0",
  crimson:     "#b91c1c",
  crimsonBright:"#dc2626",
  crimsonGlow: "rgba(185,28,28,0.15)",
  ok:          "#059669",
  okBg:        "rgba(5,150,105,0.12)",
  okBorder:    "rgba(5,150,105,0.35)",
  okText:      "#34d399",
  warn:        "#d97706",
  warnBg:      "rgba(217,119,6,0.12)",
  warnBorder:  "rgba(217,119,6,0.35)",
  warnText:    "#fbbf24",
  danger:      "#dc2626",
  dangerBg:    "rgba(220,38,38,0.12)",
  dangerBorder:"rgba(220,38,38,0.35)",
  dangerText:  "#f87171",
  offline:     "#374151",
  offlineBg:   "rgba(55,65,81,0.2)",
  offlineText: "#6b7280",
  mono:        "'JetBrains Mono', 'Courier New', monospace",
  sans:        "'Inter', system-ui, sans-serif",
  display:     "'Rajdhani', 'Inter', sans-serif",
};

function pad2(n: number) { return String(n).padStart(2, "0"); }

function statusBadgeStyle(s: string): React.CSSProperties {
  if (s === "OK")      return { background: C.okBg,      color: C.okText,     border: `1px solid ${C.okBorder}` };
  if (s === "PERDIDO") return { background: C.dangerBg,  color: C.dangerText, border: `1px solid ${C.dangerBorder}` };
  return                      { background: C.warnBg,    color: C.warnText,   border: `1px solid ${C.warnBorder}` };
}

// ── Clock ──────────────────────────────────────────────────────────────────

function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

// ── Primitives ─────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: "0.6rem", letterSpacing: "0.2em", color: C.textMuted,
      textTransform: "uppercase", fontFamily: C.mono, marginBottom: "18px",
      display: "flex", alignItems: "center", gap: "8px",
    }}>
      <span style={{ display: "inline-block", width: "16px", height: "1px", background: C.crimson, flexShrink: 0 }} />
      {children}
    </div>
  );
}

function Panel({
  children, style, accent,
}: { children: React.ReactNode; style?: React.CSSProperties; accent?: boolean }) {
  return (
    <div style={{
      background: C.card,
      border: `1px solid ${C.cardBorder}`,
      borderTop: accent ? `2px solid ${C.crimson}` : `1px solid ${C.cardBorder}`,
      borderRadius: "6px",
      padding: "20px 22px",
      ...style,
    }}>
      {children}
    </div>
  );
}

function StatusBadge({ value }: { value: string }) {
  const s = statusBadgeStyle(value);
  const isAlarm = value === "ATIVO";
  return (
    <span style={{
      fontFamily: C.mono,
      fontSize: "0.68rem",
      fontWeight: 700,
      letterSpacing: "0.1em",
      padding: "3px 10px",
      borderRadius: "3px",
      display: "inline-flex",
      alignItems: "center",
      gap: "5px",
      ...(isAlarm
        ? { background: C.dangerBg, color: C.dangerText, border: `1px solid ${C.dangerBorder}`, animation: "pulsar 0.8s infinite alternate" }
        : s),
    }}>
      {value}
    </span>
  );
}

function Indicator({ active, color, glow }: { active: boolean; color: string; glow: string }) {
  return (
    <span style={{
      display: "inline-block", width: "8px", height: "8px", borderRadius: "50%",
      background: active ? color : C.offline,
      boxShadow: active ? `0 0 8px ${glow}` : "none",
      flexShrink: 0,
      ...(active ? { animation: color === C.dangerText ? "pulsar 0.8s infinite alternate" : "none" } : {}),
    }} />
  );
}

function DataRow({
  label, children, last,
}: { label: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "11px 0",
      borderBottom: last ? "none" : `1px solid ${C.cardBorder}`,
    }}>
      <span style={{ fontFamily: C.sans, fontSize: "0.8rem", color: C.textSub }}>{label}</span>
      {children}
    </div>
  );
}

function CmdBtn({
  variant, onClick, disabled, children,
}: {
  variant: "primary" | "warn" | "ghost" | "save" | "refresh";
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const [hovered, setHovered] = useState(false);
  const styles: Record<string, React.CSSProperties> = {
    primary: { background: hovered ? "#991b1b" : C.crimson,      color: "#fff", border: "none" },
    warn:    { background: hovered ? "#b45309" : "#92400e",      color: C.warnText, border: `1px solid ${C.warnBorder}` },
    ghost:   { background: hovered ? "#141928" : "transparent",  color: C.textSub, border: `1px solid ${C.cardBorder}` },
    save:    { background: hovered ? "#991b1b" : C.crimson,      color: "#fff", border: "none" },
    refresh: { background: hovered ? "#141928" : "transparent",  color: C.textSub, border: `1px solid ${C.cardBorder}` },
  };
  return (
    <button
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "block", width: "100%", padding: "10px 14px",
        borderRadius: "4px",
        fontFamily: C.mono, fontSize: "0.72rem", letterSpacing: "0.12em",
        textTransform: "uppercase", cursor: disabled ? "not-allowed" : "pointer",
        marginBottom: "8px", opacity: disabled ? 0.4 : 1,
        transition: "background 0.15s, opacity 0.15s",
        fontWeight: 700,
        ...styles[variant],
      }}
    >
      {children}
    </button>
  );
}

function FormField({
  label, id, type = "text", placeholder, value, onChange,
}: {
  label: string; id: string; type?: string;
  placeholder?: string; value: string; onChange: (v: string) => void;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ marginBottom: "12px" }}>
      <label htmlFor={id} style={{
        display: "block", fontFamily: C.mono, fontSize: "0.58rem",
        color: C.textMuted, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "5px",
      }}>
        {label}
      </label>
      <input
        id={id} type={type} placeholder={placeholder} value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          width: "100%", background: "#080c14",
          border: `1px solid ${focused ? C.crimson : C.cardBorder}`,
          color: C.text, fontFamily: C.mono, fontSize: "0.82rem",
          padding: "9px 11px", borderRadius: "4px", outline: "none",
          boxSizing: "border-box", transition: "border-color 0.15s",
          colorScheme: "dark",
        }}
      />
    </div>
  );
}

function Toast({ message, visible }: { message: string; visible: boolean }) {
  return (
    <div style={{
      position: "fixed", bottom: "24px", left: "50%",
      transform: `translateX(-50%) translateY(${visible ? "0" : "12px"})`,
      background: "#0d1018", border: `1px solid ${C.cardBorder}`,
      boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
      color: C.text, padding: "10px 20px", borderRadius: "4px",
      fontFamily: C.mono, fontSize: "0.72rem", letterSpacing: "0.1em",
      opacity: visible ? 1 : 0, transition: "opacity 0.2s, transform 0.2s",
      pointerEvents: "none", zIndex: 9999, whiteSpace: "nowrap",
    }}>
      <span style={{ color: C.crimson, marginRight: "8px" }}>›</span>{message}
    </div>
  );
}

// ── App ────────────────────────────────────────────────────────────────────

export default function App() {
  const [estado,         setEstado]         = useState<Estado>({ alarme: "OFF", manha: "PENDENTE", noite: "PENDENTE", status: "OFFLINE", simon: "" });
  const [wsConnected,    setWsConnected]    = useState(false);
  const [config,         setConfig]         = useState<Config>({
    paciente_nome: "",
    manha: { nome: "", hora: null, minuto: null },
    noite: { nome: "", hora: null, minuto: null },
  });
  const [historico,      setHistorico]      = useState<DoseLog[]>([]);
  const [histLoading,    setHistLoading]    = useState(false);
  const [savingConfig,   setSavingConfig]   = useState(false);
  const [cmdLoading,     setCmdLoading]     = useState<string | null>(null);
  const [toast,          setToast]          = useState({ message: "", visible: false });
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const now = useClock();

  // ── WebSocket: recebe estado (alarme/manhã/noite/status) em tempo real ──
  // Mesmo endpoint que o backend Express já expõe (ver server.js) - reconecta
  // sozinho se cair, igual ao dashboard anterior.
  useEffect(() => {
    let socket: WebSocket | null = null;
    let reconectarTimer: ReturnType<typeof setTimeout>;

    function conectar() {
      const protocolo = location.protocol === "https:" ? "wss://" : "ws://";
      socket = new WebSocket(protocolo + location.host);

      socket.onopen = () => setWsConnected(true);
      socket.onclose = () => {
        setWsConnected(false);
        reconectarTimer = setTimeout(conectar, 3000);
      };
      socket.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          setEstado(prev => ({ ...prev, ...data }));
        } catch {
          // payload inválido - ignora
        }
      };
    }
    conectar();

    return () => {
      clearTimeout(reconectarTimer);
      socket?.close();
    };
  }, []);

  const showToast = useCallback((msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message: msg, visible: true });
    toastTimer.current = setTimeout(() => setToast(t => ({ ...t, visible: false })), 2400);
  }, []);

  const carregarConfig = useCallback(() => {
    fetch("/api/config")
      .then(r => r.json())
      .then(d => {
        if (!d.ok) { showToast("Falha ao carregar configuração"); return; }
        setConfig({
          paciente_nome: d.paciente_nome || "",
          manha: d.manha,
          noite: d.noite,
        });
      })
      .catch(() => showToast("Falha ao carregar configuração"));
  }, [showToast]);

  const carregarHistorico = useCallback(() => {
    setHistLoading(true);
    fetch("/api/historico?limite=30")
      .then(r => r.json())
      .then(d => {
        if (!d.ok) { showToast("Falha ao carregar histórico"); return; }
        setHistorico(d.historico);
      })
      .catch(() => showToast("Falha ao carregar histórico"))
      .finally(() => setHistLoading(false));
  }, [showToast]);

  // Carrega config + histórico uma vez, ao montar (o estado em tempo real
  // já vem separado, via WebSocket).
  useEffect(() => {
    carregarConfig();
    carregarHistorico();
  }, [carregarConfig, carregarHistorico]);

  function handleCmd(cmd: string) {
    setCmdLoading(cmd);
    fetch(`/cmd/${cmd}`)
      .then(r => r.json())
      .then(d => showToast(d.ok ? `Comando enviado → ${cmd}` : "Comando inválido"))
      .catch(() => showToast("Falha ao enviar comando"))
      .finally(() => setCmdLoading(null));
    // O estado real (alarme/manhã/noite) chega pelo WebSocket assim que o
    // main.py processar o comando - não precisa simular aqui.
  }

  function iniciarTesteSimon() {
    fetch("/api/simon/start")
      .then(r => r.json())
      .then(d => showToast(d.ok ? "Teste de Simon iniciado" : "Erro ao iniciar teste"))
      .catch(() => showToast("Falha ao iniciar teste"));
  }

  function handleSalvar() {
    setSavingConfig(true);
    const body = {
      paciente_nome: config.paciente_nome,
      medicamento_manha_nome: config.manha.nome,
      medicamento_noite_nome: config.noite.nome,
      horario_manha: horaManhaStr,
      horario_noite: horaNoiteStr,
    };

    fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then(r => r.json())
      .then(d => {
        showToast(d.ok ? "Configuração salva com sucesso" : "Falha ao salvar");
        // A gravação real acontece no main.py (Python) via MQTT, de forma
        // assíncrona - dá um tempinho antes de reler o valor persistido.
        if (d.ok) setTimeout(carregarConfig, 800);
      })
      .catch(() => showToast("Falha ao salvar"))
      .finally(() => setSavingConfig(false));
  }

  function reloadHistorico() {
    carregarHistorico();
    showToast("Histórico atualizado");
  }

  function iniciarTesteSimon() {
    fetch("/api/simon/start")
      .then(r => r.json())
      .then(d => showToast(d.ok ? "Teste de Simon iniciado" : "Erro ao iniciar teste"))
      .catch(() => showToast("Falha ao iniciar teste"));
  }

  const horaManhaStr = config.manha.hora != null
    ? `${pad2(config.manha.hora)}:${pad2(config.manha.minuto ?? 0)}` : "";
  const horaNoiteStr = config.noite.hora != null
    ? `${pad2(config.noite.hora)}:${pad2(config.noite.minuto ?? 0)}` : "";

  const clockStr = `${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`;
  const dateStr  = now.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });

  const hwOnline   = estado.status === "ONLINE";
  const alarmAtivo = estado.alarme  === "ATIVO";

  // Aderência real dos últimos 7 dias (o rótulo na tela diz "7d", então o
  // cálculo precisa refletir isso e não só "últimos N registros")
  const seteDiasAtras = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  })();
  const historico7d = historico.filter(h => h.data >= seteDiasAtras);
  const totalLogs = historico7d.length;
  const okLogs    = historico7d.filter(h => h.status === "OK").length;
  const compliance = totalLogs > 0 ? Math.round((okLogs / totalLogs) * 100) : 0;

  return (
    <>
      <style>{`
        @keyframes pulsar { from { opacity:1 } to { opacity:0.35 } }
        @keyframes scanline {
          0%   { transform: translateY(-100%) }
          100% { transform: translateY(100vh) }
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { background: ${C.bg}; min-height: 100vh; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${C.cardBorder}; border-radius: 2px; }
        input[type="time"]::-webkit-calendar-picker-indicator { filter: invert(0.3); }
        ::placeholder { color: ${C.textMuted}; opacity: 0.6; }
        @media (min-width: 900px) {
          .grid-main { display: grid !important; grid-template-columns: 1fr 1fr; gap: 14px; }
        }
      `}</style>

      <div style={{ background: C.bg, color: C.text, fontFamily: C.sans, minHeight: "100vh" }}>

        {/* ── HEADER ─────────────────────────────────────────── */}
        <header style={{
          background: C.card,
          borderBottom: `1px solid ${C.cardBorder}`,
          padding: "0 28px",
          display: "flex", alignItems: "center",
          justifyContent: "space-between",
          height: "64px",
          position: "sticky", top: 0, zIndex: 100,
        }}>
          {/* Logo + Title */}
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <div style={{
              width: "38px", height: "38px", flexShrink: 0,
              filter: "drop-shadow(0 0 8px rgba(185,28,28,0.5))",
            }}>
              <ImageWithFallback
                src={logoAstra}
                alt="Astra Spectre logo"
                style={{ width: "100%", height: "100%", objectFit: "contain" }}
              />
            </div>
            <div>
              <div style={{
                fontFamily: C.display, fontSize: "1.2rem", fontWeight: 700,
                letterSpacing: "0.12em", color: "#fff", lineHeight: 1,
              }}>
                ASTRA SPECTRE
              </div>
              <div style={{
                fontFamily: C.mono, fontSize: "0.55rem", color: C.textMuted,
                letterSpacing: "0.2em", textTransform: "uppercase", marginTop: "2px",
              }}>
                CONTROLE DE MEDICAÇÃO
              </div>
            </div>
          </div>

          {/* Status bar right */}
          <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
            {/* WS indicator */}
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{
                width: "7px", height: "7px", borderRadius: "50%",
                background: wsConnected ? C.okText : C.offline,
                boxShadow: wsConnected ? `0 0 6px ${C.ok}` : "none",
                display: "inline-block",
              }} />
              <span style={{ fontFamily: C.mono, fontSize: "0.62rem", color: C.textMuted, letterSpacing: "0.1em" }}>
                {wsConnected ? "PAINEL ON" : "CONECTANDO"}
              </span>
            </div>

            {/* Divider */}
            <span style={{ width: "1px", height: "20px", background: C.cardBorder }} />

            {/* Clock */}
            <div style={{ textAlign: "right" }}>
              <div style={{ fontFamily: C.mono, fontSize: "0.9rem", color: C.text, letterSpacing: "0.08em" }}>
                {clockStr}
              </div>
              <div style={{ fontFamily: C.mono, fontSize: "0.55rem", color: C.textMuted, letterSpacing: "0.1em" }}>
                {dateStr}
              </div>
            </div>
          </div>
        </header>

        {/* ── TOP METRIC STRIP ───────────────────────────────── */}
        <div style={{
          background: "#0a0d15",
          borderBottom: `1px solid ${C.cardBorder}`,
          display: "flex", alignItems: "stretch",
          overflowX: "auto",
        }}>
          {[
            {
              label: "CONTROLADOR",
              value: estado.status,
              color: hwOnline ? C.okText : C.textMuted,
              dot: hwOnline,
              dotColor: C.ok,
            },
            {
              label: "ALARME",
              value: estado.alarme,
              color: alarmAtivo ? C.dangerText : C.okText,
              dot: alarmAtivo,
              dotColor: C.danger,
            },
            {
              label: "DOSE MANHÃ",
              value: estado.manha,
              color: estado.manha === "OK" ? C.okText : C.warnText,
              dot: estado.manha !== "OK",
              dotColor: C.warn,
            },
            {
              label: "DOSE NOITE",
              value: estado.noite,
              color: estado.noite === "OK" ? C.okText : C.warnText,
              dot: estado.noite !== "OK",
              dotColor: C.warn,
            },
            {
              label: "ADERÊNCIA 7d",
              value: `${compliance}%`,
              color: compliance >= 80 ? C.okText : C.warnText,
              dot: false,
              dotColor: "",
            },
            {
              label: "PACIENTE",
              value: config.paciente_nome || "—",
              color: C.text,
              dot: false,
              dotColor: "",
            },
          ].map((m, i) => (
            <div key={i} style={{
              padding: "10px 24px",
              borderRight: `1px solid ${C.cardBorder}`,
              minWidth: "120px", flexShrink: 0,
            }}>
              <div style={{ fontFamily: C.mono, fontSize: "0.55rem", color: C.textMuted, letterSpacing: "0.15em", marginBottom: "4px" }}>
                {m.label}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                {m.dot && (
                  <span style={{
                    width: "6px", height: "6px", borderRadius: "50%",
                    background: m.dotColor, flexShrink: 0,
                    animation: alarmAtivo && m.dotColor === C.danger ? "pulsar 0.8s infinite alternate" : "none",
                  }} />
                )}
                <span style={{
                  fontFamily: C.mono, fontSize: "0.85rem", fontWeight: 700,
                  color: m.color, letterSpacing: "0.05em",
                }}>
                  {m.value}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* ── MAIN GRID ──────────────────────────────────────── */}
        <div style={{ padding: "20px 20px 60px", maxWidth: "1100px", margin: "0 auto" }}>

          <div className="grid-main" style={{ display: "flex", flexDirection: "column", gap: "14px" }}>

            {/* ── LEFT COLUMN ─────────────────────────────────── */}
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>

              {/* Connection */}
              <Panel accent>
                <SectionLabel>Conexão</SectionLabel>
                <DataRow label="Controlador (Orange Pi)">
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <Indicator active={hwOnline} color={C.okText} glow={C.ok} />
                    <StatusBadge value={estado.status} />
                  </div>
                </DataRow>
                <DataRow label="Painel WebSocket" last>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <Indicator active={wsConnected} color={C.okText} glow={C.ok} />
                    <span style={{ fontFamily: C.mono, fontSize: "0.72rem", color: wsConnected ? C.okText : C.textMuted }}>
                      {wsConnected ? "CONECTADO" : "CONECTANDO..."}
                    </span>
                  </div>
                </DataRow>
              </Panel>

              {/* Alarm */}
              <Panel>
                <SectionLabel>Alarme</SectionLabel>
                <DataRow label="Status do alarme" last>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <Indicator
                      active={alarmAtivo}
                      color={C.dangerText}
                      glow={C.danger}
                    />
                    <StatusBadge value={estado.alarme} />
                  </div>
                </DataRow>
                {alarmAtivo && (
                  <div style={{
                    marginTop: "12px", padding: "10px 12px",
                    background: C.dangerBg, border: `1px solid ${C.dangerBorder}`,
                    borderRadius: "4px", borderLeft: `3px solid ${C.danger}`,
                  }}>
                    <span style={{ fontFamily: C.mono, fontSize: "0.68rem", color: C.dangerText, letterSpacing: "0.1em" }}>
                      ⚠ ALARME ATIVO — confirme ou rearme
                    </span>
                  </div>
                )}
              </Panel>

              {/* Medication */}
              <Panel>
                <SectionLabel>Medicação do Dia</SectionLabel>
                <DataRow label={`${config.manha.hora != null ? horaManhaStr : "09:00"}  ·  ${config.manha.nome || "Manhã"}`}>
                  <StatusBadge value={estado.manha} />
                </DataRow>
                <DataRow label={`${config.noite.hora != null ? horaNoiteStr : "22:00"}  ·  ${config.noite.nome || "Noite"}`} last>
                  <StatusBadge value={estado.noite} />
                </DataRow>
                {/* Simon Game Status */}
                {estado.simon && (
                  <DataRow label="Jogo Simon" last>
                    <span style={{
                      fontFamily: C.mono,
                      fontSize: "0.68rem",
                      fontWeight: 700,
                      padding: "3px 10px",
                      borderRadius: "3px",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "5px",
                      ...(estado.simon === "OK"
                        ? { background: C.okBg, color: C.okText, border: `1px solid ${C.okBorder}` }
                        : { background: C.dangerBg, color: C.dangerText, border: `1px solid ${C.dangerBorder}` }),
                    }}>
                      {estado.simon}
                    </span>
                  </DataRow>
                )}
              </Panel>

            </div>

            {/* ── RIGHT COLUMN ────────────────────────────────── */}
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>

              {/* Commands */}
              <Panel accent>
                <SectionLabel>Comandos</SectionLabel>
                <CmdBtn variant="primary" onClick={() => handleCmd("CONFIRMAR")} disabled={cmdLoading === "CONFIRMAR"}>
                  ✓ &nbsp;Confirmar medicação
                </CmdBtn>
                <CmdBtn variant="warn" onClick={() => handleCmd("TESTE")} disabled={cmdLoading === "TESTE"}>
                  ⚠ &nbsp;Testar alarme
                </CmdBtn>
                <CmdBtn variant="ghost" onClick={() => handleCmd("REARMAR")} disabled={cmdLoading === "REARMAR"}>
                  ↺ &nbsp;Rearmar alarmes
                </CmdBtn>
                <CmdBtn variant="save" onClick={iniciarTesteSimon} disabled={savingConfig || cmdLoading}>
                  🎮 &nbsp;Testar Simon
                </CmdBtn>
              </Panel>

              {/* Config */}
              <Panel>
                <SectionLabel>Paciente &amp; Medicação</SectionLabel>
                <FormField
                  label="Nome do paciente" id="in-paciente" placeholder="Nome do paciente"
                  value={config.paciente_nome}
                  onChange={v => setConfig(c => ({ ...c, paciente_nome: v }))}
                />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  <FormField
                    label="Medicação — manhã" id="in-med-manha" placeholder="Ex: Losartana 50mg"
                    value={config.manha.nome}
                    onChange={v => setConfig(c => ({ ...c, manha: { ...c.manha, nome: v } }))}
                  />
                  <FormField
                    label="Horário — manhã" id="in-hora-manha" type="time"
                    value={horaManhaStr}
                    onChange={v => {
                      const [h, m] = v.split(":").map(Number);
                      setConfig(c => ({ ...c, manha: { ...c.manha, hora: h, minuto: m } }));
                    }}
                  />
                  <FormField
                    label="Medicação — noite" id="in-med-noite" placeholder="Ex: Metformina 850mg"
                    value={config.noite.nome}
                    onChange={v => setConfig(c => ({ ...c, noite: { ...c.noite, nome: v } }))}
                  />
                  <FormField
                    label="Horário — noite" id="in-hora-noite" type="time"
                    value={horaNoiteStr}
                    onChange={v => {
                      const [h, m] = v.split(":").map(Number);
                      setConfig(c => ({ ...c, noite: { ...c.noite, hora: h, minuto: m } }));
                    }}
                  />
                </div>
                <div style={{ marginTop: "4px" }}>
                  <CmdBtn variant="save" onClick={handleSalvar} disabled={savingConfig}>
                    💾 &nbsp;Salvar alterações
                  </CmdBtn>
                </div>
              </Panel>

            </div>
          </div>

          {/* ── HISTORY TABLE ──────────────────────────────────── */}
          <Panel style={{ marginTop: "14px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "18px" }}>
              <SectionLabel>Histórico de Doses</SectionLabel>
              <CmdBtn variant="refresh" onClick={reloadHistorico} disabled={histLoading}>
                {histLoading ? "Atualizando..." : "↻ Atualizar"}
              </CmdBtn>
            </div>

            {histLoading ? (
              <div style={{ textAlign: "center", padding: "24px 0", color: C.textMuted, fontFamily: C.mono, fontSize: "0.75rem" }}>
                Carregando...
              </div>
            ) : historico.length === 0 ? (
              <div style={{ textAlign: "center", padding: "24px 0", color: C.textMuted, fontFamily: C.mono, fontSize: "0.75rem" }}>
                Nenhum registro ainda
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: C.mono, fontSize: "0.72rem" }}>
                  <thead>
                    <tr>
                      {["Data", "Período", "Medicamento", "Programado", "Tomado", "Status"].map(h => (
                        <th key={h} style={{
                          textAlign: "left", padding: "6px 12px",
                          borderBottom: `1px solid ${C.cardBorder}`,
                          color: C.textMuted, fontSize: "0.58rem", letterSpacing: "0.15em",
                          textTransform: "uppercase", fontWeight: 600,
                        }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {historico.map((h, i) => (
                      <tr key={i} style={{
                        borderBottom: i < historico.length - 1 ? `1px solid ${C.cardBorder}` : "none",
                        transition: "background 0.1s",
                      }}
                        onMouseEnter={e => (e.currentTarget.style.background = "#111825")}
                        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                      >
                        <td style={{ padding: "9px 12px", color: C.textSub }}>{h.data}</td>
                        <td style={{ padding: "9px 12px", color: C.textSub, textTransform: "capitalize" }}>{h.periodo}</td>
                        <td style={{ padding: "9px 12px", color: C.text }}>{h.medicamento_nome || "—"}</td>
                        <td style={{ padding: "9px 12px", color: C.textSub }}>{h.horario_programado}</td>
                        <td style={{ padding: "9px 12px", color: h.horario_tomado ? C.text : C.textMuted }}>
                          {h.horario_tomado || "—"}
                        </td>
                        <td style={{ padding: "9px 12px" }}>
                          <StatusBadge value={h.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          {/* ── FOOTER ─────────────────────────────────────────── */}
          <div style={{
            marginTop: "28px", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
          }}>
            <div style={{ width: "16px", height: "16px", opacity: 0.4 }}>
              <ImageWithFallback src={logoAstra} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
            </div>
            <span style={{ fontFamily: C.mono, fontSize: "0.58rem", color: C.textMuted, letterSpacing: "0.18em" }}>
              ASTRA SPECTRE · PORTA 3000 · {dateStr}
            </span>
          </div>

        </div>
      </div>

      <Toast message={toast.message} visible={toast.visible} />
    </>
  );
}
