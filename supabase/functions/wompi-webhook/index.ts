// supabase/functions/wompi-webhook/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto } from "https://deno.land/std@0.177.0/crypto/mod.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")! // salta RLS, solo la usa esta función
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

  // 1) Verifica la firma: concatena los campos que indica Wompi + timestamp + tu secreto
  const concatenated = signature.properties
    .map((path: string) => path.split(".").reduce((obj: any, key: string) => obj[key], body))
    .join("") + timestamp + EVENTS_SECRET;
  const expected = await sha256Hex(concatenated);

  if (expected !== signature.checksum) {
    return new Response("Firma inválida", { status: 401 });
  }

  // 2) La referencia de la transacción codifica a qué usuario pertenece
  //    (la generas tú al cobrar: reference = `sub_${userId}_${Date.now()}`)
  const userId = tx.reference.split("_")[1];
  if (!userId) return new Response("ok"); // no es un cobro de suscripción, ignóralo

  // 3) Actualiza según el resultado del cobro
  if (tx.status === "APPROVED") {
    await supabase.from("subscriptions").update({
      status: "active",
      current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      last_transaction_id: tx.id,
      last_transaction_status: tx.status,
      last_charge_attempt_at: new Date().toISOString(),
      failed_attempts: 0,
      updated_at: new Date().toISOString(),
    }).eq("user_id", userId);
  } else if (["DECLINED", "ERROR", "VOIDED"].includes(tx.status)) {
    // 🔒 Aquí es donde se corta el servicio
    const { data: sub } = await supabase.from("subscriptions").select("failed_attempts").eq("user_id", userId).single();
    await supabase.from("subscriptions").update({
      status: "past_due",
      last_transaction_id: tx.id,
      last_transaction_status: tx.status,
      last_charge_attempt_at: new Date().toISOString(),
      failed_attempts: (sub?.failed_attempts || 0) + 1,
      updated_at: new Date().toISOString(),
    }).eq("user_id", userId);
  }

  return new Response("ok");
});