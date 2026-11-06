// DEMO ONLY. Same-origin proxy for the "bypass World ID" button, so the browser needs no CORS change on the service.
// The service decides: it accepts the bypass only if it was started with WORLD_DEMO_BYPASS=1, and even then
// only in place of the World ID step. Chain, scope, revocation and replay checks still apply.
export const dynamic = "force-dynamic";

const SERVICE = process.env.NEXT_PUBLIC_SERVICE_URL ?? "";
// In a production build this proxy is off unless explicitly allowed, so a deployed dashboard cannot become a bypass.
const ENABLED = process.env.NODE_ENV !== "production" || process.env.ALLOW_DEMO_BYPASS_UI === "1";

/** Is the bypass switched on at the service? The button is hidden unless this says yes. */
export async function GET() {
  if (!SERVICE || !ENABLED) return Response.json({ bypass: false });
  try {
    const r = await fetch(`${SERVICE}/world/config`, { cache: "no-store" });
    const j = (await r.json()) as { bypass?: unknown };
    return Response.json({ bypass: j.bypass === true });
  } catch {
    return Response.json({ bypass: false });
  }
}

/** Re-sends an already signed request, unchanged, with the bypass flag. Nothing is re-signed or altered. */
export async function POST(req: Request) {
  if (!ENABLED) return Response.json({ error: "the demo bypass is disabled in production builds" }, { status: 404 });
  if (!SERVICE) return Response.json({ error: "no payment service configured" }, { status: 503 });
  let body: { chain?: unknown; request?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  if (!Array.isArray(body.chain) || !body.request || typeof body.request !== "object") {
    return Response.json({ error: "chain and request are required" }, { status: 400 });
  }
  try {
    const r = await fetch(`${SERVICE}/execute`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chain: body.chain, request: body.request, worldProof: { demoBypass: true } }),
    });
    return Response.json({ status: r.status, body: await r.json() });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "could not reach the payment service" }, { status: 502 });
  }
}
