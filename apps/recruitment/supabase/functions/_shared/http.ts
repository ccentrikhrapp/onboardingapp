// Shared helpers for edge functions: CORS, JSON responses in the app's
// { success, data } / { success, error } envelope, and auth-context resolution.

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

export function ok(data: unknown, status = 200): Response {
  return new Response(JSON.stringify({ success: true, data }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function fail(
  code: string,
  message: string,
  status = 400,
  fields: Record<string, string> = {},
): Response {
  return new Response(
    JSON.stringify({ success: false, error: { code, message, fields } }),
    {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
}

export function preflight(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  return null;
}

// Runs a task after the reply has been sent, so the person isn't kept waiting
// for slow work (sending an email, building a PDF). Errors are logged, never
// thrown. Outside the Supabase Edge runtime it simply waits for the task.
export async function afterResponse(task: Promise<unknown>): Promise<void> {
  const safe = task.then(() => undefined).catch((e) => console.error("afterResponse", String(e).slice(0, 300)));
  // @ts-ignore EdgeRuntime is provided by Supabase Edge Functions
  if (typeof EdgeRuntime !== "undefined") { EdgeRuntime.waitUntil(safe); return; }
  await safe;
}
