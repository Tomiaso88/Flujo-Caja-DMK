import { useState, useMemo, useEffect, useRef } from "react";

const SUPABASE_URL = "https://jnqyeawvsbsgtnjangmu.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpucXllYXd2c2JzZ3RuamFuZ211Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3NzU3MzgsImV4cCI6MjA5MjM1MTczOH0.DKNk0z1s_bWMiaZogqJJzcD2yXPr2qgHsL1PtJSrKNY";
const LOCAL_USERS = [{ email: "dmk@dmk.com", password: "DMK26!" }];
const IS_PREVIEW = typeof window !== "undefined" && !window.location.hostname.includes("vercel");

const SAMPLE_ENTRIES = [
  { id: 1, type: "income", description: "Ventas abril", amount: 4500000, date: "2026-04-10", category: "Ventas", recurring: false, recurring_frequency: null, recurring_end_date: null },
  { id: 2, type: "expense", description: "Alquiler oficina", amount: 800000, date: "2026-04-01", category: "Alquiler", recurring: true, recurring_frequency: "mensual", recurring_end_date: null },
  { id: 3, type: "income", description: "Consultoria Q2", amount: 2000000, date: "2026-05-15", category: "Servicios", recurring: false, recurring_frequency: null, recurring_end_date: null },
  { id: 4, type: "expense", description: "Nomina", amount: 1800000, date: "2026-04-30", category: "Nomina", recurring: true, recurring_frequency: "mensual", recurring_end_date: null },
  { id: 5, type: "expense", description: "Google Ads", amount: 350000, date: "2026-05-01", category: "Marketing", recurring: false, recurring_frequency: null, recurring_end_date: null },
  { id: 6, type: "income", description: "Cobro cliente A", amount: 1200000, date: "2026-06-10", category: "Servicios", recurring: false, recurring_frequency: null, recurring_end_date: null },
];
const SAMPLE_BALANCE = 2000000;

const api = async (method, path, body) => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", Prefer: "return=representation" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(await res.text());
  const text = await res.text();
  return text ? JSON.parse(text) : null;
};

const authApi = async (endpoint, body) => {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/${endpoint}`, {
    method: "POST",
    headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
};

const CATEGORIES_INCOME = ["Ventas", "Servicios", "Inversion", "Prestamo", "Otro"];
const CATEGORIES_EXPENSE = ["Nomina", "Alquiler", "Suministros", "Marketing", "Impuestos", "Servicios", "Otro"];
const FREQ_OPTIONS = ["semanal", "quincenal", "mensual", "anual"];

const todayStr = () => new Date().toISOString().split("T")[0];
const addDays = (d, n) => { const x = new Date(d + "T00:00:00"); x.setDate(x.getDate() + n); return x.toISOString().split("T")[0]; };
const addMonths = (d, n) => { const x = new Date(d + "T00:00:00"); x.setMonth(x.getMonth() + n); return x.toISOString().split("T")[0]; };
const freqNext = (d, f) => ({ semanal: addDays(d, 7), quincenal: addDays(d, 15), mensual: addMonths(d, 1), anual: addMonths(d, 12) }[f] || null);

const expandEntries = (entries, horizon) => {
  const result = [];
  for (const e of entries) {
    result.push({ ...e, isGenerated: false });
    if (e.recurring && e.recurring_frequency) {
      let next = freqNext(e.date, e.recurring_frequency);
      const end = e.recurring_end_date || horizon;
      let i = 0;
      while (next && next <= horizon && next <= end && i++ < 500) {
        result.push({ ...e, date: next, isGenerated: true, id: `${e.id}_${next}` });
        next = freqNext(next, e.recurring_frequency);
      }
    }
  }
  return result.sort((a, b) => a.date.localeCompare(b.date));
};

const buildTimeline = (entries, initialBalance, from, to) => {
  const expanded = expandEntries(entries, to);
  const byDate = {};
  for (const e of expanded) {
    if (e.date < from || e.date > to) continue;
    if (!byDate[e.date]) byDate[e.date] = [];
    byDate[e.date].push(e);
  }
  const today = todayStr();
  const allDates = new Set(Object.keys(byDate));
  if (today >= from && today <= to) allDates.add(today);
  const sorted = [...allDates].sort();
  let bal = initialBalance;
  for (const e of expanded) if (e.date < from) bal += e.type === "income" ? +e.amount : -+e.amount;
  return sorted.map(date => {
    const movements = byDate[date] || [];
    movements.forEach(m => { bal += m.type === "income" ? +m.amount : -+m.amount; });
    return { date, movements, balance: bal };
  });
};

const fmt = n => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n);
const fmtShort = d => new Date(d + "T00:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
const fmtFull = d => new Date(d + "T00:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" });

const C = {
  bg: "#0c0d11", surface: "#13141a", surfaceAlt: "#191a22",
  border: "#1e1f2a", borderAlt: "#252635",
  accent: "#b8f763", accentDim: "#1e2e12",
  red: "#ff6b6b", redDim: "#2a1515",
  blue: "#5ba3e0", blueDim: "#0f1e30",
  text: "#ffffff", muted: "#cccccc", faint: "#aaaaaa",
};

// ── CHART ──────────────────────────────────────────────────
function CashFlowChart({ timeline, today, fmt }) {
  const svgRef = useRef(null);
  const [tooltip, setTooltip] = useState(null);
  const [dims, setDims] = useState({ w: 600, h: 340 });

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const obs = new ResizeObserver(entries => {
      const { width } = entries[0].contentRect;
      setDims({ w: width, h: 340 });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const PAD = { top: 28, right: 24, bottom: 52, left: 88 };
  const W = dims.w - PAD.left - PAD.right;
  const H = dims.h - PAD.top - PAD.bottom;

  const balances = timeline.map(d => d.balance);
  const rawMin = Math.min(...balances, 0);
  const rawMax = Math.max(...balances, 0);
  const spread = rawMax - rawMin || 1000000;
  const yMin = Math.min(rawMin - spread * 0.08, -20000000);
  const yMax = rawMax + spread * 0.08;
  const yRange = yMax - yMin;

  const xScale = i => (i / Math.max(timeline.length - 1, 1)) * W;
  const yScale = v => H - ((v - yMin) / yRange) * H;

  // Staircase / step path
  const buildStepPath = () => {
    if (timeline.length === 0) return "";
    let d = `M ${xScale(0).toFixed(1)},${yScale(timeline[0].balance).toFixed(1)}`;
    for (let i = 1; i < timeline.length; i++) {
      const x = xScale(i).toFixed(1);
      const y = yScale(timeline[i].balance).toFixed(1);
      const prevY = yScale(timeline[i - 1].balance).toFixed(1);
      d += ` L ${x},${prevY} L ${x},${y}`;
    }
    return d;
  };

  const linePath = buildStepPath();
  const areaPath = timeline.length
    ? `M ${xScale(0).toFixed(1)},${H} L ${xScale(0).toFixed(1)},${yScale(timeline[0].balance).toFixed(1)} ${linePath.slice(linePath.indexOf(" ") + 1)} L ${xScale(timeline.length - 1).toFixed(1)},${H} Z`
    : "";

  // Nice Y ticks
  const nTicks = 8;
  const rawStep = yRange / (nTicks - 1);
  const magnitude = Math.pow(10, Math.floor(Math.log10(Math.abs(rawStep) || 1)));
  const niceStep = Math.ceil(rawStep / magnitude) * magnitude || 1000000;
  const tickStart = Math.ceil(yMin / niceStep) * niceStep;
  const yTickVals = [];
  for (let v = tickStart; v <= yMax + niceStep * 0.1; v += niceStep) yTickVals.push(v);

  const xTickCount = Math.min(8, timeline.length);
  const xTickIndices = timeline.length > 1
    ? Array.from({ length: xTickCount }, (_, i) => Math.round((i / (xTickCount - 1)) * (timeline.length - 1)))
    : [0];

  const todayIdx = timeline.findIndex(d => d.date === today);

  const fmtShortDate = d => new Date(d + "T00:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
  const fmtMoney = n => {
    const abs = Math.abs(n);
    const sign = n < 0 ? "-" : "";
    if (abs >= 1000000) return sign + (abs / 1000000).toFixed(1) + "M";
    if (abs >= 1000) return sign + (abs / 1000).toFixed(0) + "K";
    return n.toFixed(0);
  };

  const handleMouseMove = e => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const x = e.clientX - rect.left - PAD.left;
    const ratio = Math.max(0, Math.min(1, x / W));
    const idx = Math.round(ratio * (timeline.length - 1));
    const d = timeline[idx];
    if (!d) return;
    setTooltip({ idx, x: xScale(idx), y: yScale(d.balance), date: d.date, balance: d.balance, movements: d.movements });
  };

  return (
    <div style={{ margin: "20px 20px 0", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "18px 16px 12px" }}>
      <div style={{ fontSize: 11, color: C.faint, letterSpacing: 1, marginBottom: 14 }}>
        FLUJO DE CAJA · PROYECCION · pasa el mouse para ver el saldo en cualquier fecha
      </div>
      <div ref={svgRef} style={{ width: "100%", position: "relative" }}>
        <svg width="100%" height={dims.h} onMouseMove={handleMouseMove} onMouseLeave={() => setTooltip(null)} style={{ cursor: "crosshair", overflow: "visible" }}>
          <defs>
            <linearGradient id="cfGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={C.accent} stopOpacity="0.2" />
              <stop offset="100%" stopColor={C.accent} stopOpacity="0.02" />
            </linearGradient>
          </defs>
          <g transform={`translate(${PAD.left},${PAD.top})`}>
            {yTickVals.map((v, i) => (
              <line key={i} x1={0} y1={yScale(v).toFixed(1)} x2={W} y2={yScale(v).toFixed(1)}
                stroke={v === 0 ? C.red : C.border} strokeWidth="1"
                strokeDasharray={v === 0 ? "6,3" : "4,4"} opacity={v === 0 ? "0.7" : "1"} />
            ))}
            {areaPath && <path d={areaPath} fill="url(#cfGrad)" />}
            {linePath && <path d={linePath} fill="none" stroke={C.accent} strokeWidth="2.5" strokeLinejoin="miter" strokeLinecap="square" />}
            {todayIdx >= 0 && <>
              <line x1={xScale(todayIdx).toFixed(1)} y1={0} x2={xScale(todayIdx).toFixed(1)} y2={H} stroke={C.accent} strokeWidth="1" strokeDasharray="4,3" opacity="0.7" />
              <text x={xScale(todayIdx)} y={-10} textAnchor="middle" fontSize="11" fill={C.accent} fontFamily="DM Mono,monospace" fontWeight="500">HOY</text>
            </>}
            {yTickVals.map((v, i) => (
              <text key={i} x={-10} y={yScale(v) + 4} textAnchor="end" fontSize="12"
                fill={v === 0 ? C.red : C.muted} fontFamily="DM Mono,monospace">
                {fmtMoney(v)}
              </text>
            ))}
            {xTickIndices.map(i => (
              <text key={i} x={xScale(i)} y={H + 20} textAnchor="middle" fontSize="12" fill={C.muted} fontFamily="DM Mono,monospace">
                {fmtShortDate(timeline[i].date)}
              </text>
            ))}
            <line x1={0} y1={0} x2={0} y2={H} stroke={C.borderAlt} strokeWidth="1" />
            <line x1={0} y1={H} x2={W} y2={H} stroke={C.borderAlt} strokeWidth="1" />
            {tooltip && <>
              <line x1={tooltip.x.toFixed(1)} y1={0} x2={tooltip.x.toFixed(1)} y2={H} stroke="#fff" strokeWidth="1" strokeDasharray="3,3" opacity="0.2" />
              <circle cx={tooltip.x.toFixed(1)} cy={tooltip.y.toFixed(1)} r="6" fill={C.accent} stroke={C.bg} strokeWidth="2" />
            </>}
          </g>
        </svg>
        {tooltip && (() => {
          const svgW = svgRef.current ? svgRef.current.getBoundingClientRect().width : dims.w;
          const absX = tooltip.x + PAD.left;
          const onRight = absX < svgW / 2;
          return (
            <div style={{ position: "absolute", top: Math.max(0, PAD.top + tooltip.y - 20), left: onRight ? absX + 16 : undefined, right: onRight ? undefined : svgW - absX + 16, background: C.surfaceAlt, border: `1px solid ${C.borderAlt}`, borderRadius: 10, padding: "10px 14px", pointerEvents: "none", minWidth: 200, zIndex: 10, boxShadow: "0 4px 20px rgba(0,0,0,0.4)" }}>
              <div style={{ fontSize: 11, color: C.faint, marginBottom: 5 }}>{fmtShortDate(tooltip.date)}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: tooltip.balance >= 0 ? C.accent : C.red, fontFamily: "'Syne',sans-serif", marginBottom: 6 }}>
                {fmt(tooltip.balance)}
              </div>
              {tooltip.movements.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 3, borderTop: `1px solid ${C.border}`, paddingTop: 6 }}>
                  {tooltip.movements.slice(0, 5).map((m, i) => (
                    <div key={i} style={{ fontSize: 11, color: m.type === "income" ? C.accent : C.red }}>
                      {m.type === "income" ? "+" : "-"}{fmt(m.amount)} · {m.description}
                    </div>
                  ))}
                  {tooltip.movements.length > 5 && <div style={{ fontSize: 10, color: C.faint }}>+{tooltip.movements.length - 5} mas</div>}
                </div>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}

// ── MAIN APP ───────────────────────────────────────────────
export default function App() {
  const [session, setSession] = useState(null);
  const [loginEmail, setLoginEmail] = useState("dmk@dmk.com");
  const [loginPass, setLoginPass] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  const handleLogin = async () => {
    setLoginError(""); setLoginLoading(true);
    try {
      if (IS_PREVIEW) {
        const user = LOCAL_USERS.find(u => u.email === loginEmail && u.password === loginPass);
        if (!user) throw new Error("incorrect");
        setSession({ token: null, email: loginEmail, isPreview: true });
      } else {
        const data = await authApi("token?grant_type=password", { email: loginEmail, password: loginPass });
        setSession({ token: data.access_token, email: data.user.email, isPreview: false });
      }
    } catch { setLoginError("Usuario o contrasena incorrectos"); }
    finally { setLoginLoading(false); }
  };

  if (!session) return (
    <div style={{ fontFamily: "'DM Mono', monospace", background: C.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Syne:wght@700;800&display=swap'); * { box-sizing: border-box; margin: 0; padding: 0; } .inp { background: ${C.surfaceAlt}; border: 1px solid ${C.borderAlt}; color: ${C.text}; padding: 12px 14px; border-radius: 8px; font-family: 'DM Mono',monospace; font-size: 14px; width: 100%; outline: none; } .inp:focus { border-color: ${C.accent}; }`}</style>
      <div style={{ width: "100%", maxWidth: 360 }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 24, fontWeight: 800, color: "#fff" }}>FLUJO <span style={{ color: C.accent }}>CAJA</span></div>
          <div style={{ fontSize: 12, color: C.faint, marginTop: 4 }}>DMK INGENIERIA SRL</div>
        </div>
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 28, display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <div style={{ fontSize: 10, color: C.faint, letterSpacing: 1, marginBottom: 6 }}>EMAIL</div>
            <input className="inp" type="email" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && handleLogin()} />
          </div>
          <div>
            <div style={{ fontSize: 10, color: C.faint, letterSpacing: 1, marginBottom: 6 }}>CONTRASENA</div>
            <input className="inp" type="password" value={loginPass} onChange={e => setLoginPass(e.target.value)} onKeyDown={e => e.key === "Enter" && handleLogin()} />
          </div>
          {loginError && <div style={{ fontSize: 12, color: C.red, textAlign: "center" }}>{loginError}</div>}
          <button onClick={handleLogin} disabled={loginLoading} style={{ background: C.accent, color: "#0c0d11", border: "none", padding: "12px", borderRadius: 8, fontFamily: "'DM Mono',monospace", fontSize: 14, fontWeight: 500, cursor: "pointer", width: "100%" }}>
            {loginLoading ? "INGRESANDO..." : "INGRESAR"}
          </button>
        </div>
        {IS_PREVIEW && <div style={{ fontSize: 10, color: C.faint, textAlign: "center", marginTop: 14 }}>Modo preview</div>}
      </div>
    </div>
  );

  return <Dashboard session={session} onLogout={() => setSession(null)} />;
}

// ── DASHBOARD ──────────────────────────────────────────────
function Dashboard({ session, onLogout }) {
  const [entries, setEntries] = useState([]);
  const [initialBalance, setInitialBalance] = useState(0);
  const [balanceInput, setBalanceInput] = useState("0");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [view, setView] = useState("timeline");
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [focusDate, setFocusDate] = useState(null);
  const [horizonMonths, setHorizonMonths] = useState(3);
  const [expandedDay, setExpandedDay] = useState(null);
  const [form, setForm] = useState({ type: "income", description: "", amount: "", date: todayStr(), category: "Ventas", recurring: false, recurring_frequency: "mensual", recurring_end_date: "" });
  const todayRef = useRef(null);
  const today = todayStr();

  const horizonDate = useMemo(() => addMonths(today, horizonMonths), [horizonMonths, today]);
  const fromDate = useMemo(() => addMonths(today, -3), [today]);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      if (session.isPreview) {
        setEntries(SAMPLE_ENTRIES); setInitialBalance(SAMPLE_BALANCE); setBalanceInput(SAMPLE_BALANCE.toString());
      } else {
        const [ents, sets] = await Promise.all([api("GET", "entries?order=date.asc"), api("GET", "settings?key=eq.initial_balance")]);
        setEntries(ents || []);
        if (sets?.[0]) { const v = parseFloat(sets[0].value) || 0; setInitialBalance(v); setBalanceInput(v.toString()); }
      }
    } catch (e) { setError("Error cargando datos"); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { if (!loading && todayRef.current) setTimeout(() => todayRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 300); }, [loading]);

  const timeline = useMemo(() => buildTimeline(entries, initialBalance, fromDate, horizonDate), [entries, initialBalance, fromDate, horizonDate]);

  const focusBalance = useMemo(() => {
    if (!focusDate) return null;
    const expanded = expandEntries(entries, focusDate);
    let bal = initialBalance;
    for (const e of expanded) if (e.date <= focusDate) bal += e.type === "income" ? +e.amount : -+e.amount;
    return bal;
  }, [focusDate, entries, initialBalance]);

  const todayBalance = useMemo(() => { const d = timeline.find(d => d.date === today); return d ? d.balance : initialBalance; }, [timeline, today, initialBalance]);
  const horizonBalance = useMemo(() => timeline.length ? timeline[timeline.length - 1].balance : initialBalance, [timeline, initialBalance]);
  const minBal = useMemo(() => Math.min(...timeline.map(d => d.balance), 0), [timeline]);
  const maxBal = useMemo(() => Math.max(...timeline.map(d => d.balance), 1), [timeline]);
  const balRange = maxBal - minBal || 1;

  const handleSubmit = async () => {
    if (!form.description || !form.amount || !form.date) return;
    const amt = parseFloat(form.amount.toString().replace(/[^\d.]/g, ""));
    if (isNaN(amt) || amt <= 0) return;
    setSaving(true);
    try {
      const payload = { type: form.type, description: form.description, amount: amt, date: form.date, category: form.category, recurring: form.recurring, recurring_frequency: form.recurring ? form.recurring_frequency : null, recurring_end_date: form.recurring && form.recurring_end_date ? form.recurring_end_date : null };
      if (session.isPreview) {
        if (editId !== null) setEntries(es => es.map(e => e.id === editId ? { ...e, ...payload } : e));
        else setEntries(es => [...es, { ...payload, id: Date.now() }]);
      } else {
        if (editId !== null) await api("PATCH", `entries?id=eq.${editId}`, payload);
        else await api("POST", "entries", payload);
        await load();
      }
      resetForm(); setShowForm(false);
    } catch (e) { setError("Error guardando: " + e.message); }
    finally { setSaving(false); }
  };

  const resetForm = () => { setForm({ type: "income", description: "", amount: "", date: todayStr(), category: "Ventas", recurring: false, recurring_frequency: "mensual", recurring_end_date: "" }); setEditId(null); };

  const startEdit = e => {
    setForm({ type: e.type, description: e.description, amount: e.amount.toString(), date: e.date, category: e.category, recurring: e.recurring || false, recurring_frequency: e.recurring_frequency || "mensual", recurring_end_date: e.recurring_end_date || "" });
    setEditId(typeof e.id === "number" ? e.id : null);
    setShowForm(true);
  };

  const del = async id => {
    if (session.isPreview) { setEntries(es => es.filter(e => e.id !== id)); return; }
    try { await api("DELETE", `entries?id=eq.${id}`); setEntries(es => es.filter(e => e.id !== id)); }
    catch { setError("Error eliminando"); }
  };

  const saveBalance = async () => {
    const val = parseFloat(balanceInput.replace(",", ".")) || 0;
    if (session.isPreview) { setInitialBalance(val); return; }
    try { await api("PATCH", "settings?key=eq.initial_balance", { value: val.toString() }); setInitialBalance(val); }
    catch { setError("Error guardando saldo"); }
  };

  const cats = form.type === "income" ? CATEGORIES_INCOME : CATEGORIES_EXPENSE;

  const CSS = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Syne:wght@700;800&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    ::-webkit-scrollbar { width: 4px; background: ${C.surface}; }
    ::-webkit-scrollbar-thumb { background: ${C.borderAlt}; border-radius: 2px; }
    .btn-p { background: ${C.accent}; color: #0c0d11; border: none; padding: 10px 20px; border-radius: 6px; font-family: 'DM Mono',monospace; font-size: 13px; cursor: pointer; font-weight: 500; }
    .btn-p:hover { filter: brightness(1.1); }
    .btn-p:disabled { opacity: .5; cursor: not-allowed; }
    .btn-g { background: transparent; color: ${C.muted}; border: 1px solid ${C.borderAlt}; padding: 7px 14px; border-radius: 6px; font-family: 'DM Mono',monospace; font-size: 12px; cursor: pointer; }
    .btn-g:hover { border-color: #555; color: #fff; }
    .btn-sm { background: transparent; color: ${C.muted}; border: 1px solid ${C.border}; padding: 3px 8px; border-radius: 4px; font-family: 'DM Mono',monospace; font-size: 11px; cursor: pointer; }
    .btn-sm:hover { border-color: ${C.borderAlt}; color: #fff; }
    .btn-d { background: transparent; color: ${C.red}; border: none; font-size: 11px; cursor: pointer; padding: 3px 6px; border-radius: 4px; font-family: 'DM Mono',monospace; }
    .btn-d:hover { background: ${C.redDim}; }
    .inp { background: ${C.surfaceAlt}; border: 1px solid ${C.borderAlt}; color: ${C.text}; padding: 10px 12px; border-radius: 6px; font-family: 'DM Mono',monospace; font-size: 13px; width: 100%; outline: none; }
    .inp:focus { border-color: ${C.accent}; }
    .tab { padding: 7px 14px; border-radius: 5px; cursor: pointer; font-size: 12px; border: none; font-family: 'DM Mono',monospace; }
    .pill { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 12px; font-weight: 500; }
    .overlay { position: fixed; inset: 0; background: rgba(0,0,0,.8); z-index: 100; display: flex; align-items: center; justify-content: center; padding: 16px; }
    .modal { background: ${C.surface}; border: 1px solid ${C.borderAlt}; border-radius: 14px; padding: 26px; width: 100%; max-width: 460px; max-height: 90vh; overflow-y: auto; }
    .day-line { border-left: 2px solid ${C.border}; margin-left: 16px; padding-left: 16px; position: relative; padding-top: 10px; padding-bottom: 10px; cursor: pointer; }
    .day-dot { width: 8px; height: 8px; border-radius: 50%; position: absolute; left: -5px; top: 16px; }
    select.inp option { background: ${C.surfaceAlt}; }
    input[type=range] { accent-color: ${C.accent}; width: 100%; cursor: pointer; }
    .spinner { display: inline-block; width: 12px; height: 12px; border: 2px solid #333; border-top-color: ${C.accent}; border-radius: 50%; animation: spin .7s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
  `;

  return (
    <div style={{ fontFamily: "'DM Mono', monospace", background: C.bg, minHeight: "100vh", color: C.text, paddingBottom: 80 }}>
      <style>{CSS}</style>

      {/* HEADER */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: "14px 20px", position: "sticky", top: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 19, fontWeight: 800, color: "#fff", letterSpacing: "-0.5px" }}>
            FLUJO <span style={{ color: C.accent }}>CAJA</span> <span style={{ fontSize: 13, fontWeight: 600 }}>DMK INGENIERIA SRL</span>
          </div>
          <div style={{ fontSize: 10, color: C.faint, marginTop: 2 }}>{session.email}{session.isPreview && <span style={{ color: C.blue }}> · preview</span>}</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {loading && <div className="spinner" />}
          <button className="btn-g" style={{ padding: "5px 10px", fontSize: 11 }} onClick={load}>↻</button>
          <button className="btn-p" onClick={() => { resetForm(); setShowForm(true); }}>+ NUEVO</button>
          <button className="btn-g" style={{ padding: "5px 10px", fontSize: 11 }} onClick={onLogout}>salir</button>
        </div>
      </div>

      {error && <div style={{ background: C.redDim, color: C.red, padding: "8px 20px", fontSize: 11, display: "flex", justifyContent: "space-between" }}>{error}<span style={{ cursor: "pointer" }} onClick={() => setError(null)}>✕</span></div>}

      {/* NAV */}
      <div style={{ display: "flex", gap: 6, padding: "14px 20px 0" }}>
        {[["timeline", "Linea de tiempo"], ["list", "Movimientos"], ["settings", "Config"]].map(([v, label]) => (
          <button key={v} className="tab" onClick={() => setView(v)}
            style={{ background: view === v ? C.surfaceAlt : "transparent", color: view === v ? C.text : C.faint, border: view === v ? `1px solid ${C.borderAlt}` : "1px solid transparent" }}>
            {label}
          </button>
        ))}
      </div>

      {/* TIMELINE */}
      {view === "timeline" && (
        <div style={{ padding: "16px 20px 0" }}>
          <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div style={{ flex: 1, minWidth: 170 }}>
              <div style={{ fontSize: 10, color: C.faint, letterSpacing: 1, marginBottom: 5 }}>SALTAR A FECHA</div>
              <input type="date" className="inp" style={{ padding: "8px 10px" }} value={focusDate || ""} onChange={e => setFocusDate(e.target.value || null)} />
            </div>
            <div style={{ flex: 2, minWidth: 200 }}>
              <div style={{ fontSize: 10, color: C.faint, letterSpacing: 1, marginBottom: 5 }}>HORIZONTE · {horizonMonths} {horizonMonths === 1 ? "MES" : "MESES"} → {fmtFull(horizonDate)}</div>
              <input type="range" min={1} max={24} value={horizonMonths} onChange={e => setHorizonMonths(+e.target.value)} />
            </div>
            {focusDate && <button className="btn-g" style={{ fontSize: 11, padding: "6px 10px" }} onClick={() => setFocusDate(null)}>✕</button>}
          </div>

          {focusDate && focusBalance !== null && (
            <div style={{ background: C.surface, border: `1px solid ${C.accent}55`, borderRadius: 10, padding: "14px 18px", marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 10, color: C.accent, letterSpacing: 1, marginBottom: 4 }}>SALDO AL {fmtFull(focusDate).toUpperCase()}</div>
                <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 26, fontWeight: 800, color: focusBalance >= 0 ? C.accent : C.red }}>{fmt(focusBalance)}</div>
              </div>
              <div style={{ fontSize: 26 }}>{focusBalance >= 0 ? "✓" : "⚠"}</div>
            </div>
          )}

          {/* KPIs */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
            {[
              { label: "SALDO HOY", val: todayBalance, color: todayBalance >= 0 ? C.accent : C.red },
              { label: `EN ${horizonMonths}M`, val: horizonBalance, color: horizonBalance >= 0 ? C.blue : C.red },
              { label: "INICIAL", val: initialBalance, color: C.muted },
            ].map(k => (
              <div key={k.label} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "12px 14px" }}>
                <div style={{ fontSize: 9, color: C.faint, letterSpacing: 1, marginBottom: 4 }}>{k.label}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: k.color, fontFamily: "'Syne',sans-serif" }}>{fmt(k.val)}</div>
              </div>
            ))}
          </div>

          {/* Timeline list */}
          {loading ? <div style={{ textAlign: "center", padding: 48, color: C.faint }}>Cargando...</div> :
            timeline.length === 0 ? <div style={{ textAlign: "center", padding: 48, color: C.faint, fontSize: 13 }}>Sin movimientos. Click en + NUEVO.</div> : (
              <div style={{ paddingLeft: 2 }}>
                {timeline.map((day, idx) => {
                  const isToday = day.date === today;
                  const isFuture = day.date > today;
                  const isFocus = day.date === focusDate;
                  const isExpanded = expandedDay === day.date;
                  const pct = Math.max(0, Math.min(100, ((day.balance - minBal) / balRange) * 100));
                  const prevBal = idx === 0 ? initialBalance : timeline[idx - 1].balance;
                  return (
                    <div key={day.date} ref={isToday ? todayRef : null} style={{ marginBottom: 1 }}>
                      <div className="day-line" style={{ borderLeftColor: isToday ? C.accent : isFuture ? C.borderAlt : C.border }}
                        onClick={() => setExpandedDay(isExpanded ? null : day.date)}>
                        <div className="day-dot" style={{ background: isToday ? C.accent : isFocus ? C.blue : day.balance < 0 ? C.red : isFuture ? C.borderAlt : C.faint, boxShadow: isToday ? `0 0 8px ${C.accent}99` : "none", width: isToday ? 11 : 8, height: isToday ? 11 : 8, left: isToday ? -6 : -5 }} />
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0, flexWrap: "wrap" }}>
                            <div style={{ fontSize: 13, color: isToday ? C.accent : isFuture ? C.muted : C.faint, whiteSpace: "nowrap", fontWeight: isToday ? 600 : 400, minWidth: 55 }}>
                              {isToday ? "HOY" : fmtShort(day.date)}
                            </div>
                            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                              {day.movements.map((m, i) => (
                                <span key={i} className="pill" style={{ background: m.type === "income" ? C.accentDim : C.redDim, color: m.type === "income" ? C.accent : C.red }}>
                                  {m.type === "income" ? "+" : "-"}{fmt(m.amount)} <span style={{ opacity: 0.75, fontSize: 11 }}>{m.description}</span>
                                </span>
                              ))}
                              {!day.movements.length && isToday && <span style={{ fontSize: 12, color: C.faint }}>sin movimientos</span>}
                            </div>
                          </div>
                          <div style={{ textAlign: "right", flexShrink: 0 }}>
                            <div style={{ fontSize: 16, fontWeight: 600, color: day.balance < 0 ? C.red : isFuture ? C.blue : C.text, fontFamily: "'Syne',sans-serif" }}>
                              {fmt(day.balance)}
                            </div>
                            <div style={{ width: 52, background: C.border, borderRadius: 2, marginTop: 3, marginLeft: "auto", height: 3, overflow: "hidden" }}>
                              <div style={{ width: `${pct}%`, height: "100%", background: day.balance < 0 ? C.red : day.balance >= prevBal ? C.accent : C.muted, borderRadius: 2 }} />
                            </div>
                          </div>
                        </div>
                        {isExpanded && day.movements.length > 0 && (
                          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                            {day.movements.map((m, i) => (
                              <div key={i} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 7, padding: "8px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: 13, color: C.text, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                                    {m.description}
                                    {m.isGenerated && <span className="pill" style={{ background: "#1e1e30", color: "#9090d0", fontSize: 10 }}>↻ auto</span>}
                                    {isFuture && <span className="pill" style={{ background: C.blueDim, color: C.blue, fontSize: 10 }}>futuro</span>}
                                  </div>
                                  <div style={{ fontSize: 11, color: C.faint, marginTop: 2 }}>{m.category}</div>
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                                  <div style={{ fontSize: 14, fontWeight: 600, color: m.type === "income" ? C.accent : C.red }}>
                                    {m.type === "income" ? "+" : "-"}{fmt(m.amount)}
                                  </div>
                                  {!m.isGenerated && <>
                                    <button className="btn-sm" onClick={e => { e.stopPropagation(); startEdit(m); }}>✎</button>
                                    <button className="btn-d" onClick={e => { e.stopPropagation(); del(m.id); }}>✕</button>
                                  </>}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

          {/* CHART */}
          {!loading && timeline.length > 1 && <CashFlowChart timeline={timeline} today={today} fmt={fmt} />}
        </div>
      )}

      {/* LIST */}
      {view === "list" && (
        <div style={{ padding: "16px 20px 0" }}>
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "86px 1fr 95px 115px 56px", background: C.surface, padding: "9px 14px", borderBottom: `1px solid ${C.border}` }}>
              {["FECHA", "DESCRIPCION", "CATEGORIA", "MONTO", ""].map((h, i) => <div key={i} style={{ fontSize: 10, color: C.faint, letterSpacing: 1 }}>{h}</div>)}
            </div>
            {entries.length === 0 && <div style={{ padding: "28px 14px", textAlign: "center", color: C.faint, fontSize: 13 }}>Sin movimientos</div>}
            {[...entries].sort((a, b) => a.date.localeCompare(b.date)).map(e => (
              <div key={e.id} style={{ display: "grid", gridTemplateColumns: "86px 1fr 95px 115px 56px", padding: "10px 14px", borderBottom: `1px solid ${C.border}`, alignItems: "center" }}
                onMouseEnter={ev => ev.currentTarget.style.background = C.surfaceAlt}
                onMouseLeave={ev => ev.currentTarget.style.background = "transparent"}>
                <div style={{ fontSize: 11, color: C.faint }}>{e.date}</div>
                <div style={{ fontSize: 13 }}>
                  {e.description}
                  {e.recurring && <span className="pill" style={{ background: "#1e1e30", color: "#9090d0", fontSize: 10, marginLeft: 5 }}>↻ {e.recurring_frequency}</span>}
                  {e.date > today && <span className="pill" style={{ background: C.blueDim, color: C.blue, fontSize: 10, marginLeft: 4 }}>futuro</span>}
                </div>
                <div style={{ fontSize: 11, color: C.faint }}>{e.category}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: e.type === "income" ? C.accent : C.red }}>
                  {e.type === "income" ? "+" : "-"}{fmt(e.amount)}
                </div>
                <div style={{ display: "flex", gap: 3 }}>
                  <button className="btn-sm" onClick={() => startEdit(e)}>✎</button>
                  <button className="btn-d" onClick={() => del(e.id)}>✕</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SETTINGS */}
      {view === "settings" && (
        <div style={{ padding: "20px 20px 0", maxWidth: 420 }}>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 20 }}>
            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 13, fontWeight: 800, marginBottom: 10, color: "#fff" }}>SALDO INICIAL</div>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 14 }}>El punto de partida de tu flujo. Todos los movimientos suman o restan sobre este valor.</div>
            <div style={{ display: "flex", gap: 10 }}>
              <input className="inp" type="number" value={balanceInput} onChange={e => setBalanceInput(e.target.value)} placeholder="Ej: 500000" />
              <button className="btn-p" onClick={saveBalance} style={{ whiteSpace: "nowrap" }}>GUARDAR</button>
            </div>
            <div style={{ marginTop: 10, fontSize: 12, color: C.faint }}>Actual: <span style={{ color: C.accent }}>{fmt(initialBalance)}</span></div>
          </div>
        </div>
      )}

      {/* FORM MODAL */}
      {showForm && (
        <div className="overlay" onClick={ev => { if (ev.target === ev.currentTarget) { setShowForm(false); resetForm(); } }}>
          <div className="modal">
            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 15, fontWeight: 800, marginBottom: 18, color: "#fff" }}>
              {editId ? "EDITAR" : "NUEVO MOVIMIENTO"}
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              {["income", "expense"].map(t => (
                <button key={t} className="tab" onClick={() => setForm(f => ({ ...f, type: t, category: t === "income" ? "Ventas" : "Nomina" }))}
                  style={{ flex: 1, padding: 10, background: form.type === t ? (t === "income" ? C.accentDim : C.redDim) : C.surfaceAlt, color: form.type === t ? (t === "income" ? C.accent : C.red) : C.muted, border: `1px solid ${form.type === t ? (t === "income" ? "#2a4a1a" : "#4a1a1a") : C.borderAlt}` }}>
                  {t === "income" ? "▲ INGRESO" : "▼ EGRESO"}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <input className="inp" placeholder="Descripcion" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              <input className="inp" placeholder="Monto" type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
              <input className="inp" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
              <select className="inp" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                {cats.map(c => <option key={c}>{c}</option>)}
              </select>
              <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: C.muted, cursor: "pointer" }}>
                <input type="checkbox" checked={form.recurring} onChange={e => setForm(f => ({ ...f, recurring: e.target.checked }))} style={{ accentColor: C.accent }} />
                Movimiento recurrente
              </label>
              {form.recurring && (
                <div style={{ background: C.surfaceAlt, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 10, color: C.faint, letterSpacing: 1, marginBottom: 6 }}>FRECUENCIA</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {FREQ_OPTIONS.map(f => (
                        <button key={f} className="tab" onClick={() => setForm(fm => ({ ...fm, recurring_frequency: f }))}
                          style={{ padding: "5px 11px", fontSize: 11, background: form.recurring_frequency === f ? C.accentDim : "transparent", color: form.recurring_frequency === f ? C.accent : C.muted, border: `1px solid ${form.recurring_frequency === f ? "#2a4a1a" : C.borderAlt}` }}>
                          {f}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: C.faint, letterSpacing: 1, marginBottom: 6 }}>FECHA FIN (opcional)</div>
                    <input className="inp" type="date" value={form.recurring_end_date} onChange={e => setForm(f => ({ ...f, recurring_end_date: e.target.value }))} />
                  </div>
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button className="btn-p" style={{ flex: 1 }} onClick={handleSubmit} disabled={saving}>
                {saving ? "GUARDANDO..." : editId ? "GUARDAR" : "AGREGAR"}
              </button>
              <button className="btn-g" onClick={() => { setShowForm(false); resetForm(); }}>CANCELAR</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
