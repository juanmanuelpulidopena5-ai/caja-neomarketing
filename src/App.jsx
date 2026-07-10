import React, { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "./supabaseClient";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid,
} from "recharts";
import {
  Plus, Trash2, ShoppingCart, CalendarDays, TrendingUp, Package,
  ChevronLeft, ChevronRight, X, Coffee, Pencil, Check, Search, Clock, PlayCircle, LogOut,
} from "lucide-react";

/* ---------- paleta / tokens (tema claro, sin efectos LED) ---------- */
const C = {
  bg: "#F3EFE6",
  header: "#C08A3E",
  headerDark: "#A5722F",
  paper: "#FFFFFF",
  border: "#E5DCC7",
  ink: "#2B2119",
  inkDim: "#8A7A63",
  gold: "#D9A441",
  goldDark: "#B8863B",
  goldSoft: "#F4E6C7",
  danger: "#B5453D",
  dangerSoft: "#F3DEDB",
};

const METHODS = [
  { id: "efectivo", label: "Efectivo", color: "#D9A441" },
  { id: "nequi", label: "Nequi", color: "#C9714F" },
  { id: "daviplata", label: "Daviplata", color: "#9E5540" },
  { id: "tarjeta", label: "Tarjeta", color: "#8A7A4B" },
  { id: "transferencia", label: "Transferencia", color: "#B8863B" },
];
const methodColor = (id) => METHODS.find((m) => m.id === id)?.color || "#999";
const methodLabel = (id) => METHODS.find((m) => m.id === id)?.label || id;

const fmt = (n) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n || 0);

const normalize = (s) =>
  (s || "").toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

const toISO = (d) => {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
const parseISO = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const weekStartOf = (d) => {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const mon = new Date(d);
  mon.setDate(d.getDate() + diff);
  mon.setHours(0, 0, 0, 0);
  return mon;
};
const addDays = (d, n) => { const c = new Date(d); c.setDate(c.getDate() + n); return c; };
const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

/* ---------- caja de información (reemplaza el visor con brillo) ---------- */
function VFD({ label, value, small, tone }) {
  const valueColor = tone === "danger" ? C.danger : tone === "accent" ? C.goldDark : C.ink;
  return (
    <div
      className="rounded-lg px-3 py-2 flex flex-col"
      style={{ background: C.paper, border: `1px solid ${C.border}` }}
    >
      <span className="text-[10px] uppercase tracking-widest mb-1" style={{ color: C.inkDim, fontFamily: "Manrope, sans-serif", fontWeight: 700 }}>
        {label}
      </span>
      <span
        className={small ? "text-base" : "text-xl"}
        style={{
          color: valueColor,
          fontFamily: "'JetBrains Mono', monospace",
          fontWeight: 700,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {fmt(value)}
      </span>
    </div>
  );
}

/* ---------- botón tipo pestaña / selección ---------- */
function KeyBtn({ active, onClick, children, style }) {
  return (
    <button
      onClick={onClick}
      className="transition-colors"
      style={{
        fontFamily: "Manrope, sans-serif",
        fontWeight: 600,
        borderRadius: 8,
        border: `1px solid ${active ? C.gold : C.border}`,
        background: active ? C.gold : "#FFFFFF",
        color: active ? "#FFFFFF" : C.ink,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function SectionLabel({ children }) {
  return (
    <span className="text-xs uppercase tracking-widest" style={{ color: C.goldDark, fontFamily: "Manrope, sans-serif", fontWeight: 700 }}>
      {children}
    </span>
  );
}

function Card({ children, style }) {
  return (
    <div className="rounded-lg p-4" style={{ background: C.paper, border: `1px solid ${C.border}`, ...style }}>
      {children}
    </div>
  );
}

/* ================= APP RAÍZ: maneja sesión ================= */
export default function CajaRoot() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, sess) => setSession(sess));
    return () => data.subscription.unsubscribe();
  }, []);

  if (authLoading) {
    return (
      <div style={{ background: C.bg, minHeight: "100vh" }} className="flex items-center justify-center">
        <span style={{ color: C.goldDark, fontFamily: "'JetBrains Mono', monospace" }}>Cargando…</span>
      </div>
    );
  }

  if (!session) return <LoginScreen />;

  return <CajaApp session={session} />;
}

/* ================= LOGIN ================= */
function LoginScreen() {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setMsg(""); setBusy(true);
    if (mode === "signup") {
      const { error } = await supabase.auth.signUp({ email, password });
      setBusy(false);
      setMsg(error ? error.message : "Cuenta creada. Si tu proyecto pide confirmación, revisa tu correo y luego inicia sesión.");
      if (!error) setMode("signin");
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setBusy(false);
      if (error) setMsg(error.message);
    }
  };

  return (
    <div style={{ background: C.bg, minHeight: "100vh", fontFamily: "Manrope, sans-serif" }} className="flex items-center justify-center px-5">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&family=Manrope:wght@400;600;700;800&display=swap');`}</style>
      <div className="w-full max-w-sm rounded-lg p-6" style={{ background: C.paper, border: `1px solid ${C.border}` }}>
        <div className="flex items-center gap-2 justify-center mb-6">
          <Coffee size={22} color={C.goldDark} />
          <span style={{ color: C.ink, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, letterSpacing: "0.06em" }} className="text-lg">
            NeoMarketing
          </span>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <input type="email" required placeholder="Correo" value={email} onChange={(e) => setEmail(e.target.value)}
            className="px-3 py-2 text-sm rounded" style={{ background: "#FFFFFF", color: C.ink, border: `1px solid ${C.border}` }} />
          <input type="password" required placeholder="Contraseña" value={password} onChange={(e) => setPassword(e.target.value)}
            className="px-3 py-2 text-sm rounded" style={{ background: "#FFFFFF", color: C.ink, border: `1px solid ${C.border}` }} />
          <button type="submit" disabled={busy} className="py-3 rounded-lg font-bold" style={{ background: C.gold, color: "#FFFFFF" }}>
            {mode === "signup" ? "Crear cuenta" : "Iniciar sesión"}
          </button>
        </form>
        {msg && <p className="text-xs mt-3 text-center" style={{ color: C.goldDark }}>{msg}</p>}
        <button
          onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setMsg(""); }}
          className="text-xs mt-4 w-full text-center underline"
          style={{ color: C.inkDim }}
        >
          {mode === "signin" ? "¿No tienes cuenta? Regístrate" : "¿Ya tienes cuenta? Inicia sesión"}
        </button>
      </div>
    </div>
  );
}

/* ================= APP PRINCIPAL (con sesión activa) ================= */
function CajaApp({ session }) {
  const userId = session.user.id;

  const [products, setProducts] = useState([]);
  const [tables, setTables] = useState([]);
  const [sales, setSales] = useState([]);
  const [pending, setPending] = useState([]);
  const [cashBases, setCashBases] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("vender");

  const loadAll = useCallback(async () => {
    try {
      const [p, t, s, pe, cb, wd] = await Promise.all([
        supabase.from("products").select("*").eq("user_id", userId),
        supabase.from("tables_config").select("*").eq("user_id", userId),
        supabase.from("sales").select("*").eq("user_id", userId),
        supabase.from("pending_sales").select("*").eq("user_id", userId),
        supabase.from("cash_base").select("*").eq("user_id", userId),
        supabase.from("cash_withdrawals").select("*").eq("user_id", userId),
      ]);

      if (p.error) throw p.error;
      if (t.error) throw t.error;
      if (s.error) throw s.error;
      if (pe.error) throw pe.error;
      if (cb.error) throw cb.error;
      if (wd.error) throw wd.error;

      setProducts((p.data || []).map((r) => ({ id: r.id, name: r.name, price: Number(r.price) })));
      setTables((t.data || []).map((r) => ({ id: r.id, name: r.name })));
      setSales((s.data || []).map((r) => ({
        id: r.id,
        date: r.date,
        time: r.time,
        items: r.items,
        total: Number(r.total),
        method: r.method,
        tableId: r.table_id,
        tableName: r.table_name,
        cashReceived: r.cash_received != null ? Number(r.cash_received) : null,
        change: r.change != null ? Number(r.change) : null,
      })));
      setPending((pe.data || []).map((r) => ({
        id: r.id,
        tableId: r.table_id,
        tableName: r.table_name,
        cart: r.cart,
        method: r.method,
        createdAt: new Date(r.created_at).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" }),
      })));
      setCashBases((cb.data || []).map((r) => ({ id: r.id, date: r.date, amount: Number(r.amount) })));
      setWithdrawals((wd.data || []).map((r) => ({
        id: r.id, date: r.date, description: r.description, amount: Number(r.amount), time: r.time,
      })));

      setError("");
    } catch (e) {
      console.error("Error detallado:", e);
      setError("No se pudieron cargar los datos.");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { loadAll(); }, [loadAll]);

  /* ---------- productos ---------- */
  const addProduct = async (name, price) => {
    if (!name.trim() || !price) return;
    const { error: e } = await supabase.from("products").insert({ user_id: userId, name: name.trim(), price: Number(price) });
    if (e) setError("No se guardó el producto."); else loadAll();
  };
  const editProduct = async (id, name, price) => {
    const { error: e } = await supabase.from("products").update({ name, price: Number(price) }).eq("id", id);
    if (e) setError("No se guardó el cambio."); else loadAll();
  };
  const deleteProduct = async (id) => {
    const { error: e } = await supabase.from("products").delete().eq("id", id);
    if (e) setError("No se pudo eliminar el producto."); else loadAll();
  };

  /* ---------- mesas ---------- */
  const addTable = async (name) => {
    if (!name.trim()) return;
    const { error: e } = await supabase.from("tables_config").insert({ user_id: userId, name: name.trim() });
    if (e) setError("No se guardó la mesa."); else loadAll();
  };
  const editTable = async (id, name) => {
    if (!name.trim()) return;
    const { error: e } = await supabase.from("tables_config").update({ name: name.trim() }).eq("id", id);
    if (e) setError("No se guardó el cambio."); else loadAll();
  };
  const deleteTable = async (id) => {
    const { error: e } = await supabase.from("tables_config").delete().eq("id", id);
    if (e) setError("No se pudo eliminar la mesa."); else loadAll();
    if (selectedTable === id) setSelectedTable(null);
  };

  /* ---------- venta activa (solo local hasta registrar/pausar) ---------- */
  const [cart, setCart] = useState([]);
  const [method, setMethod] = useState(null);
  const [selectedTable, setSelectedTable] = useState(null);
  const [customName, setCustomName] = useState("");
  const [customPrice, setCustomPrice] = useState("");
  const [cashReceived, setCashReceived] = useState("");
  const [saleMsg, setSaleMsg] = useState("");

  const addToCart = (item) => {
    setCart((prev) => {
      const idx = prev.findIndex((i) => i.id === item.id);
      if (idx > -1) { const c = [...prev]; c[idx] = { ...c[idx], qty: c[idx].qty + 1 }; return c; }
      return [...prev, { ...item, qty: 1 }];
    });
  };
  const decFromCart = (id) => setCart((prev) => prev.flatMap((i) => (i.id === id ? (i.qty > 1 ? [{ ...i, qty: i.qty - 1 }] : []) : [i])));
  const removeFromCart = (id) => setCart((prev) => prev.filter((i) => i.id !== id));
  const cartTotal = cart.reduce((s, i) => s + i.price * i.qty, 0);

  const registerSale = async () => {
    if (cart.length === 0) { setSaleMsg("Agrega al menos un producto."); return; }
    if (!method) { setSaleMsg("Selecciona cómo pagaron."); return; }
    const now = new Date();
    const tableObj = tables.find((t) => t.id === selectedTable);
    const received = cashReceived !== "" ? Number(cashReceived) : null;
    const changeDue = received !== null ? received - cartTotal : null;
    const { error: e } = await supabase.from("sales").insert({
      user_id: userId,
      date: toISO(now),
      time: now.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" }),
      items: cart.map(({ id, name, price, qty }) => ({ id, name, price, qty })),
      total: cartTotal,
      method,
      table_id: selectedTable || null,
      table_name: tableObj ? tableObj.name : null,
      cash_received: received,
      change: changeDue,
    });
    if (e) { setSaleMsg("No se pudo registrar la venta."); return; }
    setCart([]); setMethod(null); setSelectedTable(null); setCashReceived("");
    setSaleMsg("Venta registrada ✓");
    setTimeout(() => setSaleMsg(""), 2000);
    loadAll();
  };

  const deleteSale = async (id) => {
    const { error: e } = await supabase.from("sales").delete().eq("id", id);
    if (!e) loadAll();
  };

  /* ---------- pausar / reanudar ---------- */
  const pauseSale = async () => {
    if (cart.length === 0) { setSaleMsg("Agrega al menos un producto para pausar."); return; }
    const tableObj = tables.find((t) => t.id === selectedTable);
    const { error: e } = await supabase.from("pending_sales").insert({
      user_id: userId,
      table_id: selectedTable || null,
      table_name: tableObj ? tableObj.name : null,
      cart,
      method,
    });
    if (e) { setSaleMsg("No se pudo pausar la venta."); return; }
    setCart([]); setMethod(null); setSelectedTable(null); setCashReceived("");
    setSaleMsg("Venta pausada ✓");
    setTimeout(() => setSaleMsg(""), 2000);
    loadAll();
  };

  const resumePending = async (id) => {
    const entry = pending.find((p) => p.id === id);
    if (!entry) return;
    if (cart.length > 0 && !window.confirm("Esto reemplazará la cuenta actual en Vender. ¿Continuar?")) return;
    setCart(entry.cart);
    setMethod(entry.method);
    setSelectedTable(entry.tableId);
    setCashReceived("");
    const { error: e } = await supabase.from("pending_sales").delete().eq("id", id);
    if (!e) loadAll();
    setTab("vender");
  };

  const deletePending = async (id) => {
    const { error: e } = await supabase.from("pending_sales").delete().eq("id", id);
    if (!e) loadAll();
  };

  /* ---------- base de caja y retiros ---------- */
  const setCashBase = async (date, amount) => {
    if (amount === "" || isNaN(Number(amount))) return;
    const { error: e } = await supabase.from("cash_base").upsert(
      { user_id: userId, date, amount: Number(amount) },
      { onConflict: "user_id,date" }
    );
    if (e) setError("No se guardó la base de caja."); else loadAll();
  };

  const addWithdrawal = async (date, description, amount) => {
    if (!amount) return;
    const now = new Date();
    const { error: e } = await supabase.from("cash_withdrawals").insert({
      user_id: userId,
      date,
      description: description.trim() || "Retiro",
      amount: Number(amount),
      time: now.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" }),
    });
    if (e) setError("No se guardó el retiro."); else loadAll();
  };

  const deleteWithdrawal = async (id) => {
    const { error: e } = await supabase.from("cash_withdrawals").delete().eq("id", id);
    if (!e) loadAll();
  };

  /* ---------- caja del día ---------- */
  const [selDate, setSelDate] = useState(toISO(new Date()));
  const daySales = useMemo(() => sales.filter((s) => s.date === selDate), [sales, selDate]);
  const dayByMethod = useMemo(() => {
    const m = {}; METHODS.forEach((mm) => (m[mm.id] = 0));
    daySales.forEach((s) => (m[s.method] = (m[s.method] || 0) + s.total));
    return m;
  }, [daySales]);
  const dayTotal = daySales.reduce((s, x) => s + x.total, 0);

  /* ---------- progreso semana / mes ---------- */
  const [progView, setProgView] = useState("semana");
  const [weekStart, setWeekStart] = useState(weekStartOf(new Date()));
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const weekChart = useMemo(
    () => weekDays.map((d, i) => {
      const iso = toISO(d);
      const total = sales.filter((s) => s.date === iso).reduce((s, x) => s + x.total, 0);
      return { label: DIAS[i], total, iso };
    }), [weekDays, sales]
  );
  const weekTotal = weekChart.reduce((s, d) => s + d.total, 0);
  const weekByMethod = useMemo(() => {
    const m = {}; METHODS.forEach((mm) => (m[mm.id] = 0));
    sales.filter((s) => weekChart.some((d) => d.iso === s.date)).forEach((s) => (m[s.method] = (m[s.method] || 0) + s.total));
    return m;
  }, [sales, weekChart]);

  const [monthCursor, setMonthCursor] = useState({ y: new Date().getFullYear(), m: new Date().getMonth() });
  const monthWeeks = useMemo(() => {
    const lastDay = new Date(monthCursor.y, monthCursor.m + 1, 0).getDate();
    const weeks = [];
    for (let start = 1; start <= lastDay; start += 7) {
      const end = Math.min(start + 6, lastDay);
      weeks.push({ label: `Sem ${weeks.length + 1}`, start, end });
    }
    return weeks.map((w) => {
      const total = sales
        .filter((s) => { const d = parseISO(s.date); return d.getFullYear() === monthCursor.y && d.getMonth() === monthCursor.m && d.getDate() >= w.start && d.getDate() <= w.end; })
        .reduce((s, x) => s + x.total, 0);
      return { ...w, total };
    });
  }, [monthCursor, sales]);
  const monthTotal = monthWeeks.reduce((s, w) => s + w.total, 0);
  const monthByMethod = useMemo(() => {
    const m = {}; METHODS.forEach((mm) => (m[mm.id] = 0));
    sales
      .filter((s) => { const d = parseISO(s.date); return d.getFullYear() === monthCursor.y && d.getMonth() === monthCursor.m; })
      .forEach((s) => (m[s.method] = (m[s.method] || 0) + s.total));
    return m;
  }, [sales, monthCursor]);

  const pendingCount = pending.length;
  const TABS = [
    { id: "vender", label: "Vender", icon: ShoppingCart },
    { id: "pausadas", label: "Pausadas", icon: Clock, badge: pendingCount },
    { id: "caja", label: "Caja del día", icon: CalendarDays },
    { id: "progreso", label: "Progreso", icon: TrendingUp },
    { id: "productos", label: "Productos", icon: Package },
  ];

  if (loading) {
    return (
      <div style={{ background: C.bg, minHeight: "100vh" }} className="flex items-center justify-center">
        <span style={{ color: C.goldDark, fontFamily: "'JetBrains Mono', monospace" }}>Cargando caja…</span>
      </div>
    );
  }

  return (
    <div style={{ background: C.bg, minHeight: "100vh", fontFamily: "Manrope, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&family=Manrope:wght@400;600;700;800&display=swap');
        input[type="date"] { color-scheme: light; }
      `}</style>

      {/* barra superior */}
      <div style={{ background: C.header }}>
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Coffee size={20} color="#FFFFFF" />
            <span style={{ color: "#FFFFFF", fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, letterSpacing: "0.06em" }} className="text-lg">
              NeoMarketing
            </span>
          </div>
          <button onClick={() => supabase.auth.signOut()} style={{ color: "#FFFFFF" }} className="flex items-center gap-1 text-sm">
            <LogOut size={16} /> Cerrar sesión
          </button>
        </div>
      </div>

      {/* pestañas de navegación */}
      <div style={{ background: C.paper, borderBottom: `1px solid ${C.border}` }}>
        <div className="max-w-5xl mx-auto px-6 flex gap-1 overflow-x-auto">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className="flex items-center gap-2 px-4 py-3 text-sm font-semibold whitespace-nowrap relative"
                style={{
                  color: active ? C.goldDark : C.inkDim,
                  borderBottom: active ? `3px solid ${C.gold}` : "3px solid transparent",
                }}
              >
                <Icon size={15} />
                {t.label}
                {!!t.badge && (
                  <span
                    className="flex items-center justify-center"
                    style={{
                      minWidth: 16, height: 16, borderRadius: 8, background: C.danger, color: "#fff",
                      fontSize: 10, fontWeight: 700, padding: "0 4px",
                    }}
                  >
                    {t.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="max-w-5xl mx-auto px-6 pt-3">
          <p className="text-sm" style={{ color: C.danger }}>{error}</p>
        </div>
      )}

      <div className="max-w-5xl mx-auto px-6 py-6">
        {tab === "vender" && (
          <VenderTab
            products={products} cart={cart} addToCart={addToCart} decFromCart={decFromCart}
            removeFromCart={removeFromCart} cartTotal={cartTotal} method={method} setMethod={setMethod}
            customName={customName} setCustomName={setCustomName} customPrice={customPrice} setCustomPrice={setCustomPrice}
            registerSale={registerSale} saleMsg={saleMsg}
            tables={tables} selectedTable={selectedTable} setSelectedTable={setSelectedTable}
            cashReceived={cashReceived} setCashReceived={setCashReceived}
            pauseSale={pauseSale}
          />
        )}
        {tab === "pausadas" && (
          <PausadasTab pending={pending} resumePending={resumePending} deletePending={deletePending} />
        )}
        {tab === "caja" && (
          <CajaTab
            selDate={selDate} setSelDate={setSelDate} daySales={daySales} dayByMethod={dayByMethod}
            dayTotal={dayTotal} deleteSale={deleteSale}
            cashBases={cashBases} withdrawals={withdrawals}
            setCashBase={setCashBase} addWithdrawal={addWithdrawal} deleteWithdrawal={deleteWithdrawal}
          />
        )}
        {tab === "progreso" && (
          <ProgresoTab
            progView={progView} setProgView={setProgView}
            weekStart={weekStart} setWeekStart={setWeekStart} weekChart={weekChart} weekTotal={weekTotal} weekByMethod={weekByMethod}
            monthCursor={monthCursor} setMonthCursor={setMonthCursor} monthWeeks={monthWeeks} monthTotal={monthTotal} monthByMethod={monthByMethod}
          />
        )}
        {tab === "productos" && (
          <ProductosTab
            products={products} addProduct={addProduct} editProduct={editProduct} deleteProduct={deleteProduct}
            tables={tables} addTable={addTable} editTable={editTable} deleteTable={deleteTable}
          />
        )}
      </div>
    </div>
  );
}

/* ================= VENDER ================= */
function VenderTab({
  products, cart, addToCart, decFromCart, removeFromCart, cartTotal, method, setMethod,
  customName, setCustomName, customPrice, setCustomPrice, registerSale, saleMsg,
  tables, selectedTable, setSelectedTable, cashReceived, setCashReceived, pauseSale,
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = normalize(query);
    if (!q) return products;
    return products.filter((p) => normalize(p.name).includes(q));
  }, [products, query]);

  const handlePick = (p) => { addToCart(p); setQuery(""); };
  const change = cashReceived ? Number(cashReceived) - cartTotal : 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* columna izquierda: catálogo, mesa, ítem suelto, cuenta */}
      <div className="md:col-span-2 flex flex-col gap-5">
        <Card>
          <SectionLabel>Buscar producto</SectionLabel>
          <div className="relative mt-2">
            <Search size={16} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: C.inkDim }} />
            <input placeholder="Escribe el nombre del producto…" value={query} onChange={(e) => setQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-sm rounded" style={{ background: "#FFFFFF", color: C.ink, border: `1px solid ${C.border}` }} />
            {query && (
              <button onClick={() => setQuery("")} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", color: C.inkDim }}>
                <X size={14} />
              </button>
            )}
          </div>
          <div className="mt-2 rounded-lg overflow-hidden" style={{ border: `1px solid ${C.border}`, maxHeight: 240, overflowY: "auto" }}>
            {filtered.length === 0 && (
              <p className="text-sm px-3 py-3" style={{ color: C.inkDim }}>
                {products.length === 0 ? "Agrega productos en la pestaña \"Productos\"." : "Sin resultados para esa búsqueda."}
              </p>
            )}
            {filtered.map((p, idx) => (
              <button
                key={p.id}
                onClick={() => handlePick(p)}
                className="w-full flex items-center justify-between px-3 py-2 text-left"
                style={{ borderBottom: idx < filtered.length - 1 ? `1px solid ${C.border}` : "none", background: "#FFFFFF" }}
              >
                <span className="text-sm" style={{ color: C.ink }}>{p.name}</span>
                <span className="text-xs font-bold" style={{ color: C.goldDark, fontFamily: "'JetBrains Mono', monospace" }}>{fmt(p.price)}</span>
              </button>
            ))}
          </div>
        </Card>

        <Card>
          <SectionLabel>Mesa</SectionLabel>
          <div className="flex flex-wrap gap-2 mt-2">
            <KeyBtn active={!selectedTable} onClick={() => setSelectedTable(null)} style={{ padding: "8px 12px" }}>Sin mesa</KeyBtn>
            {tables.map((t) => (
              <KeyBtn key={t.id} active={selectedTable === t.id} onClick={() => setSelectedTable(t.id)} style={{ padding: "8px 12px" }}>{t.name}</KeyBtn>
            ))}
            {tables.length === 0 && <p className="text-xs self-center" style={{ color: C.inkDim }}>Agrega mesas en la pestaña "Productos".</p>}
          </div>
        </Card>

        <Card>
          <SectionLabel>Ítem suelto</SectionLabel>
          <div className="flex gap-2 mt-2">
            <input placeholder="Nombre" value={customName} onChange={(e) => setCustomName(e.target.value)}
              className="flex-1 min-w-0 px-2 py-2 text-sm rounded" style={{ background: "#FFFFFF", color: C.ink, border: `1px solid ${C.border}` }} />
            <input placeholder="Valor" inputMode="numeric" value={customPrice} onChange={(e) => setCustomPrice(e.target.value.replace(/\D/g, ""))}
              className="w-24 px-2 py-2 text-sm rounded" style={{ background: "#FFFFFF", color: C.ink, border: `1px solid ${C.border}` }} />
            <button onClick={() => {
                if (!customName.trim() || !customPrice) return;
                addToCart({ id: "custom-" + Date.now(), name: customName.trim(), price: Number(customPrice) });
                setCustomName(""); setCustomPrice("");
              }} className="px-3 rounded" style={{ background: C.gold, color: "#FFFFFF" }}>
              <Plus size={16} />
            </button>
          </div>
        </Card>

        <Card>
          <SectionLabel>Cuenta</SectionLabel>
          <div className="mt-2" style={{ minHeight: 60 }}>
            {cart.length === 0 && <p className="text-sm" style={{ color: C.inkDim }}>Busca un producto para agregarlo.</p>}
            {cart.map((i) => (
              <div key={i.id} className="flex items-center justify-between py-2" style={{ borderBottom: `1px solid ${C.border}` }}>
                <div className="text-sm" style={{ color: C.ink }}>{i.name} <span style={{ color: C.inkDim }}>x{i.qty}</span></div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold" style={{ color: C.ink, fontFamily: "'JetBrains Mono', monospace" }}>{fmt(i.price * i.qty)}</span>
                  <button onClick={() => decFromCart(i.id)} style={{ color: C.inkDim }}>−</button>
                  <button onClick={() => removeFromCart(i.id)} style={{ color: C.danger }}><X size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* columna derecha: información de venta */}
      <div className="md:col-span-1">
        <div className="flex flex-col gap-4 sticky top-4">
          <Card>
            <SectionLabel>Información de venta</SectionLabel>
            <div className="mt-3 flex flex-col gap-2">
              <VFD label="Total cuenta" value={cartTotal} tone="accent" />
            </div>
          </Card>

          <Card>
            <SectionLabel>Pago</SectionLabel>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {METHODS.map((m) => (
                <KeyBtn key={m.id} onClick={() => setMethod(m.id)} active={method === m.id}
                  style={{ padding: "10px 8px", borderColor: method === m.id ? m.color : C.border }}>
                  <span className="text-sm">{m.label}</span>
                </KeyBtn>
              ))}
            </div>
          </Card>

          <Card>
            <SectionLabel>Pago recibido</SectionLabel>
            <input placeholder="¿Cuánto dio el cliente?" inputMode="numeric" value={cashReceived}
              onChange={(e) => setCashReceived(e.target.value.replace(/\D/g, ""))}
              className="w-full mt-2 px-2 py-2 text-sm rounded" style={{ background: "#FFFFFF", color: C.ink, border: `1px solid ${C.border}` }} />
            {cashReceived !== "" && (
              <div className="mt-2"><VFD label={change < 0 ? "Falta" : "Vueltas"} value={Math.abs(change)} tone={change < 0 ? "danger" : "accent"} /></div>
            )}
          </Card>

          <div className="flex flex-col gap-2">
            <button onClick={registerSale} className="py-3 rounded-lg font-bold" style={{ background: C.gold, color: "#FFFFFF" }}>
              Registrar venta
            </button>
            <button onClick={pauseSale} className="py-3 rounded-lg font-bold" style={{ background: "#FFFFFF", color: C.ink, border: `1px solid ${C.border}` }}>
              Pausar
            </button>
            {saleMsg && <p className="text-center text-sm" style={{ color: saleMsg.includes("✓") ? C.goldDark : C.danger }}>{saleMsg}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================= PAUSADAS ================= */
function PausadasTab({ pending, resumePending, deletePending }) {
  return (
    <div className="flex flex-col gap-4">
      <SectionLabel>Ventas en espera</SectionLabel>
      {pending.length === 0 && (
        <p className="text-sm" style={{ color: C.inkDim }}>No hay ventas pausadas. Desde "Vender" puedes usar el botón "Pausar".</p>
      )}
      <div className="flex flex-col gap-3">
        {pending.map((p) => (
          <Card key={p.id}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-xs flex items-center gap-1" style={{ color: C.inkDim }}>
                  <Clock size={11} /> {p.createdAt} · {p.tableName || "Sin mesa"}
                </div>
                <div className="text-sm mt-1" style={{ color: C.ink }}>
                  {p.cart.map((i) => `${i.name} x${i.qty}`).join(", ")}
                </div>
                <div className="text-sm mt-1 font-bold" style={{ color: C.goldDark, fontFamily: "'JetBrains Mono', monospace" }}>
                  {fmt(p.cart.reduce((s, i) => s + i.price * i.qty, 0))}
                </div>
              </div>
              <div className="flex flex-col gap-2 items-end shrink-0">
                <button onClick={() => resumePending(p.id)} className="flex items-center gap-1 px-3 py-1.5 text-xs rounded font-bold" style={{ background: C.gold, color: "#FFFFFF" }}>
                  <PlayCircle size={12} /> Retomar
                </button>
                <button onClick={() => deletePending(p.id)} style={{ color: C.danger }}><Trash2 size={14} /></button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ================= CAJA DEL DÍA ================= */
function CajaTab({
  selDate, setSelDate, daySales, dayByMethod, dayTotal, deleteSale,
  cashBases, withdrawals, setCashBase, addWithdrawal, deleteWithdrawal,
}) {
  const dayBase = cashBases.find((cb) => cb.date === selDate)?.amount || 0;
  const dayWithdrawals = useMemo(() => withdrawals.filter((w) => w.date === selDate), [withdrawals, selDate]);
  const dayWithdrawalsTotal = dayWithdrawals.reduce((s, w) => s + w.amount, 0);
  const expectedCash = dayBase + (dayByMethod.efectivo || 0) - dayWithdrawalsTotal;

  const [baseInput, setBaseInput] = useState(dayBase ? String(dayBase) : "");
  const [wDesc, setWDesc] = useState("");
  const [wAmount, setWAmount] = useState("");

  useEffect(() => {
    setBaseInput(dayBase ? String(dayBase) : "");
  }, [selDate, dayBase]);

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <div className="flex items-center gap-2">
          <SectionLabel>Fecha</SectionLabel>
          <input type="date" value={selDate} onChange={(e) => setSelDate(e.target.value)}
            className="ml-auto px-2 py-1 text-sm rounded" style={{ background: "#FFFFFF", color: C.ink, border: `1px solid ${C.border}` }} />
        </div>
      </Card>

      <Card>
        <SectionLabel>Base de caja (efectivo inicial)</SectionLabel>
        <div className="flex gap-2 mt-2">
          <input
            inputMode="numeric"
            placeholder="¿Con cuánto abre la caja hoy?"
            value={baseInput}
            onChange={(e) => setBaseInput(e.target.value.replace(/\D/g, ""))}
            className="flex-1 min-w-0 px-2 py-2 text-sm rounded"
            style={{ background: "#FFFFFF", color: C.ink, border: `1px solid ${C.border}` }}
          />
          <button
            onClick={() => setCashBase(selDate, baseInput)}
            className="px-3 rounded font-bold"
            style={{ background: C.gold, color: "#FFFFFF" }}
          >
            Guardar
          </button>
        </div>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {METHODS.map((m) => <VFD key={m.id} label={m.label} value={dayByMethod[m.id] || 0} small />)}
      </div>
      <VFD label="Total del día" value={dayTotal} tone="accent" />

      <Card>
        <SectionLabel>Retiros de caja</SectionLabel>
        <div className="flex gap-2 mt-2">
          <input placeholder="¿Para qué se sacó?" value={wDesc} onChange={(e) => setWDesc(e.target.value)}
            className="flex-1 min-w-0 px-2 py-2 text-sm rounded" style={{ background: "#FFFFFF", color: C.ink, border: `1px solid ${C.border}` }} />
          <input inputMode="numeric" placeholder="Valor" value={wAmount} onChange={(e) => setWAmount(e.target.value.replace(/\D/g, ""))}
            className="w-24 px-2 py-2 text-sm rounded" style={{ background: "#FFFFFF", color: C.ink, border: `1px solid ${C.border}` }} />
          <button
            onClick={() => { addWithdrawal(selDate, wDesc, wAmount); setWDesc(""); setWAmount(""); }}
            className="px-3 rounded" style={{ background: C.gold, color: "#FFFFFF" }}
          >
            <Plus size={16} />
          </button>
        </div>
        <div className="mt-3 flex flex-col gap-2">
          {dayWithdrawals.length === 0 && <p className="text-sm" style={{ color: C.inkDim }}>No hay retiros registrados este día.</p>}
          {dayWithdrawals.slice().reverse().map((w) => (
            <div key={w.id} className="flex items-center justify-between py-2" style={{ borderBottom: `1px solid ${C.border}` }}>
              <div>
                <div className="text-xs" style={{ color: C.inkDim }}>{w.time}</div>
                <div className="text-sm" style={{ color: C.ink }}>{w.description}</div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold" style={{ color: C.danger, fontFamily: "'JetBrains Mono', monospace" }}>-{fmt(w.amount)}</span>
                <button onClick={() => deleteWithdrawal(w.id)} style={{ color: C.danger }}><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <VFD label="Efectivo esperado en caja" value={expectedCash} tone="accent" />

      <Card>
        <SectionLabel>Transacciones</SectionLabel>
        <div className="mt-3 flex flex-col gap-3">
          {daySales.length === 0 && <p className="text-sm" style={{ color: C.inkDim }}>No hay ventas registradas este día.</p>}
          {daySales.slice().reverse().map((s) => (
            <div key={s.id} className="flex justify-between items-start pb-3" style={{ borderBottom: `1px solid ${C.border}` }}>
              <div>
                <div className="text-xs" style={{ color: C.inkDim }}>
                  {s.time} · <span style={{ color: methodColor(s.method) }}>{methodLabel(s.method)}</span>
                  {s.tableName ? ` · ${s.tableName}` : ""}
                </div>
                <div className="text-sm mt-1" style={{ color: C.ink }}>{s.items.map((i) => `${i.name} x${i.qty}`).join(", ")}</div>
                {s.cashReceived != null && (
                  <div className="text-xs mt-1" style={{ color: C.inkDim, fontFamily: "'JetBrains Mono', monospace" }}>
                    Recibió {fmt(s.cashReceived)} · {s.change < 0 ? `Faltó ${fmt(Math.abs(s.change))}` : `Vueltas ${fmt(s.change)}`}
                  </div>
                )}
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className="text-sm font-bold" style={{ color: C.ink, fontFamily: "'JetBrains Mono', monospace" }}>{fmt(s.total)}</span>
                <button onClick={() => deleteSale(s.id)} style={{ color: C.danger }}><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

/* ================= PROGRESO ================= */
function ProgresoTab(props) {
  const { progView, setProgView, weekStart, setWeekStart, weekChart, weekTotal, weekByMethod, monthCursor, setMonthCursor, monthWeeks, monthTotal, monthByMethod } = props;
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-2">
        <KeyBtn active={progView === "semana"} onClick={() => setProgView("semana")} style={{ padding: "8px" }}>Semana</KeyBtn>
        <KeyBtn active={progView === "mes"} onClick={() => setProgView("mes")} style={{ padding: "8px" }}>Mes</KeyBtn>
      </div>
      {progView === "semana" ? (
        <>
          <div className="flex items-center justify-between">
            <button onClick={() => setWeekStart(addDays(weekStart, -7))} style={{ color: C.goldDark }}><ChevronLeft /></button>
            <span className="text-sm font-semibold" style={{ color: C.ink }}>{toISO(weekStart)} — {toISO(addDays(weekStart, 6))}</span>
            <button onClick={() => setWeekStart(addDays(weekStart, 7))} style={{ color: C.goldDark }}><ChevronRight /></button>
          </div>
          <ChartCard data={weekChart} />
          <VFD label="Total de la semana" value={weekTotal} tone="accent" />
          <MethodBreakdown byMethod={weekByMethod} />
        </>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <button onClick={() => setMonthCursor((c) => { const m = c.m - 1; return m < 0 ? { y: c.y - 1, m: 11 } : { y: c.y, m }; })} style={{ color: C.goldDark }}><ChevronLeft /></button>
            <span className="text-sm font-semibold" style={{ color: C.ink }}>{MESES[monthCursor.m]} {monthCursor.y}</span>
            <button onClick={() => setMonthCursor((c) => { const m = c.m + 1; return m > 11 ? { y: c.y + 1, m: 0 } : { y: c.y, m }; })} style={{ color: C.goldDark }}><ChevronRight /></button>
          </div>
          <ChartCard data={monthWeeks.map((w) => ({ label: w.label, total: w.total }))} />
          <VFD label="Total del mes" value={monthTotal} tone="accent" />
          <MethodBreakdown byMethod={monthByMethod} />
        </>
      )}
    </div>
  );
}

function ChartCard({ data }) {
  return (
    <Card style={{ height: 220 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={C.border} vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: C.inkDim }} axisLine={{ stroke: C.border }} tickLine={false} />
          <YAxis hide />
          <Tooltip formatter={(v) => fmt(v)} contentStyle={{ background: "#FFFFFF", border: `1px solid ${C.border}`, color: C.ink, fontSize: 12 }} labelStyle={{ color: C.ink }} />
          <Bar dataKey="total" radius={[4, 4, 0, 0]}>
            {data.map((_, i) => <Cell key={i} fill={C.gold} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}

function MethodBreakdown({ byMethod }) {
  return (
    <div>
      <SectionLabel>Por método de pago</SectionLabel>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-2">
        {METHODS.map((m) => <VFD key={m.id} label={m.label} value={byMethod[m.id] || 0} small />)}
      </div>
    </div>
  );
}

/* ================= PRODUCTOS ================= */
function ProductosTab({ products, addProduct, editProduct, deleteProduct, tables, addTable, editTable, deleteTable }) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editPrice, setEditPrice] = useState("");

  const [tableName, setTableName] = useState("");
  const [editingTableId, setEditingTableId] = useState(null);
  const [editTableName, setEditTableName] = useState("");

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="flex flex-col gap-4">
        <Card>
          <SectionLabel>Nuevo producto</SectionLabel>
          <div className="flex gap-2 mt-2">
            <input placeholder="Nombre" value={name} onChange={(e) => setName(e.target.value)}
              className="flex-1 min-w-0 px-2 py-2 text-sm rounded" style={{ background: "#FFFFFF", color: C.ink, border: `1px solid ${C.border}` }} />
            <input placeholder="Valor" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ""))}
              className="w-24 px-2 py-2 text-sm rounded" style={{ background: "#FFFFFF", color: C.ink, border: `1px solid ${C.border}` }} />
            <button onClick={() => { addProduct(name, price); setName(""); setPrice(""); }}
              className="px-3 rounded" style={{ background: C.gold, color: "#FFFFFF" }}>
              <Plus size={16} />
            </button>
          </div>
        </Card>

        <Card>
          <SectionLabel>Catálogo</SectionLabel>
          <div className="mt-2 flex flex-col gap-2">
            {products.length === 0 && <p className="text-sm" style={{ color: C.inkDim }}>Aún no hay productos.</p>}
            {products.map((p, idx) => (
              <div key={p.id} className="flex items-center justify-between py-2" style={{ borderBottom: idx < products.length - 1 ? `1px solid ${C.border}` : "none" }}>
                {editingId === p.id ? (
                  <>
                    <div className="flex gap-2 flex-1">
                      <input value={editName} onChange={(e) => setEditName(e.target.value)} className="flex-1 min-w-0 px-2 py-1 text-sm rounded" style={{ background: "#FFFFFF", color: C.ink, border: `1px solid ${C.border}` }} />
                      <input value={editPrice} onChange={(e) => setEditPrice(e.target.value.replace(/\D/g, ""))} className="w-20 px-2 py-1 text-sm rounded" style={{ background: "#FFFFFF", color: C.ink, border: `1px solid ${C.border}` }} />
                    </div>
                    <button onClick={() => { editProduct(p.id, editName, editPrice); setEditingId(null); }} className="ml-2" style={{ color: C.goldDark }}><Check size={16} /></button>
                  </>
                ) : (
                  <>
                    <div>
                      <div className="text-sm" style={{ color: C.ink }}>{p.name}</div>
                      <div className="text-xs" style={{ color: C.inkDim, fontFamily: "'JetBrains Mono', monospace" }}>{fmt(p.price)}</div>
                    </div>
                    <div className="flex gap-3">
                      <button onClick={() => { setEditingId(p.id); setEditName(p.name); setEditPrice(String(p.price)); }} style={{ color: C.inkDim }}><Pencil size={14} /></button>
                      <button onClick={() => deleteProduct(p.id)} style={{ color: C.danger }}><Trash2 size={14} /></button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="flex flex-col gap-4">
        <Card>
          <SectionLabel>Mesas</SectionLabel>
          <div className="flex gap-2 mt-2">
            <input placeholder="Nombre o número de mesa" value={tableName} onChange={(e) => setTableName(e.target.value)}
              className="flex-1 min-w-0 px-2 py-2 text-sm rounded" style={{ background: "#FFFFFF", color: C.ink, border: `1px solid ${C.border}` }} />
            <button onClick={() => { addTable(tableName); setTableName(""); }}
              className="px-3 rounded" style={{ background: C.gold, color: "#FFFFFF" }}>
              <Plus size={16} />
            </button>
          </div>
          <div className="mt-3 flex flex-col gap-2">
            {tables.length === 0 && <p className="text-sm" style={{ color: C.inkDim }}>Aún no hay mesas registradas.</p>}
            {tables.map((t, idx) => (
              <div key={t.id} className="flex items-center justify-between py-2" style={{ borderBottom: idx < tables.length - 1 ? `1px solid ${C.border}` : "none" }}>
                {editingTableId === t.id ? (
                  <>
                    <input value={editTableName} onChange={(e) => setEditTableName(e.target.value)} className="flex-1 min-w-0 px-2 py-1 text-sm rounded" style={{ background: "#FFFFFF", color: C.ink, border: `1px solid ${C.border}` }} />
                    <button onClick={() => { editTable(t.id, editTableName); setEditingTableId(null); }} className="ml-2" style={{ color: C.goldDark }}><Check size={16} /></button>
                  </>
                ) : (
                  <>
                    <div className="text-sm" style={{ color: C.ink }}>{t.name}</div>
                    <div className="flex gap-3">
                      <button onClick={() => { setEditingTableId(t.id); setEditTableName(t.name); }} style={{ color: C.inkDim }}><Pencil size={14} /></button>
                      <button onClick={() => deleteTable(t.id)} style={{ color: C.danger }}><Trash2 size={14} /></button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}