import { useEffect, useRef, useState } from "react";
import { supabase } from "./supabaseClient";

const PUBLIC_KEY = import.meta.env.VITE_WOMPI_PUBLIC_KEY;
const CURRENCY = "COP";
const CHECK_INTERVAL_MS = 4000;
const CHECK_TIMEOUT_MS = 90000; // 90s esperando la confirmación del webhook

export default function WompiMonthlyPayment({ session, sub, onSuccess }) {
  const [scriptReady, setScriptReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const pollRef = useRef(null);

  useEffect(() => {
    if (window.WidgetCheckout) { setScriptReady(true); return; }
    const script = document.createElement("script");
    script.src = "https://checkout.wompi.co/widget.js";
    script.onload = () => setScriptReady(true);
    script.onerror = () => setError("No se pudo cargar la pasarela de Wompi. Revisa tu conexión.");
    document.body.appendChild(script);
    return () => clearTimeout(pollRef.current);
  }, []);

  const amountInCents = sub?.plan_amount_cents || 5000000; // fallback: $50.000 COP

  // No confiamos en la respuesta del widget para desbloquear: esperamos a que
  // el webhook confirme server-to-server y actualice current_period_end.
  const pollForConfirmation = (startedAt) => {
    if (Date.now() - startedAt > CHECK_TIMEOUT_MS) {
      setConfirming(false);
      setError("Wompi está tardando en confirmar el pago. Si ya pagaste, espera un momento y recarga la página.");
      return;
    }
    pollRef.current = setTimeout(async () => {
      const { data } = await supabase
        .from("subscriptions")
        .select("current_period_end")
        .eq("user_id", session.user.id)
        .single();

      if (data?.current_period_end && new Date(data.current_period_end) > new Date()) {
        setConfirming(false);
        onSuccess();
      } else {
        pollForConfirmation(startedAt);
      }
    }, CHECK_INTERVAL_MS);
  };

  const pay = async () => {
    setError("");
    setLoading(true);
    try {
      const reference = `sub_${session.user.id}_${Date.now()}`;

      const { data, error: sigError } = await supabase.functions.invoke("wompi-generate-signature", {
        body: { reference, amountInCents, currency: CURRENCY },
      });
      if (sigError || !data?.signature) throw new Error("No se pudo preparar el pago.");

      const checkout = new window.WidgetCheckout({
        currency: CURRENCY,
        amountInCents,
        reference,
        publicKey: PUBLIC_KEY,
        signature: { integrity: data.signature },
        redirectUrl: window.location.href,
        customerData: { email: session.user.email },
      });

      checkout.open((result) => {
        setLoading(false);
        const tx = result?.transaction;
        if (!tx) return; // cerró el widget sin completar el pago
        if (tx.status === "DECLINED" || tx.status === "ERROR") {
          setError("El pago no fue aprobado. Intenta con otro método o tarjeta.");
          return;
        }
        setConfirming(true);
        pollForConfirmation(Date.now());
      });
    } catch (err) {
      setLoading(false);
      setError(err.message || "Ocurrió un error abriendo la pasarela.");
    }
  };

  if (confirming) {
    return (
      <div className="text-center py-4">
        <p className="text-sm text-gray-700 font-medium mb-1">Confirmando tu pago…</p>
        <p className="text-xs text-gray-500">Esto puede tardar unos segundos, no cierres esta ventana.</p>
      </div>
    );
  }

  const amountLabel = (amountInCents / 100).toLocaleString("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  });

  return (
    <div>
      <button
        onClick={pay}
        disabled={!scriptReady || loading}
        className="w-full py-3 rounded-md bg-gray-900 text-white text-sm font-semibold disabled:opacity-50"
      >
        {loading ? "Abriendo pasarela…" : `Pagar ${amountLabel}`}
      </button>
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
    </div>
  );
}