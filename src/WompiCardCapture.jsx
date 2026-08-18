// WompiCardCapture.jsx
import { useEffect, useRef, useState } from "react";
import { supabase } from "./supabaseClient";

export default function WompiCardCapture({ session, onSuccess }) {
  const [scriptReady, setScriptReady] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (window.WidgetCheckout) { setScriptReady(true); return; }
    const script = document.createElement("script");
    script.src = "https://checkout.wompi.co/widget.js";
    script.onload = () => setScriptReady(true);
    document.body.appendChild(script);
  }, []);

  const openWidget = () => {
    setLoading(true);
    const reference = `sub_${session.user.id}_${Date.now()}`;

    const checkout = new window.WidgetCheckout({
      currency: "COP",
      amountInCents: 150000, // cobro mínimo de validación; el cobro mensual real lo hace el cron
      reference,
      publicKey: "pub_prod_4wvnJUuB32bQVFJo3O9N8fIyFxrEkzNy",   // ✅ con comillas
      redirectUrl: window.location.href,
      customerData: { email: session.user.email },
    });

    checkout.open(async (result) => {
      setLoading(false);
      const tx = result.transaction;
      if (!tx || tx.status !== "APPROVED") return; // el webhook confirma el resto igual

      // El widget devuelve payment_source_id si el usuario guardó la tarjeta
      if (tx.payment_source_id) {
        await supabase.from("subscriptions").update({
          wompi_customer_email: session.user.email,
          wompi_payment_source_id: String(tx.payment_source_id),
          status: "active",
          current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        }).eq("user_id", session.user.id);
        onSuccess();
      }
    });
  };

  return (
    <button
      onClick={openWidget}
      disabled={!scriptReady || loading}
      className="w-full py-3 rounded-md bg-gray-900 text-white text-sm font-semibold disabled:opacity-50"
    >
      {loading ? "Abriendo pasarela…" : "Registrar método de pago"}
    </button>
  );
}