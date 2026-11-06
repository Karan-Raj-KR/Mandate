// LOCAL DEMO ONLY. Lets the dashboard buttons run the same scripts you would run in a terminal.
// It runs a fixed allowlist of commands (no user input reaches a command line) and is off in production builds,
// so a deployed dashboard can never spawn processes or sign anything.
import { execFile } from "node:child_process";
import { resolve } from "node:path";

export const dynamic = "force-dynamic";

const ENABLED = process.env.NODE_ENV !== "production";

// Run from the repo root so the scripts find .env. The dashboard is started from packages/dashboard.
const ROOT = resolve(process.cwd(), "../..");

const ACTIONS: Record<string, { label: string; file: string; args: string[] }> = {
  pay: { label: "Valid payment", file: "scripts/pay.ts", args: ["0.5", "supplierA"] },
  stepup: { label: "Large payment (needs approval)", file: "scripts/pay.ts", args: ["20", "supplierA"] },
  amplify: { label: "Rogue amplification", file: "scripts/attacks/amplify.ts", args: [] },
  replay: { label: "Replay", file: "scripts/attacks/replay.ts", args: [] },
  revoke: { label: "Revoke the root (on-chain)", file: "scripts/attacks/revoke-root.ts", args: [] },
  reset: { label: "Reset the demo", file: "scripts/fresh-chain.ts", args: [] },
};

// Next sets PORT for itself, and the scripts read PORT to find the payment service. Point them at the service instead.
function scriptEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  try {
    env.PORT = new URL(process.env.NEXT_PUBLIC_SERVICE_URL ?? "http://localhost:4000").port || "4000";
  } catch {
    env.PORT = "4000";
  }
  return env;
}

let busy = false;

export async function GET() {
  return Response.json({ enabled: ENABLED, actions: ENABLED ? Object.entries(ACTIONS).map(([k, v]) => ({ key: k, label: v.label })) : [] });
}

export async function POST(req: Request) {
  if (!ENABLED) return Response.json({ error: "running scenarios is disabled in production builds" }, { status: 404 });
  // Same-origin only: a page on another site must not be able to trigger an on-chain revoke.
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(req.url).host) return Response.json({ error: "cross-origin request refused" }, { status: 403 });

  let key = "";
  try {
    key = String(((await req.json()) as { action?: unknown }).action ?? "");
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  const action = Object.hasOwn(ACTIONS, key) ? ACTIONS[key] : undefined;
  if (!action) return Response.json({ error: "unknown action" }, { status: 400 });
  if (busy) return Response.json({ error: "another scenario is still running" }, { status: 409 });

  busy = true;
  try {
    const out = await new Promise<{ code: number; output: string }>((done) => {
      execFile(
        resolve(ROOT, "node_modules/.bin/tsx"),
        [action.file, ...action.args],
        { cwd: ROOT, timeout: 120_000, env: scriptEnv() },
        (err, stdout, stderr) => {
          const code = err ? (typeof err.code === "number" ? err.code : 1) : 0;
          done({ code, output: `${stdout}${stderr}`.trim().split("\n").slice(-12).join("\n") });
        },
      );
    });
    return Response.json({ action: key, ...out });
  } finally {
    busy = false;
  }
}
