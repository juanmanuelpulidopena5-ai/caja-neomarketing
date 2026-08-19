import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

const CURRENCY = "COP";
const VALIDATION_AMOUNT_CENTS = 150000; // $1.500 COP: mínimo permitido por Wompi

export default function WompiCardCapture({ session, onSuccess }) {
  const [scriptReady, setScriptReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (window.WidgetCheckout) { setScriptReady(true); return; }
    const script = document.createElement("script");
    script.src = "https://checkout.wompi.co/widget.js";
    script.onload = () => setScriptReady(true);
    script.onerror = () => setError("No se pudo cargar la pasarela de Wompi. Revisa tu conexión e intenta de nuevo.");
    document.body.appendChild(script);
  }, []);

  const openWidget = async () => {
    setError("");
    setLoading(true);
    try {
      const reference = `sub_${session.user.id}_${Date.now()}`;

      // La firma de integridad se calcula en el servidor (Edge Function),
      // nunca en el navegador, para no exponer el secreto de integridad.
      const { data, error: sigError } = await supabase.functions.invoke("wompi-generate-signature", {
        body: { reference, amountInCents: VALIDATION_AMOUNT_CENTS, currency: CURRENCY },
      });
      if (sigError || !data?.signature) {
        throw new Error("No se pudo preparar el pago (firma de integridad).");
      }

      const checkout = new window.WidgetCheckout({
        currency: CURRENCY,
        amountInCents: VALIDATION_AMOUNT_CENTS,
        reference,
        publicKey: import.meta.env.VITE_WOMPI_PUBLIC_KEY, // pub_test_xxx / pub_prod_xxx
        signature: { integrity: data.signature }, // Wompi lo documenta como "signature:integrity"
        redirectUrl: window.location.href,
        customerData: { email: session.user.email },
      });

      checkout.open(async (result) => {
        setLoading(false);
        const tx = result?.transaction;
        if (!tx) return; // el usuario cerró el widget sin completar el pago
        if (tx.status !== "APPROVED") {
          setError(`El pago no fue aprobado (${tx.status}). Intenta con otra tarjeta.`);
          return;
        }

        // El widget devuelve payment_source_id si el usuario guardó la tarjeta.
        // Nunca marcamos "status: active" desde el cliente: eso lo hace solo el
        // webhook cuando Wompi confirma server-to-server que el cobro fue aprobado.
        if (tx.payment_source_id) {
          await supabase.from("subscriptions").update({
            wompi_customer_email: session.user.email,
            wompi_payment_source_id: String(tx.payment_source_id),
          }).eq("user_id", session.user.id);
          onSuccess();
        } else {
          setError("El pago se aprobó pero no se guardó la tarjeta para cobros futuros. Vuelve a intentar y marca \"Guardar como método de pago\".");
        }
      });
    } catch (e) {
      console.error(e);
      setLoading(false);
      setError(e.message || "Ocurrió un error abriendo la pasarela. Intenta de nuevo.");
    }
  };

  return (
    <div>
      <button
        onClick={openWidget}
        disabled={!scriptReady || loading}
        className="w-full py-3 rounded-md bg-gray-900 text-white text-sm font-semibold disabled:opacity-50"
      >
        {loading ? "Abriendo pasarela…" : "Registrar método de pago"}
      </button>
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
    </div>
  );
}