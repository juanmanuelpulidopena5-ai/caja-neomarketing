import React, { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "./supabaseClient";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid,
} from "recharts";
import {
  Plus, Trash2, ShoppingCart, CalendarDays, TrendingUp, Package,
  ChevronLeft, ChevronRight, X, Coffee, Pencil, Check, Search, Clock, PlayCircle, LogOut,
  Ban, Printer, Download,
} from "lucide-react";
 import SubscriptionGuard from "./SubscriptionGuard";
/* ---------- paleta / tokens (tema claro, sin efectos LED) ---------- */
const C = {
  bg: "#FAFAFA",
  header: "#ffffff",
  headerDark: "#111111",
  paper: "#FFFFFF",
  border: "#E8E8E8",
  ink: "#111111",
  inkDim: "#8A8A8A",
  gold: "#111111",
  goldDark: "#111111",
  goldSoft: "#F2F2F2",
  danger: "#B91C1C",
  dangerSoft: "#F5E9E9",
  // tokens para diferenciar campos editables (inputs/selects) del texto estático
  fieldBg: "#F0F0F1",
  fieldBorder: "#B8B8BC",
  fieldFocusRing: "rgba(17,17,17,0.18)",
};
 
/* "Efectivo" y "Dividido" son fijos (no se pueden borrar ni renombrar);
   el resto de métodos los define cada negocio en la tabla payment_methods. */
const FIXED_CASH_METHOD = { id: "efectivo", label: "Efectivo", color: "#111111", fixed: true };
const FIXED_SPLIT_METHOD = { id: "mixto", label: "Dividido", color: "#737373", fixed: true };

/* IMPORTANTE: sales.method y cada sale.splitPayments[].metodo siempre guardan el NOMBRE
   (texto) del método de pago tal como se vio en el momento de la venta — nunca su id/uuid.
   Así, aunque el negocio después desactive o "elimine" ese método en su configuración,
   el historial de ventas y las facturas siguen mostrando el nombre correcto, no un uuid. */

// Color solo es un detalle visual: si el método ya no existe en la lista activa, usa un gris neutro.
const methodColor = (name, methods) => methods.find((m) => m.label === name || m.id === name)?.color || "#999";

// El texto que llega YA es el nombre a mostrar. Esta función solo cubre datos antiguos
// (de antes de este arreglo) que pudieron haber quedado guardados como id/uuid.
const methodLabel = (value, methods) => {
  const byId = methods.find((m) => m.id === value);
  return byId ? byId.label : value;
};

/* Suma el total de cada venta a su método de pago (por nombre). Si el método fue "Dividido",
   reparte el monto según cada entrada de sale.splitPayments en su método real. */
const computeMethodTotals = (salesList) => {
  const totals = {};
  const add = (name, amount) => { totals[name] = (totals[name] || 0) + Number(amount || 0); };
  salesList.forEach((s) => {
    if (s.method === FIXED_SPLIT_METHOD.label) {
      (s.splitPayments || []).forEach((sp) => add(sp.metodo, sp.monto));
    } else {
      add(s.method, s.total);
    }
  });
  return totals;
};

/* Arma las filas a mostrar en los desgloses "por método de pago": primero los métodos
   activos actuales (aunque su total sea 0), y al final cualquier nombre que aparezca en el
   historial pero que ya no esté activo/exista (para que el total siempre cuadre). */
const reportRows = (totals, methods) => {
  const seen = new Set();
  const rows = [];
  methods.filter((m) => m.id !== "mixto").forEach((m) => {
    rows.push({ key: m.label, label: m.label, value: totals[m.label] || 0 });
    seen.add(m.label);
  });
  Object.keys(totals).forEach((name) => {
    if (!seen.has(name) && name !== FIXED_SPLIT_METHOD.label) {
      rows.push({ key: name, label: name, value: totals[name] });
      seen.add(name);
    }
  });
  return rows;
};

/* Unidades de medida disponibles para insumos/materia prima. */
const UNIT_OPTIONS = [
  { id: "g", label: "gramos (g)" },
  { id: "kg", label: "kilogramos (kg)" },
  { id: "ml", label: "mililitros (ml)" },
  { id: "l", label: "litros (l)" },
  { id: "unidad", label: "unidades" },
];
const unitLabel = (id) => UNIT_OPTIONS.find((u) => u.id === id)?.label || id;

/* Receta efectiva de un producto tipo "recipe": su propia receta si la personalizó,
   o si no, la receta base definida en su categoría. */
const effectiveRecipe = (product, categories) => {
  if (!product) return [];
  if (Array.isArray(product.recipeOverride)) return product.recipeOverride;
  const cat = categories.find((c) => c.id === product.categoryId);
  return cat ? cat.defaultRecipe || [] : [];
};
 
const fmt = (n) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n || 0);
 
/* Contenedor centrado y fluido: el ancho se ajusta solo al tamaño de la ventana,
   sin depender de que las clases de Tailwind (max-w/mx-auto) se apliquen. */
const containerStyle = (extra = {}) => ({
  width: "100%",
  maxWidth: 1120,
  margin: "0 auto",
  boxSizing: "border-box",
  padding: "0 clamp(16px, 4vw, 40px)",
  ...extra,
});
 
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
      className="rounded-md px-3 py-2 flex flex-col"
      style={{ background: C.paper, border: `1px solid ${C.border}` }}
    >
      <span className="text-[10px] uppercase tracking-wide mb-1" style={{ color: C.inkDim, fontFamily: "Inter, sans-serif", fontWeight: 600 }}>
        {label}
      </span>
      <span
        className={small ? "text-base" : "text-xl"}
        style={{
          color: valueColor,
          fontFamily: "'Inter', sans-serif",
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
        fontFamily: "Inter, sans-serif",
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
    <span className="text-[11px] uppercase tracking-wide" style={{ color: C.inkDim, fontFamily: "Inter, sans-serif", fontWeight: 600 }}>
      {children}
    </span>
  );
}
 
function Card({ children, style }) {
  return (
    <div className="rounded-md p-4" style={{ background: C.paper, border: `1px solid ${C.border}`, ...style }}>
      {children}
    </div>
  );
}

/* Ticket de impresión genérico, tipo POS. Solo es visible cuando se imprime (ver @media print). */
function PrintTicket({ sale, methods, businessName = "NeoMarketing" }) {
  if (!sale) return null;
  return (
    <div id="print-ticket" style={{ fontFamily: "'Inter', monospace", fontSize: 12, color: "#000", padding: "8px 4px" }}>
      <div style={{ textAlign: "center", fontWeight: 700, fontSize: 14 }}>{businessName}</div>
      <div style={{ textAlign: "center" }}>{sale.date} · {sale.time}</div>
      {sale.tableName && <div style={{ textAlign: "center" }}>{sale.tableName}</div>}
      <hr style={{ border: "none", borderTop: "1px dashed #000", margin: "6px 0" }} />
      {sale.items.map((it, idx) => (
        <div key={idx} style={{ display: "flex", justifyContent: "space-between" }}>
          <span>{it.qty} x {it.name}</span>
          <span>{fmt(it.price * it.qty)}</span>
        </div>
      ))}
      <hr style={{ border: "none", borderTop: "1px dashed #000", margin: "6px 0" }} />
      <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
        <span>TOTAL</span><span>{fmt(sale.total)}</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span>Pago</span><span>{methodLabel(sale.method, methods)}</span>
      </div>
      {sale.cashReceived != null && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span>Recibido</span><span>{fmt(sale.cashReceived)}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span>Vueltas</span><span>{fmt(sale.change)}</span></div>
        </>
      )}
      {sale.anulada && <div style={{ textAlign: "center", marginTop: 6, fontWeight: 700 }}>*** ANULADA ***</div>}
      <div style={{ textAlign: "center", marginTop: 10 }}>¡Gracias por su compra!</div>
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
        <span style={{ color: C.goldDark, fontFamily: "'Inter', sans-serif" }}>Cargando…</span>
      </div>
    );
  }
 
  if (!session) return <LoginScreen />;
 
  return (
    <SubscriptionGuard session={session}>
      <CajaApp session={session} />
    </SubscriptionGuard>
  );
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
    <div style={{ background: C.bg, minHeight: "100vh", fontFamily: "Inter, sans-serif" }} className="flex items-center justify-center px-5">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');`}</style>
      <div className="w-full rounded-md p-6" style={{ background: C.paper, border: `1px solid ${C.border}`, maxWidth: 384, boxSizing: "border-box" }}>
        <div className="flex items-center gap-2 justify-center mb-6">
          <Coffee size={20} color={C.ink} strokeWidth={1.5} />
          <span style={{ color: C.ink, fontFamily: "'Inter', sans-serif", fontWeight: 600, letterSpacing: "0.02em" }} className="text-base">
            NeoMarketing
          </span>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <input type="email" required placeholder="Correo" value={email} onChange={(e) => setEmail(e.target.value)}
            className="px-3 py-2 text-sm rounded" style={{ background: "#FFFFFF", color: C.ink, border: `1px solid ${C.border}` }} />
          <input type="password" required placeholder="Contraseña" value={password} onChange={(e) => setPassword(e.target.value)}
            className="px-3 py-2 text-sm rounded" style={{ background: "#FFFFFF", color: C.ink, border: `1px solid ${C.border}` }} />
          <button type="submit" disabled={busy} className="py-3 rounded-md font-semibold" style={{ background: C.gold, color: "#FFFFFF" }}>
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
/* ================= INICIO DE TURNO (selección de trabajador) ================= */
function WorkerGate({ workers, onSelect, onSkip }) {
  return (
    <div style={{ background: C.bg, minHeight: "100vh", fontFamily: "Inter, sans-serif" }} className="flex items-center justify-center px-5">
      <div className="w-full rounded-md p-6" style={{ background: C.paper, border: `1px solid ${C.border}`, maxWidth: 420, boxSizing: "border-box" }}>
        <div className="flex items-center gap-2 justify-center mb-2">
          <Coffee size={20} color={C.ink} strokeWidth={1.5} />
          <span style={{ color: C.ink, fontFamily: "'Inter', sans-serif", fontWeight: 600 }} className="text-base">NeoMarketing</span>
        </div>
        <p className="text-center text-sm mb-5" style={{ color: C.inkDim }}>¿Quién está iniciando turno en la caja?</p>

        {workers.length === 0 ? (
          <p className="text-sm text-center" style={{ color: C.inkDim }}>
            Aún no hay trabajadores activos. Crea uno en la pestaña "Productos → Trabajadores".
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {workers.map((w) => (
              <button
                key={w.id}
                onClick={() => onSelect(w.name)}
                className="w-full py-3 rounded-md font-semibold text-sm"
                style={{ background: C.gold, color: "#FFFFFF" }}
              >
                {w.name}
              </button>
            ))}
          </div>
        )}

        <button onClick={onSkip} className="w-full mt-4 text-xs underline text-center" style={{ color: C.inkDim }}>
          Continuar sin registrar trabajador
        </button>
      </div>
    </div>
  );
}

function CajaApp({ session }) {
  const userId = session.user.id;
 
  const [products, setProducts] = useState([]);
  const [tables, setTables] = useState([]);
  const [sales, setSales] = useState([]);
  const [pending, setPending] = useState([]);
  const [cashBases, setCashBases] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [insumos, setInsumos] = useState([]);       // insumos / materia prima
  const [categories, setCategories] = useState([]); // categorías con receta base opcional
  const [workers, setWorkers] = useState([]);       // trabajadores del negocio
  const [paymentMethods, setPaymentMethods] = useState([]); // métodos de pago personalizados del negocio
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("vender");
  const [ticket, setTicket] = useState(null); // venta que se está imprimiendo

  /* ---------- turno / trabajador activo (persistido en localStorage) ---------- */
  const [workerName, setWorkerNameState] = useState(() => {
    try { return localStorage.getItem("pos_worker_name") || null; } catch { return null; }
  });
  const [skipWorkerGate, setSkipWorkerGate] = useState(false); // "continuar sin registrar" (solo esta sesión)

  const setWorkerName = (name) => {
    setWorkerNameState(name);
    try {
      if (name) localStorage.setItem("pos_worker_name", name);
      else localStorage.removeItem("pos_worker_name");
    } catch { /* localStorage no disponible: el turno solo dura la sesión */ }
  };
  const endShift = () => setWorkerName(null);

  const printSale = (sale) => setTicket(sale);
  useEffect(() => {
    if (!ticket) return;
    const id = setTimeout(() => window.print(), 60); // deja pintar el DOM antes de imprimir
    return () => clearTimeout(id);
  }, [ticket]);

  const loadAll = useCallback(async () => {
    try {
      const [p, t, s, pe, cb, wd, ins, cat, wk, pm] = await Promise.all([
        supabase.from("products").select("*").eq("user_id", userId),
        supabase.from("tables_config").select("*").eq("user_id", userId),
        supabase.from("sales").select("*").eq("user_id", userId),
        supabase.from("pending_sales").select("*").eq("user_id", userId),
        supabase.from("cash_base").select("*").eq("user_id", userId),
        supabase.from("cash_withdrawals").select("*").eq("user_id", userId),
        supabase.from("insumos").select("*").eq("user_id", userId),
        supabase.from("categories").select("*").eq("user_id", userId),
        supabase.from("workers").select("*").eq("user_id", userId),
        supabase.from("payment_methods").select("*").eq("user_id", userId),
      ]);
 
      if (p.error) throw p.error;
      if (t.error) throw t.error;
      if (s.error) throw s.error;
      if (pe.error) throw pe.error;
      if (cb.error) throw cb.error;
      if (wd.error) throw wd.error;
      if (ins.error) throw ins.error;
      if (cat.error) throw cat.error;
      if (wk.error) throw wk.error;
      if (pm.error) throw pm.error;
 
      setProducts((p.data || []).map((r) => ({
        id: r.id,
        name: r.name,
        price: Number(r.price),
        categoryId: r.category_id || null,
        // "none" | "direct" | "recipe"
        inventoryType: r.inventory_type || "none",
        stock: r.stock != null ? Number(r.stock) : null,
        // null => hereda la receta base de la categoría; array => receta personalizada del producto
        recipeOverride: r.recipe_override || null,
      })));
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
        anulada: !!r.anulada,
        workerName: r.worker_name || null,
        splitPayments: r.split_payments || [],
      })));
      setPending((pe.data || []).map((r) => ({
        id: r.id,
        tableId: r.table_id,
        tableName: r.table_name,
        cart: r.cart,
        method: r.method,
        workerName: r.worker_name || null,
        // "paused" (mesa pausada normal) o "debt" (cuenta por cobrar / fiado)
        status: r.status || "paused",
        customerName: r.customer_name || null,
        totalAmount: r.total_amount != null ? Number(r.total_amount) : 0,
        paidAmount: r.paid_amount != null ? Number(r.paid_amount) : 0,
        createdAt: new Date(r.created_at).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" }),
      })));
      setCashBases((cb.data || []).map((r) => ({ id: r.id, date: r.date, amount: Number(r.amount) })));
      setWithdrawals((wd.data || []).map((r) => ({
        id: r.id, date: r.date, description: r.description, amount: Number(r.amount), time: r.time,
      })));
      setInsumos((ins.data || []).map((r) => ({
        id: r.id, name: r.name, unit: r.unit, stock: Number(r.stock || 0),
      })));
      setCategories((cat.data || []).map((r) => ({
        id: r.id, name: r.name, defaultRecipe: r.default_recipe || [],
      })));
      setWorkers((wk.data || []).map((r) => ({ id: r.id, name: r.name, active: !!r.active })));
      setPaymentMethods((pm.data || []).map((r) => ({ id: r.id, name: r.name, color: r.color || "#525252", isActive: r.is_active !== false })));
 
      setError("");
    } catch (e) {
      console.error("Error detallado:", e);
      setError("No se pudieron cargar los datos.");
    } finally {
      setLoading(false);
    }
  }, [userId]);
 
  useEffect(() => { loadAll(); }, [loadAll]);
 
  /* ---------- trabajadores ---------- */
  const addWorker = async (name) => {
    if (!name.trim()) return;
    const { error: e } = await supabase.from("workers").insert({ user_id: userId, name: name.trim(), active: true });
    if (e) setError("No se pudo guardar el trabajador."); else loadAll();
  };
  const toggleWorkerActive = async (id, active) => {
    const { error: e } = await supabase.from("workers").update({ active }).eq("id", id);
    if (e) setError("No se pudo actualizar el trabajador."); else loadAll();
  };
  const deleteWorker = async (id) => {
    const { error: e } = await supabase.from("workers").delete().eq("id", id);
    if (e) setError("No se pudo eliminar el trabajador."); else loadAll();
  };

  /* ---------- métodos de pago personalizados ("Efectivo" y "Dividido" son fijos) ---------- */
  const addPaymentMethod = async (name) => {
    if (!name.trim()) return;
    const { error: e } = await supabase.from("payment_methods").insert({ user_id: userId, name: name.trim(), is_active: true });
    if (e) setError("No se pudo guardar el método de pago."); else loadAll();
  };
  const togglePaymentMethodActive = async (id, isActive) => {
    const { error: e } = await supabase.from("payment_methods").update({ is_active: isActive }).eq("id", id);
    if (e) setError("No se pudo actualizar el método de pago."); else loadAll();
  };
  // Borrado lógico: nunca hacemos DELETE sobre payment_methods (rompería el historial de ventas
  // si algún día se reutilizara el id). "Eliminar" en la UI solo desactiva el método.
  const deletePaymentMethod = async (id) => {
    const { error: e } = await supabase.from("payment_methods").update({ is_active: false }).eq("id", id);
    if (e) setError("No se pudo desactivar el método de pago."); else loadAll();
  };
  // Lista completa usada en toda la app: Efectivo primero, luego los personalizados activos, Dividido al final.
  const methods = useMemo(() => [
    FIXED_CASH_METHOD,
    ...paymentMethods.filter((m) => m.isActive).map((m) => ({ id: m.id, label: m.name, color: m.color })),
    FIXED_SPLIT_METHOD,
  ], [paymentMethods]);

  /* ---------- productos ---------- */
  const addProduct = async (name, price, opts = {}) => {
    if (!name.trim() || !price) return;
    const { categoryId = null, inventoryType = "none", stock = null, recipeOverride = null } = opts;
    const { error: e } = await supabase.from("products").insert({
      user_id: userId,
      name: name.trim(),
      price: Number(price),
      category_id: categoryId || null,
      inventory_type: inventoryType,
      stock: inventoryType === "direct" ? (Number(stock) || 0) : 0, // la columna no admite null
      recipe_override: inventoryType === "recipe" ? recipeOverride : null,
    });
    if (e) setError("No se guardó el producto."); else loadAll();
  };
  const editProduct = async (id, name, price, opts = {}) => {
    const { categoryId = null, inventoryType = "none", stock = null, recipeOverride = null } = opts;
    const { error: e } = await supabase.from("products").update({
      name,
      price: Number(price),
      category_id: categoryId || null,
      inventory_type: inventoryType,
      stock: inventoryType === "direct" ? (Number(stock) || 0) : 0, // la columna no admite null
      recipe_override: inventoryType === "recipe" ? recipeOverride : null,
    }).eq("id", id);
    if (e) setError("No se guardó el cambio."); else loadAll();
  };
  const deleteProduct = async (id) => {
    const { error: e } = await supabase.from("products").delete().eq("id", id);
    if (e) setError("No se pudo eliminar el producto."); else loadAll();
  };

  /* ---------- insumos / materia prima ---------- */
  const addInsumo = async (name, unit, stock) => {
    if (!name.trim() || !unit) return;
    const { error: e } = await supabase.from("insumos").insert({ user_id: userId, name: name.trim(), unit, stock: Number(stock || 0) });
    if (e) setError("No se guardó el insumo."); else loadAll();
  };
  const editInsumo = async (id, name, unit, stock) => {
    const { error: e } = await supabase.from("insumos").update({ name, unit, stock: Number(stock || 0) }).eq("id", id);
    if (e) setError("No se guardó el cambio."); else loadAll();
  };
  const deleteInsumo = async (id) => {
    const { error: e } = await supabase.from("insumos").delete().eq("id", id);
    if (e) setError("No se pudo eliminar el insumo."); else loadAll();
  };

  /* ---------- categorías (con receta base opcional) ---------- */
  const addCategory = async (name, defaultRecipe = []) => {
    if (!name.trim()) return;
    const { error: e } = await supabase.from("categories").insert({ user_id: userId, name: name.trim(), default_recipe: defaultRecipe });
    if (e) setError("No se guardó la categoría."); else loadAll();
  };
  const editCategory = async (id, name, defaultRecipe = []) => {
    const { error: e } = await supabase.from("categories").update({ name, default_recipe: defaultRecipe }).eq("id", id);
    if (e) setError("No se guardó el cambio."); else loadAll();
  };
  const deleteCategory = async (id) => {
    const { error: e } = await supabase.from("categories").delete().eq("id", id);
    if (e) setError("No se pudo eliminar la categoría."); else loadAll();
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
  const [splitPayments, setSplitPayments] = useState([]); // pagos mixtos: [{ metodo, monto }]
 
  const addToCart = (item, qty = 1) => {
    const addQty = Math.max(1, Math.round(Number(qty) || 1));
    setCart((prev) => {
      const idx = prev.findIndex((i) => i.id === item.id);
      if (idx > -1) { const c = [...prev]; c[idx] = { ...c[idx], qty: c[idx].qty + addQty }; return c; }
      return [...prev, { ...item, qty: addQty }];
    });
  };
  const decFromCart = (id) => setCart((prev) => prev.flatMap((i) => (i.id === id ? (i.qty > 1 ? [{ ...i, qty: i.qty - 1 }] : []) : [i])));
  const removeFromCart = (id) => setCart((prev) => prev.filter((i) => i.id !== id));
  const cartTotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
 
  const registerSale = async () => {
    if (cart.length === 0) { setSaleMsg("Agrega al menos un producto."); return; }
    if (!method) { setSaleMsg("Selecciona cómo pagaron."); return; }
    const isSplit = method === FIXED_SPLIT_METHOD.label;
    const validSplits = splitPayments.filter((sp) => sp.metodo && Number(sp.monto) > 0);
    if (isSplit) {
      if (validSplits.length === 0) { setSaleMsg("Agrega al menos un pago."); return; }
      const splitSum = validSplits.reduce((s, sp) => s + Number(sp.monto), 0);
      if (splitSum !== cartTotal) { setSaleMsg(`Los pagos deben sumar ${fmt(cartTotal)} (llevas ${fmt(splitSum)}).`); return; }
    }
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
      worker_name: workerName || null,
      split_payments: isSplit ? validSplits : [],
    });
    if (e) { setSaleMsg("No se pudo registrar la venta."); return; }
    await applyInventoryDeductions(cart);
    setCart([]); setMethod(null); setSelectedTable(null); setCashReceived(""); setSplitPayments([]);
    setSaleMsg("Venta registrada ✓");
    setTimeout(() => setSaleMsg(""), 2000);
    loadAll();
  };

  /* Descuenta del inventario (productos con stock directo e insumos por receta)
     según lo vendido. Los ítems sueltos (id que empieza con "custom-") no descuentan nada. */
  const applyInventoryDeductions = async (cartItems) => {
    const productStockDelta = {};   // productId -> unidades a restar
    const insumoStockDelta = {};    // insumoId -> cantidad a restar

    cartItems.forEach((item) => {
      if (String(item.id).startsWith("custom-")) return;
      const product = products.find((p) => p.id === item.id);
      if (!product) return;

      if (product.inventoryType === "direct") {
        productStockDelta[product.id] = (productStockDelta[product.id] || 0) + item.qty;
      } else if (product.inventoryType === "recipe") {
        const recipe = effectiveRecipe(product, categories);
        recipe.forEach((ing) => {
          insumoStockDelta[ing.insumoId] = (insumoStockDelta[ing.insumoId] || 0) + Number(ing.qty || 0) * item.qty;
        });
      }
    });

    const updates = [];
    Object.entries(productStockDelta).forEach(([productId, delta]) => {
      const product = products.find((p) => p.id === productId);
      const newStock = Math.max(0, Number(product?.stock || 0) - delta);
      updates.push(supabase.from("products").update({ stock: newStock }).eq("id", productId));
    });
    Object.entries(insumoStockDelta).forEach(([insumoId, delta]) => {
      const insumo = insumos.find((i) => i.id === insumoId);
      if (!insumo) return; // insumo eliminado o receta con referencia inválida
      const newStock = Math.max(0, Number(insumo.stock || 0) - delta);
      updates.push(supabase.from("insumos").update({ stock: newStock }).eq("id", insumoId));
    });

    if (updates.length) await Promise.all(updates);
  };
 
  const anularVenta = async (id) => {
    const { error: e } = await supabase.from("sales").update({ anulada: true }).eq("id", id);
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
      worker_name: workerName || null,
      status: "paused",
    });
    if (e) { setSaleMsg("No se pudo pausar la venta."); return; }
    setCart([]); setMethod(null); setSelectedTable(null); setCashReceived(""); setSplitPayments([]);
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

  /* ---------- cuentas por cobrar (fiados) ---------- */
  const createDebt = async (customerName, totalAmount, paidAmount) => {
    if (!customerName.trim() || !totalAmount) return;
    const { error: e } = await supabase.from("pending_sales").insert({
      user_id: userId,
      status: "debt",
      customer_name: customerName.trim(),
      total_amount: Number(totalAmount),
      paid_amount: Number(paidAmount || 0),
      worker_name: workerName || null,
      cart: [],
      method: null,
    });
    if (e) setError("No se pudo guardar la cuenta por cobrar."); else loadAll();
  };
  const addAbono = async (id, amount) => {
    const entry = pending.find((p) => p.id === id);
    if (!entry || !amount || Number(amount) <= 0) return;
    const newPaid = Number(entry.paidAmount || 0) + Number(amount);
    const { error: e } = await supabase.from("pending_sales").update({ paid_amount: newPaid }).eq("id", id);
    if (e) setError("No se pudo registrar el abono."); else loadAll();
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
  const dayActiveSales = useMemo(() => daySales.filter((s) => !s.anulada), [daySales]);
  const dayByMethod = useMemo(() => computeMethodTotals(dayActiveSales), [dayActiveSales]);
  const dayTotal = dayActiveSales.reduce((s, x) => s + x.total, 0);
 
  /* ---------- progreso semana / mes ---------- */
  const [progView, setProgView] = useState("semana");
  const [weekStart, setWeekStart] = useState(weekStartOf(new Date()));
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const weekChart = useMemo(
    () => weekDays.map((d, i) => {
      const iso = toISO(d);
      const total = sales.filter((s) => s.date === iso && !s.anulada).reduce((s, x) => s + x.total, 0);
      return { label: DIAS[i], total, iso };
    }), [weekDays, sales]
  );
  const weekTotal = weekChart.reduce((s, d) => s + d.total, 0);
  const weekByMethod = useMemo(
    () => computeMethodTotals(sales.filter((s) => weekChart.some((d) => d.iso === s.date) && !s.anulada)),
    [sales, weekChart]
  );
 
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
        .filter((s) => { const d = parseISO(s.date); return !s.anulada && d.getFullYear() === monthCursor.y && d.getMonth() === monthCursor.m && d.getDate() >= w.start && d.getDate() <= w.end; })
        .reduce((s, x) => s + x.total, 0);
      return { ...w, total };
    });
  }, [monthCursor, sales]);
  const monthTotal = monthWeeks.reduce((s, w) => s + w.total, 0);
  const monthByMethod = useMemo(
    () => computeMethodTotals(sales.filter((s) => { const d = parseISO(s.date); return !s.anulada && d.getFullYear() === monthCursor.y && d.getMonth() === monthCursor.m; })),
    [sales, monthCursor]
  );
 
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
        <span style={{ color: C.goldDark, fontFamily: "'Inter', sans-serif" }}>Cargando caja…</span>
      </div>
    );
  }

  if (!workerName && !skipWorkerGate) {
    return (
      <WorkerGate
        workers={workers.filter((w) => w.active)}
        onSelect={setWorkerName}
        onSkip={() => setSkipWorkerGate(true)}
      />
    );
  }
 
  return (
    <div style={{ background: C.bg, height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden", fontFamily: "Inter, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        input[type="date"] { color-scheme: light; }

        /* Campos editables (inputs/selects/textarea): fondo y borde marcados para
           diferenciarlos claramente del texto estático, con foco visible. */
        .pos-field {
          background: ${C.fieldBg};
          color: ${C.ink};
          border: 1px solid ${C.fieldBorder};
          transition: border-color .15s ease, box-shadow .15s ease, background-color .15s ease;
        }
        .pos-field::placeholder { color: ${C.inkDim}; opacity: 1; }
        .pos-field:hover { border-color: ${C.ink}; }
        .pos-field:focus {
          outline: none;
          border-color: ${C.ink};
          background: #FFFFFF;
          box-shadow: 0 0 0 3px ${C.fieldFocusRing};
        }
        .pos-field:disabled { opacity: 0.6; cursor: not-allowed; }

        @media print {
          body * { visibility: hidden; }
          #print-ticket, #print-ticket * { visibility: visible; }
          #print-ticket { position: absolute; top: 0; left: 0; width: 80mm; }
        }
        @media screen {
          #print-ticket { display: none; }
        }
      `}</style>
 
      {/* barra superior */}
      <div style={{ background: C.header, borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <div style={containerStyle({ paddingTop: 16, paddingBottom: 16 })} className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Coffee size={18} color={C.ink} strokeWidth={1.5} />
            <span style={{ color: C.ink, fontFamily: "'Inter', sans-serif", fontWeight: 600, letterSpacing: "0.02em" }} className="text-base">
              NeoMarketing
            </span>
          </div>
          <button onClick={() => supabase.auth.signOut()} style={{ color: C.inkDim, fontFamily: "'Inter', sans-serif" }} className="flex items-center gap-1.5 text-sm">
            <LogOut size={15} strokeWidth={1.5} /> Cerrar sesión
          </button>
        </div>
        {workerName && (
          <div style={containerStyle({ paddingBottom: 10 })} className="flex items-center justify-between">
            <span className="text-xs" style={{ color: C.inkDim }}>
              Turno: <span style={{ color: C.ink, fontWeight: 600 }}>{workerName}</span>
            </span>
            <button onClick={endShift} className="text-xs underline" style={{ color: C.inkDim }}>Cambiar</button>
          </div>
        )}
      </div>
 
      {/* pestañas de navegación */}
      <div style={{ background: C.paper, borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <div style={containerStyle()} className="flex gap-1 overflow-x-auto">
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
        <div style={{ flexShrink: 0 }}>
          <div style={containerStyle({ paddingTop: 12 })}>
            <p className="text-sm" style={{ color: C.danger }}>{error}</p>
          </div>
        </div>
      )}
 
      <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        <div style={containerStyle({ paddingTop: 24, paddingBottom: 24 })}>
        {tab === "vender" && (
          <VenderTab
            products={products} cart={cart} addToCart={addToCart} decFromCart={decFromCart}
            removeFromCart={removeFromCart} cartTotal={cartTotal} method={method} setMethod={setMethod}
            customName={customName} setCustomName={setCustomName} customPrice={customPrice} setCustomPrice={setCustomPrice}
            registerSale={registerSale} saleMsg={saleMsg}
            tables={tables} selectedTable={selectedTable} setSelectedTable={setSelectedTable}
            cashReceived={cashReceived} setCashReceived={setCashReceived}
            pauseSale={pauseSale}
            splitPayments={splitPayments} setSplitPayments={setSplitPayments}
            methods={methods}
          />
        )}
        {tab === "pausadas" && (
          <PausadasTab pending={pending} resumePending={resumePending} deletePending={deletePending} createDebt={createDebt} addAbono={addAbono} />
        )}
        {tab === "caja" && (
          <CajaTab
            selDate={selDate} setSelDate={setSelDate} daySales={daySales} dayByMethod={dayByMethod}
            dayTotal={dayTotal} anularVenta={anularVenta} onPrintSale={printSale}
            cashBases={cashBases} withdrawals={withdrawals}
            setCashBase={setCashBase} addWithdrawal={addWithdrawal} deleteWithdrawal={deleteWithdrawal}
            methods={methods}
          />
        )}
        {tab === "progreso" && (
          <ProgresoTab
            progView={progView} setProgView={setProgView}
            weekStart={weekStart} setWeekStart={setWeekStart} weekChart={weekChart} weekTotal={weekTotal} weekByMethod={weekByMethod}
            monthCursor={monthCursor} setMonthCursor={setMonthCursor} monthWeeks={monthWeeks} monthTotal={monthTotal} monthByMethod={monthByMethod}
            sales={sales} methods={methods}
          />
        )}
        {tab === "productos" && (
          <ProductosTab
            products={products} addProduct={addProduct} editProduct={editProduct} deleteProduct={deleteProduct}
            tables={tables} addTable={addTable} editTable={editTable} deleteTable={deleteTable}
            insumos={insumos} addInsumo={addInsumo} editInsumo={editInsumo} deleteInsumo={deleteInsumo}
            categories={categories} addCategory={addCategory} editCategory={editCategory} deleteCategory={deleteCategory}
            workers={workers} addWorker={addWorker} toggleWorkerActive={toggleWorkerActive} deleteWorker={deleteWorker}
            paymentMethods={paymentMethods} addPaymentMethod={addPaymentMethod}
            togglePaymentMethodActive={togglePaymentMethodActive} deletePaymentMethod={deletePaymentMethod}
          />
        )}
        </div>
      </div>
      <PrintTicket sale={ticket} methods={methods} />
    </div>
  );
}
 
/* ================= VENDER ================= */
function VenderTab({
  products, cart, addToCart, decFromCart, removeFromCart, cartTotal, method, setMethod,
  customName, setCustomName, customPrice, setCustomPrice, registerSale, saleMsg,
  tables, selectedTable, setSelectedTable, cashReceived, setCashReceived, pauseSale,
  splitPayments, setSplitPayments, methods,
}) {
  const [query, setQuery] = useState("");
  const [modalProduct, setModalProduct] = useState(null); // producto pendiente de confirmar cantidad

  const filtered = useMemo(() => {
    const q = normalize(query);
    if (!q) return products;
    return products.filter((p) => normalize(p.name).includes(q));
  }, [products, query]);

  const handlePick = (p) => setModalProduct(p);
  const confirmQuantity = (qty) => {
    if (modalProduct) addToCart(modalProduct, qty);
    setModalProduct(null);
    setQuery("");
  };
  const change = cashReceived ? Number(cashReceived) - cartTotal : 0;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 24 }}>
      {/* columna izquierda: catálogo, mesa, ítem suelto, cuenta */}
      <div style={{ flex: "2 1 380px", minWidth: 0 }} className="flex flex-col gap-5">
        <Card>
          <SectionLabel>Buscar producto</SectionLabel>
          <div className="relative mt-2">
            <Search size={16} className="pointer-events-none" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: C.inkDim, zIndex: 1 }} />
            <input placeholder="Escribe el nombre del producto…" value={query} onChange={(e) => setQuery(e.target.value)}
              className="pos-field w-full py-2 text-sm rounded" style={{ paddingLeft: 36, paddingRight: 36, boxSizing: "border-box" }} />
            {query && (
              <button onClick={() => setQuery("")} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: C.inkDim }}>
                <X size={14} />
              </button>
            )}
          </div>
          <div className="mt-2 rounded-md overflow-hidden" style={{ border: `1px solid ${C.border}`, maxHeight: 240, overflowY: "auto" }}>
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
                <span className="text-xs font-semibold" style={{ color: C.goldDark, fontFamily: "'Inter', sans-serif" }}>{fmt(p.price)}</span>
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
              className="pos-field flex-1 min-w-0 px-2 py-2 text-sm rounded" />
            <input placeholder="Valor" inputMode="numeric" value={customPrice} onChange={(e) => setCustomPrice(e.target.value.replace(/\D/g, ""))}
              className="pos-field w-24 px-2 py-2 text-sm rounded" />
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
                  <span className="text-sm font-semibold" style={{ color: C.ink, fontFamily: "'Inter', sans-serif" }}>{fmt(i.price * i.qty)}</span>
                  <button onClick={() => decFromCart(i.id)} style={{ color: C.inkDim }}>−</button>
                  <button onClick={() => removeFromCart(i.id)} style={{ color: C.danger }}><X size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* columna derecha: información de venta */}
      <div style={{ flex: "1 1 300px", minWidth: 0 }}>
        <div className="flex flex-col gap-4 sticky top-4">
          <Card>
            <SectionLabel>Información de venta</SectionLabel>
            <div className="mt-3 flex flex-col gap-2">
              <VFD label="Total cuenta" value={cartTotal} tone="accent" />
            </div>
          </Card>

          <Card>
            <SectionLabel>Pago</SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8, marginTop: 8 }}>
              {methods.map((m) => (
                <KeyBtn key={m.id} onClick={() => setMethod(m.label)} active={method === m.label}
                  style={{ padding: "10px 8px", borderColor: method === m.label ? m.color : C.border }}>
                  <span className="text-sm">{m.label}</span>
                </KeyBtn>
              ))}
            </div>
          </Card>

          {method === FIXED_SPLIT_METHOD.label && (
            <Card>
              <SectionLabel>Dividir pago</SectionLabel>
              <SplitPaymentBuilder splitPayments={splitPayments} setSplitPayments={setSplitPayments} cartTotal={cartTotal} methods={methods} />
            </Card>
          )}

          <Card>
            <SectionLabel>Pago recibido</SectionLabel>
            <input placeholder="¿Cuánto dio el cliente?" inputMode="numeric" value={cashReceived}
              onChange={(e) => setCashReceived(e.target.value.replace(/\D/g, ""))}
              className="pos-field w-full mt-2 px-2 py-2 text-sm rounded" />
            {cashReceived !== "" && (
              <div className="mt-2"><VFD label={change < 0 ? "Falta" : "Vueltas"} value={Math.abs(change)} tone={change < 0 ? "danger" : "accent"} /></div>
            )}
          </Card>

          <div className="flex flex-col gap-2">
            <button onClick={registerSale} className="py-3 rounded-md font-semibold" style={{ background: C.gold, color: "#FFFFFF" }}>
              Registrar venta
            </button>
            <button onClick={pauseSale} className="py-3 rounded-md font-semibold" style={{ background: "#FFFFFF", color: C.ink, border: `1px solid ${C.border}` }}>
              Pausar
            </button>
            {saleMsg && <p className="text-center text-sm" style={{ color: saleMsg.includes("✓") ? C.goldDark : C.danger }}>{saleMsg}</p>}
          </div>
        </div>
      </div>

      {modalProduct && (
        <QuantityModal product={modalProduct} onConfirm={confirmQuantity} onClose={() => setModalProduct(null)} />
      )}
    </div>
  );
}

/* Modal rápido de cantidad al agregar un producto a la cuenta. */
function QuantityModal({ product, onConfirm, onClose }) {
  const [qty, setQty] = useState(1);
  const inputRef = React.useRef(null);

  useEffect(() => {
    const id = setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 30);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const bump = (n) => setQty((q) => Math.max(1, q + n));
  const submit = () => {
    const n = Math.max(1, Math.round(Number(qty) || 1));
    onConfirm(n);
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center px-4"
      style={{ background: "rgba(17,17,17,0.45)", zIndex: 60 }}
      onClick={onClose}
    >
      <div
        className="w-full rounded-md p-5"
        style={{ background: C.paper, border: `1px solid ${C.border}`, maxWidth: 340, boxSizing: "border-box" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-1">
          <div>
            <SectionLabel>Agregar a la cuenta</SectionLabel>
            <div className="text-base font-semibold mt-1" style={{ color: C.ink, fontFamily: "'Inter', sans-serif" }}>{product.name}</div>
            <div className="text-sm" style={{ color: C.inkDim, fontFamily: "'Inter', sans-serif" }}>{fmt(product.price)} c/u</div>
          </div>
          <button onClick={onClose} style={{ color: C.inkDim }}><X size={16} /></button>
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); submit(); }}
          className="mt-4 flex flex-col gap-3"
        >
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => bump(-1)} className="w-10 h-10 rounded-md font-semibold text-lg" style={{ background: C.goldSoft, color: C.ink }}>−</button>
            <input
              ref={inputRef}
              type="number"
              min={1}
              inputMode="numeric"
              value={qty}
              onChange={(e) => setQty(e.target.value.replace(/\D/g, "") || "")}
              className="pos-field flex-1 text-center text-lg font-semibold py-2 rounded"
            />
            <button type="button" onClick={() => bump(1)} className="w-10 h-10 rounded-md font-semibold text-lg" style={{ background: C.goldSoft, color: C.ink }}>+</button>
          </div>

          <div className="flex gap-2">
            <button type="button" onClick={() => bump(1)} className="flex-1 py-2 rounded text-sm font-semibold" style={{ background: "#FFFFFF", color: C.ink, border: `1px solid ${C.border}` }}>+1</button>
            <button type="button" onClick={() => bump(2)} className="flex-1 py-2 rounded text-sm font-semibold" style={{ background: "#FFFFFF", color: C.ink, border: `1px solid ${C.border}` }}>+2</button>
            <button type="button" onClick={() => bump(5)} className="flex-1 py-2 rounded text-sm font-semibold" style={{ background: "#FFFFFF", color: C.ink, border: `1px solid ${C.border}` }}>+5</button>
          </div>

          <div className="text-right text-sm font-semibold" style={{ color: C.goldDark, fontFamily: "'Inter', sans-serif" }}>
            Subtotal: {fmt(product.price * Math.max(1, Number(qty) || 1))}
          </div>

          <button type="submit" className="py-3 rounded-md font-semibold" style={{ background: C.gold, color: "#FFFFFF" }}>
            Añadir a la cuenta
          </button>
        </form>
      </div>
    </div>
  );
}
 
/* Constructor de pagos mixtos: arma un arreglo [{ metodo, monto }] para la columna split_payments. */
function SplitPaymentBuilder({ splitPayments, setSplitPayments, cartTotal, methods }) {
  const options = methods.filter((m) => m.id !== "mixto").map((m) => m.label);
  const addRow = () => setSplitPayments([...splitPayments, { metodo: options[0], monto: "" }]);
  const updateRow = (idx, patch) => {
    const copy = splitPayments.slice();
    copy[idx] = { ...copy[idx], ...patch };
    setSplitPayments(copy);
  };
  const removeRow = (idx) => setSplitPayments(splitPayments.filter((_, i) => i !== idx));

  const sum = splitPayments.reduce((s, sp) => s + (Number(sp.monto) || 0), 0);
  const diff = cartTotal - sum;

  return (
    <div className="flex flex-col gap-2 mt-2">
      {splitPayments.length === 0 && <p className="text-xs" style={{ color: C.inkDim }}>Agrega los pagos que componen el total.</p>}
      {splitPayments.map((row, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <select
            value={row.metodo}
            onChange={(e) => updateRow(idx, { metodo: e.target.value })}
            className="pos-field flex-1 min-w-0 px-2 py-1.5 text-sm rounded"
          >
            {options.map((label) => <option key={label} value={label}>{label}</option>)}
          </select>
          <input
            inputMode="numeric"
            placeholder="Valor"
            value={row.monto}
            onChange={(e) => updateRow(idx, { monto: e.target.value.replace(/\D/g, "") })}
            className="pos-field w-28 px-2 py-1.5 text-sm rounded"
          />
          <button type="button" onClick={() => removeRow(idx)} style={{ color: C.danger }}><X size={14} /></button>
        </div>
      ))}

      <button type="button" onClick={addRow} className="self-start text-xs font-semibold flex items-center gap-1 mt-1" style={{ color: C.goldDark }}>
        <Plus size={12} /> Agregar pago
      </button>

      <div className="flex items-center justify-between text-sm mt-1 pt-2" style={{ borderTop: `1px solid ${C.border}` }}>
        <span style={{ color: C.inkDim }}>Asignado: {fmt(sum)} de {fmt(cartTotal)}</span>
        {diff !== 0 && (
          <span className="font-semibold" style={{ color: C.danger }}>
            {diff > 0 ? `Falta ${fmt(diff)}` : `Sobra ${fmt(Math.abs(diff))}`}
          </span>
        )}
      </div>
    </div>
  );
}

/* ================= PAUSADAS ================= */
function PausadasTab({ pending, resumePending, deletePending, createDebt, addAbono }) {
  const [section, setSection] = useState("mesas"); // "mesas" | "deudas"
  const mesas = useMemo(() => pending.filter((p) => p.status !== "debt"), [pending]);
  const deudas = useMemo(() => pending.filter((p) => p.status === "debt"), [pending]);

  const [customerName, setCustomerName] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [paidAmount, setPaidAmount] = useState("");

  const submitDebt = () => {
    if (!customerName.trim() || !totalAmount) return;
    createDebt(customerName, totalAmount, paidAmount);
    setCustomerName(""); setTotalAmount(""); setPaidAmount("");
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2">
        <KeyBtn active={section === "mesas"} onClick={() => setSection("mesas")} style={{ padding: "8px" }}>
          Mesas {mesas.length > 0 && `(${mesas.length})`}
        </KeyBtn>
        <KeyBtn active={section === "deudas"} onClick={() => setSection("deudas")} style={{ padding: "8px" }}>
          Cuentas por cobrar {deudas.length > 0 && `(${deudas.length})`}
        </KeyBtn>
      </div>

      {section === "mesas" && (
        <div className="flex flex-col gap-3">
          <SectionLabel>Ventas en espera</SectionLabel>
          {mesas.length === 0 && (
            <p className="text-sm" style={{ color: C.inkDim }}>No hay ventas pausadas. Desde "Vender" puedes usar el botón "Pausar".</p>
          )}
          {mesas.map((p) => (
            <Card key={p.id}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs flex items-center gap-1" style={{ color: C.inkDim }}>
                    <Clock size={11} /> {p.createdAt} · {p.tableName || "Sin mesa"}
                    {p.workerName && ` · ${p.workerName}`}
                  </div>
                  <div className="text-sm mt-1" style={{ color: C.ink }}>
                    {p.cart.map((i) => `${i.name} x${i.qty}`).join(", ")}
                  </div>
                  <div className="text-sm mt-1 font-semibold" style={{ color: C.goldDark, fontFamily: "'Inter', sans-serif" }}>
                    {fmt(p.cart.reduce((s, i) => s + i.price * i.qty, 0))}
                  </div>
                </div>
                <div className="flex flex-col gap-2 items-end shrink-0">
                  <button onClick={() => resumePending(p.id)} className="flex items-center gap-1 px-3 py-1.5 text-xs rounded font-semibold" style={{ background: C.gold, color: "#FFFFFF" }}>
                    <PlayCircle size={12} /> Retomar
                  </button>
                  <button onClick={() => deletePending(p.id)} style={{ color: C.danger }}><Trash2 size={14} /></button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {section === "deudas" && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 24 }}>
          <div style={{ flex: "1 1 300px", minWidth: 0 }}>
            <Card>
              <SectionLabel>Nueva cuenta por cobrar</SectionLabel>
              <div className="flex flex-col gap-2 mt-2">
                <input placeholder="Nombre del cliente" value={customerName} onChange={(e) => setCustomerName(e.target.value)}
                  className="pos-field w-full px-2 py-2 text-sm rounded" />
                <div className="flex gap-2">
                  <input placeholder="Total de la cuenta" inputMode="numeric" value={totalAmount}
                    onChange={(e) => setTotalAmount(e.target.value.replace(/\D/g, ""))}
                    className="pos-field flex-1 min-w-0 px-2 py-2 text-sm rounded" />
                  <input placeholder="Abono inicial" inputMode="numeric" value={paidAmount}
                    onChange={(e) => setPaidAmount(e.target.value.replace(/\D/g, ""))}
                    className="pos-field flex-1 min-w-0 px-2 py-2 text-sm rounded" />
                </div>
              </div>
              <button onClick={submitDebt} className="w-full mt-3 py-2 rounded font-semibold flex items-center justify-center gap-1" style={{ background: C.gold, color: "#FFFFFF" }}>
                <Plus size={16} /> Guardar cuenta por cobrar
              </button>
            </Card>
          </div>

          <div style={{ flex: "1 1 300px", minWidth: 0 }} className="flex flex-col gap-3">
            <SectionLabel>Cuentas por cobrar</SectionLabel>
            {deudas.length === 0 && <p className="text-sm" style={{ color: C.inkDim }}>No hay cuentas por cobrar activas.</p>}
            {deudas.map((d) => (
              <DebtCard key={d.id} debt={d} addAbono={addAbono} deletePending={deletePending} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* Tarjeta de una cuenta por cobrar individual, con su propio campo de abono. */
function DebtCard({ debt, addAbono, deletePending }) {
  const [abono, setAbono] = useState("");
  const remaining = Math.max(0, debt.totalAmount - debt.paidAmount);
  const paidOff = remaining <= 0;

  const submitAbono = () => {
    if (!abono) return;
    addAbono(debt.id, abono);
    setAbono("");
  };

  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs flex items-center gap-1" style={{ color: C.inkDim }}>
            <Clock size={11} /> {debt.createdAt}{debt.workerName && ` · ${debt.workerName}`}
          </div>
          <div className="text-sm mt-1 font-semibold" style={{ color: C.ink }}>{debt.customerName}</div>
          <div className="text-xs mt-1" style={{ color: C.inkDim }}>
            Total: {fmt(debt.totalAmount)} · Abonado: {fmt(debt.paidAmount)}
          </div>
          <div className="text-sm mt-1 font-semibold" style={{ color: paidOff ? C.goldDark : C.danger, fontFamily: "'Inter', sans-serif" }}>
            {paidOff ? "Pagada ✓" : `Saldo: ${fmt(remaining)}`}
          </div>
        </div>
        <button onClick={() => deletePending(debt.id)} style={{ color: C.danger }} className="shrink-0"><Trash2 size={14} /></button>
      </div>

      {!paidOff && (
        <div className="flex gap-2 mt-3">
          <input placeholder="Nuevo abono" inputMode="numeric" value={abono} onChange={(e) => setAbono(e.target.value.replace(/\D/g, ""))}
            className="pos-field flex-1 min-w-0 px-2 py-1.5 text-sm rounded" />
          <button onClick={submitAbono} className="px-3 rounded text-sm font-semibold" style={{ background: C.gold, color: "#FFFFFF" }}>
            Abonar
          </button>
        </div>
      )}
    </Card>
  );
}
 
/* Recibe las ventas del día (con .items = [{name, qty, ...}]) y devuelve el producto
   con más unidades vendidas, ignorando las ventas anuladas. */
function topProductFromSales(salesList) {
  const counts = {};
  salesList.filter((s) => !s.anulada).forEach((s) => {
    (s.items || []).forEach((it) => {
      counts[it.name] = (counts[it.name] || 0) + Number(it.qty || 0);
    });
  });
  let top = null;
  Object.entries(counts).forEach(([name, qty]) => {
    if (!top || qty > top.qty) top = { name, qty };
  });
  return top;
}

function TopProductOfDayCard({ daySales }) {
  const top = useMemo(() => topProductFromSales(daySales), [daySales]);
  return (
    <div className="rounded-md px-3 py-2 flex flex-col" style={{ background: C.paper, border: `1px solid ${C.border}` }}>
      <span className="text-[10px] uppercase tracking-wide mb-1" style={{ color: C.inkDim, fontFamily: "Inter, sans-serif", fontWeight: 600 }}>
        Producto más vendido hoy
      </span>
      {top ? (
        <div className="flex items-baseline justify-between">
          <span className="text-base" style={{ color: C.ink, fontFamily: "'Inter', sans-serif", fontWeight: 700 }}>{top.name}</span>
          <span className="text-sm" style={{ color: C.goldDark, fontFamily: "'Inter', sans-serif", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{top.qty} u.</span>
        </div>
      ) : (
        <span className="text-sm" style={{ color: C.inkDim }}>Sin ventas todavía.</span>
      )}
    </div>
  );
}

/* ================= CAJA DEL DÍA ================= */
function CajaTab({
  selDate, setSelDate, daySales, dayByMethod, dayTotal, anularVenta, onPrintSale,
  cashBases, withdrawals, setCashBase, addWithdrawal, deleteWithdrawal, methods,
}) {
  const dayBase = cashBases.find((cb) => cb.date === selDate)?.amount || 0;
  const dayWithdrawals = useMemo(() => withdrawals.filter((w) => w.date === selDate), [withdrawals, selDate]);
  const dayWithdrawalsTotal = dayWithdrawals.reduce((s, w) => s + w.amount, 0);
  const expectedCash = dayBase + (dayByMethod[FIXED_CASH_METHOD.label] || 0) - dayWithdrawalsTotal;
 
  const [baseInput, setBaseInput] = useState(dayBase ? String(dayBase) : "");
  const [wDesc, setWDesc] = useState("");
  const [wAmount, setWAmount] = useState("");
  const [methodFilter, setMethodFilter] = useState("todas");

  const filteredDaySales = useMemo(
    () => (methodFilter === "todas" ? daySales : daySales.filter((s) => s.method === methodFilter)),
    [daySales, methodFilter]
  );
 
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
            className="px-3 rounded font-semibold"
            style={{ background: C.gold, color: "#FFFFFF" }}
          >
            Guardar
          </button>
        </div>
      </Card>
 
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
        {reportRows(dayByMethod, methods).map((r) => <VFD key={r.key} label={r.label} value={r.value} small />)}
      </div>
      <VFD label="Total del día" value={dayTotal} tone="accent" />

      <TopProductOfDayCard daySales={daySales} />
 
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
                <span className="text-sm font-semibold" style={{ color: C.danger, fontFamily: "'Inter', sans-serif" }}>-{fmt(w.amount)}</span>
                <button onClick={() => deleteWithdrawal(w.id)} style={{ color: C.danger }}><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      </Card>
 
      <VFD label="Efectivo esperado en caja" value={expectedCash} tone="accent" />
 
      <Card>
        <SectionLabel>Transacciones</SectionLabel>
        <div className="flex flex-wrap gap-2 mt-2">
          <KeyBtn active={methodFilter === "todas"} onClick={() => setMethodFilter("todas")} style={{ padding: "6px 12px", fontSize: 12 }}>Todas</KeyBtn>
          {methods.map((m) => (
            <KeyBtn key={m.id} active={methodFilter === m.label} onClick={() => setMethodFilter(m.label)} style={{ padding: "6px 12px", fontSize: 12 }}>{m.label}</KeyBtn>
          ))}
        </div>
        <div className="mt-3 flex flex-col gap-3">
          {filteredDaySales.length === 0 && <p className="text-sm" style={{ color: C.inkDim }}>No hay ventas para este filtro.</p>}
          {filteredDaySales.slice().reverse().map((s) => (
            <div key={s.id} className="flex justify-between items-start pb-3" style={{ borderBottom: `1px solid ${C.border}`, opacity: s.anulada ? 0.55 : 1 }}>
              <div>
                <div className="text-xs" style={{ color: C.inkDim }}>
                  {s.time} · <span style={{ color: methodColor(s.method, methods) }}>{methodLabel(s.method, methods)}</span>
                  {s.tableName ? ` · ${s.tableName}` : ""}
                  {s.workerName ? ` · ${s.workerName}` : ""}
                  {s.anulada && <span className="ml-2 font-semibold" style={{ color: C.danger }}>· ANULADA</span>}
                </div>
                <div className="text-sm mt-1" style={{ color: s.anulada ? C.inkDim : C.ink, textDecoration: s.anulada ? "line-through" : "none" }}>
                  {s.items.map((i) => `${i.name} x${i.qty}`).join(", ")}
                </div>
                {s.cashReceived != null && (
                  <div className="text-xs mt-1" style={{ color: C.inkDim, fontFamily: "'Inter', sans-serif" }}>
                    Recibió {fmt(s.cashReceived)} · {s.change < 0 ? `Faltó ${fmt(Math.abs(s.change))}` : `Vueltas ${fmt(s.change)}`}
                  </div>
                )}
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className="text-sm font-semibold" style={{ color: s.anulada ? C.inkDim : C.ink, textDecoration: s.anulada ? "line-through" : "none", fontFamily: "'Inter', sans-serif" }}>{fmt(s.total)}</span>
                <div className="flex items-center gap-2">
                  <button onClick={() => onPrintSale(s)} style={{ color: C.inkDim }} title="Imprimir comprobante"><Printer size={14} /></button>
                  {!s.anulada && (
                    <button onClick={() => { if (confirm("¿Anular esta venta? No se borrará, quedará marcada como anulada.")) anularVenta(s.id); }} style={{ color: C.danger }} title="Anular venta">
                      <Ban size={14} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

/* ---------- utilidades para las métricas nuevas de Progreso ---------- */

// Convierte el string de hora guardado (p.ej. "09:41 a.m." o "21:05") a un número 0-23.
const parseHour24 = (timeStr) => {
  if (!timeStr) return 0;
  const match = String(timeStr).match(/(\d{1,2}):(\d{2})\s*([ap]\.?\s*m\.?)?/i);
  if (!match) return 0;
  let h = parseInt(match[1], 10);
  const period = match[3] ? match[3].toLowerCase().replace(/\./g, "").trim() : null;
  if (period) {
    if (period.startsWith("p") && h !== 12) h += 12;
    if (period.startsWith("a") && h === 12) h = 0;
  }
  return ((h % 24) + 24) % 24;
};

// Arma y dispara la descarga de un CSV a partir de las ventas activas (no anuladas).
const downloadSalesCSV = (salesList, fileTag, methods) => {
  const header = ["Fecha", "Hora", "Método de pago", "Total", "Items"];
  const rows = salesList.map((s) => {
    const itemsStr = (s.items || []).map((it) => `${it.qty}x ${it.name}`).join(" | ");
    return [s.date, s.time, methodLabel(s.method, methods), s.total, itemsStr];
  });
  const escape = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [header, ...rows].map((r) => r.map(escape).join(",")).join("\r\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ventas_${fileTag}_${toISO(new Date())}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

/* ================= PROGRESO ================= */
function ProgresoTab(props) {
  const {
    progView, setProgView, weekStart, setWeekStart, weekChart, weekTotal, weekByMethod,
    monthCursor, setMonthCursor, monthWeeks, monthTotal, monthByMethod, sales, methods,
  } = props;

  const [hourMetric, setHourMetric] = useState("total"); // "total" (ingresos) o "count" (cantidad)

  // Ventas activas (no anuladas) que caen dentro del periodo seleccionado (semana o mes).
  const filteredSales = useMemo(() => {
    const list = sales || [];
    if (progView === "semana") {
      const isos = new Set(weekChart.map((d) => d.iso));
      return list.filter((s) => !s.anulada && isos.has(s.date));
    }
    return list.filter((s) => {
      if (s.anulada) return false;
      const d = parseISO(s.date);
      return d.getFullYear() === monthCursor.y && d.getMonth() === monthCursor.m;
    });
  }, [sales, progView, weekChart, monthCursor]);

  // Cantidad y monto vendido por producto dentro del periodo.
  const productStats = useMemo(() => {
    const map = {};
    filteredSales.forEach((s) => {
      (s.items || []).forEach((it) => {
        if (!map[it.name]) map[it.name] = { name: it.name, qty: 0, total: 0 };
        map[it.name].qty += it.qty;
        map[it.name].total += it.price * it.qty;
      });
    });
    return Object.values(map).sort((a, b) => b.qty - a.qty);
  }, [filteredSales]);

  const topProduct = productStats[0] || null;

  // Ingresos / cantidad de ventas agrupados por hora del día (00 - 23).
  const hourlyChart = useMemo(() => {
    const buckets = Array.from({ length: 24 }, (_, h) => ({ label: `${String(h).padStart(2, "0")}h`, total: 0, count: 0 }));
    filteredSales.forEach((s) => {
      const h = parseHour24(s.time);
      buckets[h].total += s.total;
      buckets[h].count += 1;
    });
    return buckets;
  }, [filteredSales]);

  const exportCSV = () => downloadSalesCSV(filteredSales, progView, methods);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-2">
        <KeyBtn active={progView === "semana"} onClick={() => setProgView("semana")} style={{ padding: "8px" }}>Semana</KeyBtn>
        <KeyBtn active={progView === "mes"} onClick={() => setProgView("mes")} style={{ padding: "8px" }}>Mes</KeyBtn>
      </div>

      <button
        onClick={exportCSV}
        className="flex items-center justify-center gap-2 py-2 rounded-md text-sm font-semibold"
        style={{ background: C.gold, color: "#FFFFFF" }}
      >
        <Download size={15} /> Exportar CSV ({filteredSales.length} ventas)
      </button>

      {progView === "semana" ? (
        <>
          <div className="flex items-center justify-between">
            <button onClick={() => setWeekStart(addDays(weekStart, -7))} style={{ color: C.goldDark }}><ChevronLeft /></button>
            <span className="text-sm font-semibold" style={{ color: C.ink }}>{toISO(weekStart)} — {toISO(addDays(weekStart, 6))}</span>
            <button onClick={() => setWeekStart(addDays(weekStart, 7))} style={{ color: C.goldDark }}><ChevronRight /></button>
          </div>
          <ChartCard data={weekChart} />
          <VFD label="Total de la semana" value={weekTotal} tone="accent" />
          <MethodBreakdown byMethod={weekByMethod} methods={methods} />
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
          <MethodBreakdown byMethod={monthByMethod} methods={methods} />
        </>
      )}

      <TopProductCard product={topProduct} />

      <div>
        <div className="flex items-center justify-between mb-2">
          <SectionLabel>Ventas por hora del día</SectionLabel>
          <div className="flex gap-1">
            <KeyBtn active={hourMetric === "total"} onClick={() => setHourMetric("total")} style={{ padding: "4px 8px", fontSize: 11 }}>Ingresos</KeyBtn>
            <KeyBtn active={hourMetric === "count"} onClick={() => setHourMetric("count")} style={{ padding: "4px 8px", fontSize: 11 }}>Cantidad</KeyBtn>
          </div>
        </div>
        <HourlyChart data={hourlyChart} metric={hourMetric} />
      </div>

      <ProductSalesTable stats={productStats} />
    </div>
  );
}

/* Tarjeta con el producto más vendido (en unidades) del periodo seleccionado. */
function TopProductCard({ product }) {
  return (
    <div className="rounded-md px-3 py-2 flex flex-col" style={{ background: C.paper, border: `1px solid ${C.border}` }}>
      <span className="text-[10px] uppercase tracking-wide mb-1" style={{ color: C.inkDim, fontFamily: "Inter, sans-serif", fontWeight: 600 }}>
        Producto más vendido
      </span>
      {product ? (
        <div className="flex items-baseline justify-between">
          <span className="text-base" style={{ color: C.ink, fontFamily: "'Inter', sans-serif", fontWeight: 700 }}>
            {product.name}
          </span>
          <span className="text-sm" style={{ color: C.goldDark, fontFamily: "'Inter', sans-serif", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
            {product.qty} u. · {fmt(product.total)}
          </span>
        </div>
      ) : (
        <span className="text-sm" style={{ color: C.inkDim, fontFamily: "'Inter', sans-serif" }}>Sin ventas en este periodo.</span>
      )}
    </div>
  );
}

/* Gráfica de barras de ventas agrupadas por hora (00h - 23h). */
function HourlyChart({ data, metric }) {
  return (
    <Card style={{ height: 220 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={C.border} vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 9, fill: C.inkDim }} axisLine={{ stroke: C.border }} tickLine={false} interval={1} />
          <YAxis hide />
          <Tooltip
            formatter={(v) => (metric === "total" ? fmt(v) : `${v} venta(s)`)}
            contentStyle={{ background: "#FFFFFF", border: `1px solid ${C.border}`, color: C.ink, fontSize: 12 }}
            labelStyle={{ color: C.ink }}
          />
          <Bar dataKey={metric} radius={[4, 4, 0, 0]}>
            {data.map((_, i) => <Cell key={i} fill={C.gold} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}

/* Tabla sencilla de unidades / total vendido por producto en el periodo seleccionado. */
function ProductSalesTable({ stats }) {
  return (
    <div>
      <SectionLabel>Ventas por producto</SectionLabel>
      <Card style={{ marginTop: 8, padding: 0 }}>
        <div style={{ maxHeight: 280, overflowY: "auto" }}>
          {stats.length === 0 ? (
            <p className="text-sm p-4" style={{ color: C.inkDim }}>No hay ventas en este periodo.</p>
          ) : (
            stats.map((p, idx) => (
              <div
                key={p.name}
                className="flex items-center justify-between px-4 py-2"
                style={{ borderBottom: idx < stats.length - 1 ? `1px solid ${C.border}` : "none" }}
              >
                <span className="text-sm" style={{ color: C.ink }}>{p.name}</span>
                <div className="flex items-center gap-4">
                  <span className="text-sm font-semibold" style={{ color: C.ink, fontVariantNumeric: "tabular-nums" }}>{p.qty} u.</span>
                  <span className="text-xs" style={{ color: C.inkDim, fontVariantNumeric: "tabular-nums" }}>{fmt(p.total)}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>
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
 
function MethodBreakdown({ byMethod, methods }) {
  return (
    <div>
      <SectionLabel>Por método de pago</SectionLabel>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginTop: 8 }}>
        {reportRows(byMethod, methods).map((r) => <VFD key={r.key} label={r.label} value={r.value} small />)}
      </div>
    </div>
  );
}
 
/* Selector de insumo + cantidad, reutilizado en categorías y productos con inventario "por receta". */
function RecipeBuilder({ insumos, recipe, onChange }) {
  const addRow = () => {
    const used = recipe.map((r) => r.insumoId);
    const next = insumos.find((i) => !used.includes(i.id));
    if (!next) return;
    onChange([...recipe, { insumoId: next.id, qty: "" }]);
  };
  const updateRow = (idx, patch) => {
    const copy = recipe.slice();
    copy[idx] = { ...copy[idx], ...patch };
    onChange(copy);
  };
  const removeRow = (idx) => onChange(recipe.filter((_, i) => i !== idx));

  if (insumos.length === 0) {
    return <p className="text-xs" style={{ color: C.danger }}>Crea insumos primero en la pestaña "Insumos".</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {recipe.length === 0 && <p className="text-xs" style={{ color: C.inkDim }}>Sin insumos asociados todavía.</p>}
      {recipe.map((row, idx) => {
        const insumo = insumos.find((i) => i.id === row.insumoId);
        return (
          <div key={idx} className="flex items-center gap-2">
            <select
              className="pos-field flex-1 min-w-0 px-2 py-1.5 text-sm rounded"
              value={row.insumoId}
              onChange={(e) => updateRow(idx, { insumoId: e.target.value })}
            >
              {insumos.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
            <input
              className="pos-field w-20 px-2 py-1.5 text-sm rounded"
              inputMode="decimal"
              placeholder="Cant."
              value={row.qty}
              onChange={(e) => updateRow(idx, { qty: e.target.value.replace(/[^0-9.]/g, "") })}
            />
            <span className="text-xs w-8 shrink-0" style={{ color: C.inkDim }}>{insumo ? insumo.unit : ""}</span>
            <button type="button" onClick={() => removeRow(idx)} style={{ color: C.danger }}><X size={14} /></button>
          </div>
        );
      })}
      <button
        type="button"
        onClick={addRow}
        disabled={recipe.length >= insumos.length}
        className="self-start text-xs font-semibold flex items-center gap-1 mt-1 disabled:opacity-40"
        style={{ color: C.goldDark }}
      >
        <Plus size={12} /> Agregar insumo
      </button>
    </div>
  );
}

/* Resumen corto y legible de cómo un producto afecta el inventario, usado en el catálogo. */
function inventorySummary(p, insumos, categories) {
  if (p.inventoryType === "direct") return `Directo · stock: ${p.stock ?? 0} u.`;
  if (p.inventoryType === "recipe") {
    const recipe = effectiveRecipe(p, categories);
    if (recipe.length === 0) return "Receta · sin insumos configurados";
    const parts = recipe.map((r) => {
      const ins = insumos.find((i) => i.id === r.insumoId);
      return ins ? `${r.qty}${ins.unit} ${ins.name}` : null;
    }).filter(Boolean);
    const source = p.recipeOverride ? "" : " (de categoría)";
    return `Receta${source} · ${parts.join(", ")}`;
  }
  return "Sin inventario";
}

/* Formulario compartido (crear/editar) para los campos de inventario de un producto. */
function ProductInventoryFields({ categories, insumos, categoryId, setCategoryId, inventoryType, setInventoryType, stock, setStock, recipeMode, setRecipeMode, customRecipe, setCustomRecipe }) {
  const category = categories.find((c) => c.id === categoryId);
  const hasCategoryRecipe = !!category && (category.defaultRecipe || []).length > 0;

  return (
    <div className="flex flex-col gap-3">
      <div>
        <label className="text-xs font-semibold" style={{ color: C.inkDim }}>Categoría</label>
        <select className="pos-field w-full mt-1 px-2 py-2 text-sm rounded" value={categoryId || ""} onChange={(e) => setCategoryId(e.target.value || null)}>
          <option value="">Sin categoría</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      <div>
        <label className="text-xs font-semibold" style={{ color: C.inkDim }}>Tipo de inventario</label>
        <div className="grid grid-cols-1 gap-2 mt-1">
          <KeyBtn active={inventoryType === "none"} onClick={() => setInventoryType("none")} style={{ padding: "8px", textAlign: "left" }}>Sin inventario</KeyBtn>
          <KeyBtn active={inventoryType === "direct"} onClick={() => setInventoryType("direct")} style={{ padding: "8px", textAlign: "left" }}>Directo por unidades</KeyBtn>
          <KeyBtn active={inventoryType === "recipe"} onClick={() => setInventoryType("recipe")} style={{ padding: "8px", textAlign: "left" }}>Por insumos / receta</KeyBtn>
        </div>
      </div>

      {inventoryType === "direct" && (
        <div>
          <label className="text-xs font-semibold" style={{ color: C.inkDim }}>Stock actual (unidades)</label>
          <input inputMode="numeric" value={stock} onChange={(e) => setStock(e.target.value.replace(/\D/g, ""))}
            className="pos-field w-full mt-1 px-2 py-2 text-sm rounded" placeholder="0" />
        </div>
      )}

      {inventoryType === "recipe" && (
        <div className="flex flex-col gap-2">
          {hasCategoryRecipe && (
            <div className="grid grid-cols-2 gap-2">
              <KeyBtn active={recipeMode === "category"} onClick={() => setRecipeMode("category")} style={{ padding: "8px", fontSize: 12 }}>Usar receta de categoría</KeyBtn>
              <KeyBtn active={recipeMode === "custom"} onClick={() => setRecipeMode("custom")} style={{ padding: "8px", fontSize: 12 }}>Personalizar</KeyBtn>
            </div>
          )}
          {recipeMode === "category" && hasCategoryRecipe ? (
            <div className="text-xs rounded-md px-3 py-2" style={{ background: C.goldSoft, color: C.ink }}>
              {category.defaultRecipe.map((r) => {
                const ins = insumos.find((i) => i.id === r.insumoId);
                return ins ? `${r.qty}${ins.unit} ${ins.name}` : null;
              }).filter(Boolean).join(", ") || "Sin insumos en la categoría."}
            </div>
          ) : (
            <RecipeBuilder insumos={insumos} recipe={customRecipe} onChange={setCustomRecipe} />
          )}
        </div>
      )}
    </div>
  );
}

/* ================= PRODUCTOS ================= */
function ProductosTab({
  products, addProduct, editProduct, deleteProduct, tables, addTable, editTable, deleteTable,
  insumos, addInsumo, editInsumo, deleteInsumo,
  categories, addCategory, editCategory, deleteCategory,
  workers, addWorker, toggleWorkerActive, deleteWorker,
  paymentMethods, addPaymentMethod, togglePaymentMethodActive, deletePaymentMethod,
}) {
  const [section, setSection] = useState("productos"); // "productos" | "categorias" | "insumos" | "trabajadores" | "pagos"

  /* --- nuevo producto --- */
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [categoryId, setCategoryId] = useState(null);
  const [inventoryType, setInventoryType] = useState("none");
  const [stock, setStock] = useState("");
  const [recipeMode, setRecipeMode] = useState("category");
  const [customRecipe, setCustomRecipe] = useState([]);

  const resetProductForm = () => {
    setName(""); setPrice(""); setCategoryId(null); setInventoryType("none");
    setStock(""); setRecipeMode("category"); setCustomRecipe([]);
  };

  const submitNewProduct = () => {
    if (!name.trim() || !price) return;
    addProduct(name, price, {
      categoryId,
      inventoryType,
      stock: inventoryType === "direct" ? stock : null,
      recipeOverride: inventoryType === "recipe" && recipeMode === "custom" ? customRecipe.filter((r) => r.insumoId && r.qty) : null,
    });
    resetProductForm();
  };

  /* --- edición de producto --- */
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editCategoryId, setEditCategoryId] = useState(null);
  const [editInventoryType, setEditInventoryType] = useState("none");
  const [editStock, setEditStock] = useState("");
  const [editRecipeMode, setEditRecipeMode] = useState("category");
  const [editCustomRecipe, setEditCustomRecipe] = useState([]);

  const startEditProduct = (p) => {
    setEditingId(p.id);
    setEditName(p.name);
    setEditPrice(String(p.price));
    setEditCategoryId(p.categoryId || null);
    setEditInventoryType(p.inventoryType || "none");
    setEditStock(p.stock != null ? String(p.stock) : "");
    setEditRecipeMode(p.recipeOverride ? "custom" : "category");
    setEditCustomRecipe(p.recipeOverride || []);
  };

  const submitEditProduct = () => {
    editProduct(editingId, editName, editPrice, {
      categoryId: editCategoryId,
      inventoryType: editInventoryType,
      stock: editInventoryType === "direct" ? editStock : null,
      recipeOverride: editInventoryType === "recipe" && editRecipeMode === "custom" ? editCustomRecipe.filter((r) => r.insumoId && r.qty) : null,
    });
    setEditingId(null);
  };

  /* --- mesas (sin cambios) --- */
  const [tableName, setTableName] = useState("");
  const [editingTableId, setEditingTableId] = useState(null);
  const [editTableName, setEditTableName] = useState("");

  /* --- categorías --- */
  const [catName, setCatName] = useState("");
  const [catRecipe, setCatRecipe] = useState([]);
  const [editingCatId, setEditingCatId] = useState(null);
  const [editCatName, setEditCatName] = useState("");
  const [editCatRecipe, setEditCatRecipe] = useState([]);

  const startEditCategory = (c) => {
    setEditingCatId(c.id); setEditCatName(c.name); setEditCatRecipe(c.defaultRecipe || []);
  };

  /* --- insumos --- */
  const [insName, setInsName] = useState("");
  const [insUnit, setInsUnit] = useState(UNIT_OPTIONS[0].id);
  const [insStock, setInsStock] = useState("");
  const [editingInsId, setEditingInsId] = useState(null);
  const [editInsName, setEditInsName] = useState("");
  const [editInsUnit, setEditInsUnit] = useState(UNIT_OPTIONS[0].id);
  const [editInsStock, setEditInsStock] = useState("");

  const startEditInsumo = (i) => {
    setEditingInsId(i.id); setEditInsName(i.name); setEditInsUnit(i.unit); setEditInsStock(String(i.stock));
  };

  /* --- trabajadores --- */
  const [workerNameInput, setWorkerNameInput] = useState("");

  /* --- métodos de pago personalizados --- */
  const [paymentMethodInput, setPaymentMethodInput] = useState("");

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-5 gap-2">
        <KeyBtn active={section === "productos"} onClick={() => setSection("productos")} style={{ padding: "8px" }}>Productos</KeyBtn>
        <KeyBtn active={section === "categorias"} onClick={() => setSection("categorias")} style={{ padding: "8px" }}>Categorías</KeyBtn>
        <KeyBtn active={section === "insumos"} onClick={() => setSection("insumos")} style={{ padding: "8px" }}>Insumos</KeyBtn>
        <KeyBtn active={section === "trabajadores"} onClick={() => setSection("trabajadores")} style={{ padding: "8px" }}>Trabajadores</KeyBtn>
        <KeyBtn active={section === "pagos"} onClick={() => setSection("pagos")} style={{ padding: "8px" }}>Métodos de pago</KeyBtn>
      </div>

      {section === "productos" && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 24 }}>
          <div style={{ flex: "1 1 340px", minWidth: 0 }} className="flex flex-col gap-4">
            <Card>
              <SectionLabel>Nuevo producto</SectionLabel>
              <div className="flex gap-2 mt-2">
                <input placeholder="Nombre" value={name} onChange={(e) => setName(e.target.value)}
                  className="pos-field flex-1 min-w-0 px-2 py-2 text-sm rounded" />
                <input placeholder="Valor" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ""))}
                  className="pos-field w-24 px-2 py-2 text-sm rounded" />
              </div>
              <div className="mt-3">
                <ProductInventoryFields
                  categories={categories} insumos={insumos}
                  categoryId={categoryId} setCategoryId={setCategoryId}
                  inventoryType={inventoryType} setInventoryType={setInventoryType}
                  stock={stock} setStock={setStock}
                  recipeMode={recipeMode} setRecipeMode={setRecipeMode}
                  customRecipe={customRecipe} setCustomRecipe={setCustomRecipe}
                />
              </div>
              <button onClick={submitNewProduct} className="w-full mt-3 py-2 rounded font-semibold flex items-center justify-center gap-1" style={{ background: C.gold, color: "#FFFFFF" }}>
                <Plus size={16} /> Agregar producto
              </button>
            </Card>
          </div>

          <div style={{ flex: "1 1 340px", minWidth: 0 }} className="flex flex-col gap-4">
            <Card>
              <SectionLabel>Catálogo</SectionLabel>
              <div className="mt-2 flex flex-col gap-2">
                {products.length === 0 && <p className="text-sm" style={{ color: C.inkDim }}>Aún no hay productos.</p>}
                {products.map((p, idx) => {
                  const cat = categories.find((c) => c.id === p.categoryId);
                  return (
                    <div key={p.id} className="py-2" style={{ borderBottom: idx < products.length - 1 ? `1px solid ${C.border}` : "none" }}>
                      {editingId === p.id ? (
                        <div className="flex flex-col gap-2">
                          <div className="flex gap-2">
                            <input value={editName} onChange={(e) => setEditName(e.target.value)} className="pos-field flex-1 min-w-0 px-2 py-1.5 text-sm rounded" />
                            <input value={editPrice} onChange={(e) => setEditPrice(e.target.value.replace(/\D/g, ""))} className="pos-field w-24 px-2 py-1.5 text-sm rounded" />
                          </div>
                          <ProductInventoryFields
                            categories={categories} insumos={insumos}
                            categoryId={editCategoryId} setCategoryId={setEditCategoryId}
                            inventoryType={editInventoryType} setInventoryType={setEditInventoryType}
                            stock={editStock} setStock={setEditStock}
                            recipeMode={editRecipeMode} setRecipeMode={setEditRecipeMode}
                            customRecipe={editCustomRecipe} setCustomRecipe={setEditCustomRecipe}
                          />
                          <div className="flex gap-2 mt-1">
                            <button onClick={submitEditProduct} className="flex-1 py-1.5 rounded text-sm font-semibold flex items-center justify-center gap-1" style={{ background: C.gold, color: "#FFFFFF" }}>
                              <Check size={14} /> Guardar
                            </button>
                            <button onClick={() => setEditingId(null)} className="flex-1 py-1.5 rounded text-sm font-semibold" style={{ background: "#FFFFFF", color: C.ink, border: `1px solid ${C.border}` }}>
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between">
                          <div className="min-w-0">
                            <div className="text-sm" style={{ color: C.ink }}>
                              {p.name} {cat && <span className="text-xs" style={{ color: C.inkDim }}>· {cat.name}</span>}
                            </div>
                            <div className="text-xs" style={{ color: C.inkDim, fontFamily: "'Inter', sans-serif" }}>{fmt(p.price)}</div>
                            <div className="text-xs mt-0.5" style={{ color: C.goldDark }}>{inventorySummary(p, insumos, categories)}</div>
                          </div>
                          <div className="flex gap-3 shrink-0 ml-2">
                            <button onClick={() => startEditProduct(p)} style={{ color: C.inkDim }}><Pencil size={14} /></button>
                            <button onClick={() => deleteProduct(p.id)} style={{ color: C.danger }}><Trash2 size={14} /></button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card>
              <SectionLabel>Mesas</SectionLabel>
              <div className="flex gap-2 mt-2">
                <input placeholder="Nombre o número de mesa" value={tableName} onChange={(e) => setTableName(e.target.value)}
                  className="pos-field flex-1 min-w-0 px-2 py-2 text-sm rounded" />
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
                        <input value={editTableName} onChange={(e) => setEditTableName(e.target.value)} className="pos-field flex-1 min-w-0 px-2 py-1 text-sm rounded" />
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
      )}

      {section === "categorias" && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 24 }}>
          <div style={{ flex: "1 1 340px", minWidth: 0 }}>
            <Card>
              <SectionLabel>Nueva categoría</SectionLabel>
              <input placeholder="Nombre de la categoría" value={catName} onChange={(e) => setCatName(e.target.value)}
                className="pos-field w-full mt-3 px-2 py-2 text-sm rounded" />
              <div className="mt-3">
                <label className="text-xs font-semibold" style={{ color: C.inkDim }}>Receta base (opcional)</label>
                <div className="mt-1">
                  <RecipeBuilder insumos={insumos} recipe={catRecipe} onChange={setCatRecipe} />
                </div>
              </div>
              <button
                onClick={() => { addCategory(catName, catRecipe.filter((r) => r.insumoId && r.qty)); setCatName(""); setCatRecipe([]); }}
                className="w-full mt-3 py-2 rounded font-semibold flex items-center justify-center gap-1" style={{ background: C.gold, color: "#FFFFFF" }}
              >
                <Plus size={16} /> Agregar categoría
              </button>
            </Card>
          </div>

          <div style={{ flex: "1 1 340px", minWidth: 0 }}>
            <Card>
              <SectionLabel>Categorías</SectionLabel>
              <div className="mt-2 flex flex-col gap-3">
                {categories.length === 0 && <p className="text-sm" style={{ color: C.inkDim }}>Aún no hay categorías.</p>}
                {categories.map((c, idx) => (
                  <div key={c.id} className="py-2" style={{ borderBottom: idx < categories.length - 1 ? `1px solid ${C.border}` : "none" }}>
                    {editingCatId === c.id ? (
                      <div className="flex flex-col gap-2">
                        <input value={editCatName} onChange={(e) => setEditCatName(e.target.value)} className="pos-field w-full px-2 py-1.5 text-sm rounded" />
                        <RecipeBuilder insumos={insumos} recipe={editCatRecipe} onChange={setEditCatRecipe} />
                        <div className="flex gap-2 mt-1">
                          <button
                            onClick={() => { editCategory(c.id, editCatName, editCatRecipe.filter((r) => r.insumoId && r.qty)); setEditingCatId(null); }}
                            className="flex-1 py-1.5 rounded text-sm font-semibold flex items-center justify-center gap-1" style={{ background: C.gold, color: "#FFFFFF" }}
                          >
                            <Check size={14} /> Guardar
                          </button>
                          <button onClick={() => setEditingCatId(null)} className="flex-1 py-1.5 rounded text-sm font-semibold" style={{ background: "#FFFFFF", color: C.ink, border: `1px solid ${C.border}` }}>
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <div className="min-w-0">
                          <div className="text-sm" style={{ color: C.ink }}>{c.name}</div>
                          <div className="text-xs mt-0.5" style={{ color: C.inkDim }}>
                            {(c.defaultRecipe || []).length === 0
                              ? "Sin receta base."
                              : c.defaultRecipe.map((r) => {
                                  const ins = insumos.find((i) => i.id === r.insumoId);
                                  return ins ? `${r.qty}${ins.unit} ${ins.name}` : null;
                                }).filter(Boolean).join(", ")}
                          </div>
                        </div>
                        <div className="flex gap-3 shrink-0 ml-2">
                          <button onClick={() => startEditCategory(c)} style={{ color: C.inkDim }}><Pencil size={14} /></button>
                          <button onClick={() => deleteCategory(c.id)} style={{ color: C.danger }}><Trash2 size={14} /></button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      )}

      {section === "insumos" && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 24 }}>
          <div style={{ flex: "1 1 340px", minWidth: 0 }}>
            <Card>
              <SectionLabel>Nuevo insumo</SectionLabel>
              <div className="flex flex-col gap-2 mt-3">
                <input placeholder="Nombre del insumo" value={insName} onChange={(e) => setInsName(e.target.value)}
                  className="pos-field w-full px-2 py-2 text-sm rounded" />
                <div className="flex gap-2">
                  <select value={insUnit} onChange={(e) => setInsUnit(e.target.value)} className="pos-field flex-1 min-w-0 px-2 py-2 text-sm rounded">
                    {UNIT_OPTIONS.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
                  </select>
                  <input placeholder="Stock inicial" inputMode="decimal" value={insStock} onChange={(e) => setInsStock(e.target.value.replace(/[^0-9.]/g, ""))}
                    className="pos-field w-28 px-2 py-2 text-sm rounded" />
                </div>
              </div>
              <button
                onClick={() => { addInsumo(insName, insUnit, insStock); setInsName(""); setInsStock(""); }}
                className="w-full mt-3 py-2 rounded font-semibold flex items-center justify-center gap-1" style={{ background: C.gold, color: "#FFFFFF" }}
              >
                <Plus size={16} /> Agregar insumo
              </button>
            </Card>
          </div>

          <div style={{ flex: "1 1 340px", minWidth: 0 }}>
            <Card>
              <SectionLabel>Insumos / materia prima</SectionLabel>
              <div className="mt-2 flex flex-col gap-2">
                {insumos.length === 0 && <p className="text-sm" style={{ color: C.inkDim }}>Aún no hay insumos registrados.</p>}
                {insumos.map((i, idx) => (
                  <div key={i.id} className="py-2" style={{ borderBottom: idx < insumos.length - 1 ? `1px solid ${C.border}` : "none" }}>
                    {editingInsId === i.id ? (
                      <div className="flex flex-col gap-2">
                        <input value={editInsName} onChange={(e) => setEditInsName(e.target.value)} className="pos-field w-full px-2 py-1.5 text-sm rounded" />
                        <div className="flex gap-2">
                          <select value={editInsUnit} onChange={(e) => setEditInsUnit(e.target.value)} className="pos-field flex-1 min-w-0 px-2 py-1.5 text-sm rounded">
                            {UNIT_OPTIONS.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
                          </select>
                          <input value={editInsStock} onChange={(e) => setEditInsStock(e.target.value.replace(/[^0-9.]/g, ""))} className="pos-field w-28 px-2 py-1.5 text-sm rounded" />
                        </div>
                        <div className="flex gap-2 mt-1">
                          <button
                            onClick={() => { editInsumo(i.id, editInsName, editInsUnit, editInsStock); setEditingInsId(null); }}
                            className="flex-1 py-1.5 rounded text-sm font-semibold flex items-center justify-center gap-1" style={{ background: C.gold, color: "#FFFFFF" }}
                          >
                            <Check size={14} /> Guardar
                          </button>
                          <button onClick={() => setEditingInsId(null)} className="flex-1 py-1.5 rounded text-sm font-semibold" style={{ background: "#FFFFFF", color: C.ink, border: `1px solid ${C.border}` }}>
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm" style={{ color: C.ink }}>{i.name}</div>
                          <div className="text-xs" style={{ color: C.inkDim }}>Stock: {i.stock} {i.unit} · {unitLabel(i.unit)}</div>
                        </div>
                        <div className="flex gap-3 shrink-0 ml-2">
                          <button onClick={() => startEditInsumo(i)} style={{ color: C.inkDim }}><Pencil size={14} /></button>
                          <button onClick={() => deleteInsumo(i.id)} style={{ color: C.danger }}><Trash2 size={14} /></button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      )}

      {section === "trabajadores" && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 24 }}>
          <div style={{ flex: "1 1 340px", minWidth: 0 }}>
            <Card>
              <SectionLabel>Nuevo trabajador</SectionLabel>
              <div className="flex gap-2 mt-3">
                <input placeholder="Nombre del trabajador" value={workerNameInput} onChange={(e) => setWorkerNameInput(e.target.value)}
                  className="pos-field flex-1 min-w-0 px-2 py-2 text-sm rounded" />
                <button
                  onClick={() => { addWorker(workerNameInput); setWorkerNameInput(""); }}
                  className="px-3 rounded" style={{ background: C.gold, color: "#FFFFFF" }}
                >
                  <Plus size={16} />
                </button>
              </div>
            </Card>
          </div>

          <div style={{ flex: "1 1 340px", minWidth: 0 }}>
            <Card>
              <SectionLabel>Trabajadores</SectionLabel>
              <div className="mt-2 flex flex-col gap-2">
                {workers.length === 0 && <p className="text-sm" style={{ color: C.inkDim }}>Aún no hay trabajadores registrados.</p>}
                {workers.map((w, idx) => (
                  <div key={w.id} className="flex items-center justify-between py-2" style={{ borderBottom: idx < workers.length - 1 ? `1px solid ${C.border}` : "none" }}>
                    <div>
                      <div className="text-sm" style={{ color: C.ink }}>{w.name}</div>
                      <div className="text-xs" style={{ color: w.active ? C.goldDark : C.inkDim }}>{w.active ? "Activo" : "Inactivo"}</div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <button
                        onClick={() => toggleWorkerActive(w.id, !w.active)}
                        className="text-xs font-semibold px-2 py-1 rounded"
                        style={{ background: w.active ? C.goldSoft : "#FFFFFF", color: C.ink, border: `1px solid ${C.border}` }}
                      >
                        {w.active ? "Desactivar" : "Activar"}
                      </button>
                      <button onClick={() => deleteWorker(w.id)} style={{ color: C.danger }}><Trash2 size={14} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      )}

      {section === "pagos" && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 24 }}>
          <div style={{ flex: "1 1 340px", minWidth: 0 }}>
            <Card>
              <SectionLabel>Nuevo método de pago</SectionLabel>
              <div className="flex gap-2 mt-3">
                <input placeholder="Ej. Nequi, Tarjeta, Transferencia" value={paymentMethodInput} onChange={(e) => setPaymentMethodInput(e.target.value)}
                  className="pos-field flex-1 min-w-0 px-2 py-2 text-sm rounded" />
                <button
                  onClick={() => { addPaymentMethod(paymentMethodInput); setPaymentMethodInput(""); }}
                  className="px-3 rounded" style={{ background: C.gold, color: "#FFFFFF" }}
                >
                  <Plus size={16} />
                </button>
              </div>
            </Card>
          </div>

          <div style={{ flex: "1 1 340px", minWidth: 0 }}>
            <Card>
              <SectionLabel>Métodos de pago</SectionLabel>
              <div className="mt-2 flex flex-col gap-2">
                <div className="flex items-center justify-between py-2" style={{ borderBottom: `1px solid ${C.border}` }}>
                  <div className="text-sm" style={{ color: C.ink }}>Efectivo</div>
                  <span className="text-xs" style={{ color: C.inkDim }}>Fijo</span>
                </div>
                {paymentMethods.length === 0 && <p className="text-sm py-2" style={{ color: C.inkDim }}>Aún no has agregado métodos propios.</p>}
                {paymentMethods.map((m) => (
                  <div key={m.id} className="flex items-center justify-between py-2" style={{ borderBottom: `1px solid ${C.border}` }}>
                    <div>
                      <div className="text-sm" style={{ color: C.ink }}>{m.name}</div>
                      <div className="text-xs" style={{ color: m.isActive ? C.goldDark : C.inkDim }}>{m.isActive ? "Activo" : "Inactivo"}</div>
                    </div>
                    <button
                      onClick={() => togglePaymentMethodActive(m.id, !m.isActive)}
                      className="text-xs font-semibold px-2 py-1 rounded shrink-0"
                      style={{ background: m.isActive ? "#FFFFFF" : C.goldSoft, color: m.isActive ? C.danger : C.ink, border: `1px solid ${m.isActive ? C.danger : C.border}` }}
                    >
                      {m.isActive ? "Eliminar" : "Reactivar"}
                    </button>
                  </div>
                ))}
                <div className="flex items-center justify-between py-2">
                  <div className="text-sm" style={{ color: C.ink }}>Dividido</div>
                  <span className="text-xs" style={{ color: C.inkDim }}>Fijo</span>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}