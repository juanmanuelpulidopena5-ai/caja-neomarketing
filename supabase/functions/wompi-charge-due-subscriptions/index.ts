// supabase/functions/wompi-charge-due-subscriptions/index.ts  (ejecutado por un cron)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const WOMPI_PRIVATE_KEY = Deno.env.get("WOMPI_PRIVATE_KEY")!; // priv_prod_xxx / priv_test_xxx

Deno.serve(async () => {
  const { data: due } = await supabase
    .from("subscriptions")
    .select("*")
    .in("status", ["active", "trial"])
    .lte("current_period_end", new Date().toISOString())
    .not("wompi_payment_source_id", "is", null);

  for (const sub of due || []) {
    const reference = `sub_${sub.user_id}_${Date.now()}`;
    const res = await fetch("https://production.wompi.co/v1/transactions", {
      method: "POST",
      headers: { Authorization: `Bearer ${WOMPI_PRIVATE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        amount_in_cents: sub.plan_amount_cents,
        currency: "COP",
        customer_email: sub.wompi_customer_email,
        payment_source_id: Number(sub.wompi_payment_source_id),
        reference,
      }),
    });
    const json = await res.json();
    // El resultado real (APPROVED/DECLINED) llega por el webhook de arriba, no por esta respuesta.
    await supabase.from("subscriptions").update({
      last_transaction_id: json.data?.id,
      last_transaction_status: json.data?.status, // normalmente llega "PENDING" aquí
      last_charge_attempt_at: new Date().toISOString(),
    }).eq("user_id", sub.user_id);
  }
  return new Response("ok");
});