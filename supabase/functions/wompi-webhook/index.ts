// supabase/functions/wompi-webhook/index.ts
//
// Recibe las notificaciones de Wompi cuando una transacción cambia de estado.
// Verifica la firma (checksum) para confirmar que el evento sí viene de Wompi,
// y actualiza subscriptions.status / current_period_end según el resultado.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);
const EVENTS_SECRET = Deno.env.get("WOMPI_EVENTS_SECRET")!;

async function sha256Hex(text: string) {
  const data = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  const body = await req.json();
  const { data, signature, timestamp } = body;
  const tx = data.transaction;

  // 1) Verifica la firma: concatena los campos que indica Wompi + timestamp + tu secreto de eventos
  const concatenated = signature.properties
    .map((path: string) => path.split(".").reduce((obj: any, key: string) => obj[key], body))
    .join("") + timestamp + EVENTS_SECRET;
  const expected = await sha256Hex(concatenated);

  if (expected !== signature.checksum) {
    return new Response("Firma inválida", { status: 401 });
  }

  // 2) La referencia codifica a qué usuario pertenece (reference = `sub_${userId}_${timestamp}`)
  const userId = tx.reference.split("_")[1];
  if (!userId) return new Response("ok"); // no es un cobro de suscripción, ignóralo

  // 3) Actualiza según el resultado del cobro
  if (tx.status === "APPROVED") {
    await supabase.from("subscriptions").update({
      status: "active",
      current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("user_id", userId);
  } else if (["DECLINED", "ERROR", "VOIDED"].includes(tx.status)) {
    await supabase.from("subscriptions").update({
      status: "past_due",
      updated_at: new Date().toISOString(),
    }).eq("user_id", userId);
  }

  return new Response("ok");
});