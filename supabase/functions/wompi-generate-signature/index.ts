// supabase/functions/wompi-generate-signature/index.ts
//
// Calcula la "firma de integridad" que exige Wompi para el widget cuando se
// envía un amountInCents real. Fórmula (documentada por Wompi):
//   SHA256(reference + amountInCents + currency + secreto_de_integridad)
//
// El secreto NUNCA sale de esta función: el frontend solo recibe el hash ya
// calculado, nunca el secreto en sí.

const INTEGRITY_SECRET = Deno.env.get("WOMPI_INTEGRITY_SECRET")!;

// Headers de CORS: sin esto, el navegador bloquea la respuesta antes de que
// tu código en React la pueda leer, aunque la función haya corrido bien.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*", // en producción puedes restringirlo a tu dominio exacto
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  // El navegador manda esta petición "de prueba" antes del POST real.
  // Si no la respondemos con los headers de CORS, el POST real nunca sale.
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { reference, amountInCents, currency } = await req.json();

    if (!reference || !amountInCents || !currency) {
      return new Response(JSON.stringify({ error: "Faltan parámetros (reference, amountInCents, currency)" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const signature = await sha256Hex(`${reference}${amountInCents}${currency}${INTEGRITY_SECRET}`);

    return new Response(JSON.stringify({ signature }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: "No se pudo generar la firma" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});