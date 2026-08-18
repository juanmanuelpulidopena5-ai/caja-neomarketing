import { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";
import WompiCardCapture from "./WompiCardCapture";

// "exempt" = cuentas internas/de prueba a las que decides no cobrarles nunca.
const HAS_ACCESS = ["trial", "active", "exempt"];

export default function SubscriptionGuard({ session, children }) {
  const [sub, setSub] = useState(undefined); // undefined = cargando

  const loadSub = () => {
    supabase.from("subscriptions").select("*").eq("user_id", session.user.id).single()
      .then(({ data }) => setSub(data || null));
  };

  useEffect(() => { loadSub(); }, [session.user.id]);

  if (sub === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-gray-500">
        Verificando suscripción…
      </div>
    );
  }

  const trialExpired = sub?.status === "trial" && new Date(sub.trial_ends_at) < new Date();
  const blocked = !sub || !HAS_ACCESS.includes(sub.status) || trialExpired;

  if (blocked) {
    return <PaywallScreen session={session} sub={sub} onSuccess={loadSub} />;
  }

  return children;
}

function PaywallScreen({ session, sub, onSuccess }) {
  const isPastDue = sub?.status === "past_due";

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">
          {isPastDue ? "Tu pago no pudo procesarse" : "Activa tu suscripción"}
        </h2>
        <p className="text-sm text-gray-500 mb-5">
          {isPastDue
            ? "Actualiza tu método de pago para reactivar el acceso a la caja."
            : "Registra una tarjeta para empezar (o continuar) tu prueba gratuita de 7 días."}
        </p>
        <WompiCardCapture session={session} onSuccess={onSuccess} />
      </div>
    </div>
  );
}