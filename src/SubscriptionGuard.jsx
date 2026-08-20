import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import WompiMonthlyPayment from "./WompiMonthlyPayment";

// Acceso si: está exenta, o el trial sigue vigente, o el período pagado
// (current_period_end) todavía no vence — sin importar el "status" exacto ni
// el método con que se pagó (tarjeta, Nequi, PSE... el widget los maneja todos).
function hasAccess(sub) {
  if (!sub) return false;
  if (sub.status === "exempt") return true;
  if (sub.status === "trial" && sub.trial_ends_at && new Date(sub.trial_ends_at) > new Date()) return true;
  if (sub.current_period_end && new Date(sub.current_period_end) > new Date()) return true;
  return false;
}

export default function SubscriptionGuard({ session, children }) {
  const [sub, setSub] = useState(undefined); // undefined = cargando

  const loadSub = useCallback(() => {
    supabase.from("subscriptions").select("*").eq("user_id", session.user.id).single()
      .then(({ data }) => setSub(data || null));
  }, [session.user.id]);

  useEffect(() => { loadSub(); }, [loadSub]);

  if (sub === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-gray-500">
        Verificando suscripción…
      </div>
    );
  }

  if (!hasAccess(sub)) {
    return <PaywallScreen session={session} sub={sub} onSuccess={loadSub} />;
  }

  return children;
}

function PaywallScreen({ session, sub, onSuccess }) {
  const isRenewal = sub && sub.status !== "trial";

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">
          {isRenewal ? "Tu mensualidad venció" : "Activa tu suscripción"}
        </h2>
        <p className="text-sm text-gray-500 mb-5">
          {isRenewal
            ? "Paga tu mensualidad para volver a tener acceso a la caja."
            : "Tu prueba gratuita de 7 días terminó. Paga tu primera mensualidad para continuar."}
        </p>
        <WompiMonthlyPayment session={session} sub={sub} onSuccess={onSuccess} />
      </div>
    </div>
  );
}