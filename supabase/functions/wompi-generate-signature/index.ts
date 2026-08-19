// supabase/functions/wompi-generate-signature/index.ts
//
// Calcula la "firma de integridad" que exige Wompi para el widget cuando se
// envía un amountInCents real. Fórmula (documentada por Wompi):
//   SHA256(reference + amountInCents + currency + secreto_de_integridad)
//
// El secreto NUNCA sale de esta función: el frontend solo recibe el hash ya
// calculado, nunca el secreto en sí.

const INTEGRITY_SECRET = Deno.env.get("WOMPI_INTEGRITY_SECRET")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
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
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { reference, amountInCents, currency, debug } = await req.json();

    if (!reference || !amountInCents || !currency) {
      return new Response(JSON.stringify({ error: "Faltan parámetros (reference, amountInCents, currency)" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const preimage = `${reference}${amountInCents}${currency}`; // sin el secreto: esto NO es sensible
    const signature = await sha256Hex(preimage + INTEGRITY_SECRET);

    const payload: Record<string, unknown> = { signature };
    if (debug) {
      // Solo para depurar manualmente: te dice EXACTAMENTE qué texto se concatenó
      // (sin el secreto) y cuántos caracteres tiene el secreto que está usando la
      // función ahora mismo, para comparar contra lo que copiaste de Wompi.
      payload.debug = {
        preimage,
        secretLength: INTEGRITY_SECRET?.length || 0,
        secretPreview: INTEGRITY_SECRET ? `${INTEGRITY_SECRET.slice(0, 4)}…${INTEGRITY_SECRET.slice(-4)}` : null,
      };
    }

    return new Response(JSON.stringify(payload), {
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