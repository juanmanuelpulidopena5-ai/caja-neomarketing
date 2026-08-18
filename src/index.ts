// supabase/functions/wompi-generate-signature/index.ts
//
// Calcula la "firma de integridad" que exige Wompi para el widget cuando se
// envía un amountInCents real. Fórmula (documentada por Wompi):
//   SHA256(reference + amountInCents + currency + secreto_de_integridad)
//
// El secreto NUNCA sale de esta función: el frontend solo recibe el hash ya
// calculado, nunca el secreto en sí.

const INTEGRITY_SECRET = Deno.env.get("WOMPI_INTEGRITY_SECRET")!;

async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  try {
    const { reference, amountInCents, currency } = await req.json();

    if (!reference || !amountInCents || !currency) {
      return new Response(JSON.stringify({ error: "Faltan parámetros (reference, amountInCents, currency)" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const signature = await sha256Hex(`${reference}${amountInCents}${currency}${INTEGRITY_SECRET}`);

    return new Response(JSON.stringify({ signature }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: "No se pudo generar la firma" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});