// WompiCardCapture.jsx
import { useEffect, useRef, useState } from "react";
import { supabase } from "./supabaseClient";

// Función para generar la firma de seguridad requerida por Wompi
async function generateSignature(reference, amountInCents, currency, integritySecret) {
  const concatenatedString = `${reference}${amountInCents}${currency}${integritySecret}`;
  const enocder = new TextEncoder();
  const data = enocder.encode(concatenatedString);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  return hashHex;
}

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

  // 1. AQUÍ EL CAMBIO: Agregamos "async" antes de los paréntesis
  const openWidget = async () => {
    setLoading(true);
    const reference = `sub_${session.user.id}_${Date.now()}`;
    
    // 2. AQUÍ EL CAMBIO: Extraemos el valor y la moneda en variables
    const amountInCents = 150000; 
    const currency = "COP";
    // Tu código secreto que pusiste en el archivo .env
    const integritySecret = import.meta.env.VITE_WOMPI_INTEGRITY_SECRET; 

    // 3. AQUÍ EL CAMBIO: Llamamos a la función para encriptar la firma
    const signature = await generateSignature(reference, amountInCents, currency, integritySecret);

    const checkout = new window.WidgetCheckout({
      currency: currency,
      amountInCents: amountInCents, 
      reference: reference,
      publicKey: "pub_prod_4wvnJUuB32bQVFJo3O9N8fIyFxrEkzNy",   // Se queda tu llave
      signature: signature, // 4. AQUÍ EL CAMBIO: Enviamos la firma a Wompi
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