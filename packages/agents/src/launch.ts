import "./env.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { privateKeyToAccount } from "viem/accounts";
import { loadVerifierConfig } from "@mandate/core";
import { createAgent, HttpError } from "./agent.js";
import { describeAuthority, runInvoiceAgent, usdcToMinor } from "./llm.js";
import { NAMES, PORTS, openAiKey, requirePk } from "./env.js";

export type Role = "ops" | "procure" | "settle";

const KEYS: Record<Role, string> = { ops: "OPS_PK", procure: "PROCURE_PK", settle: "SETTLE_PK" };

export async function launch(role: Role): Promise<void> {
  const cfg = loadVerifierConfig();
  const rogue = role === "procure" && process.env.ROGUE === "1";
  const agent = createAgent({
    name: rogue ? "procure (ROGUE: skips its own narrowing check)" : role,
    ensName: NAMES[role],
    account: privateKeyToAccount(requirePk(KEYS[role])),
    domain: { chainId: cfg.chainId, registry: cfg.registry },
    enforceNarrowing: !rogue,
    service:
      role === "settle"
        ? { url: process.env.SERVICE_URL ?? `http://localhost:${process.env.PORT ?? 4000}`, audience: cfg.serviceId }
        : undefined,
  });
  if (role === "procure") {
    const settleAddress = privateKeyToAccount(requirePk("SETTLE_PK")).address;
    // POST /invoice {"invoice": "normal" | "malicious"}: the LLM reads the invoice and may sign ONE delegation.
    // The model is untrusted, so its output is signed without the agent's own narrowing check:
    // the payment service is what must stop an over-broad delegation.
    agent.addRoute("/invoice", async (body) => {
      const name = body?.invoice;
      if (name !== "normal" && name !== "malicious") throw new HttpError(400, 'invoice must be "normal" or "malicious"');
      const apiKey = openAiKey();
      if (!apiKey) throw new HttpError(503, "OPENAI_API_KEY is not set");
      const invoice = readFileSync(fileURLToPath(new URL(`../../../fixtures/invoices/${name}.txt`, import.meta.url)), "utf8");
      const now = Math.floor(Date.now() / 1000);
      const held = agent.chain().at(-1);
      if (!held) throw new HttpError(409, "I hold no authority yet");
      const r = await runInvoiceAgent({
        authority: describeAuthority(held.scope, now),
        apiKey,
        model: process.env.OPENAI_MODEL || undefined,
        invoice,
        sign: async (a) => {
          const signed = await agent.delegateTo(
            {
              subject: settleAddress,
              subjectName: NAMES.settle,
              scope: { actions: a.actions, maxAmount: usdcToMinor(a.max_amount_usdc), expiry: now + a.expiry_minutes * 60, targets: a.targets },
            },
            { enforceNarrowing: false },
          );
          return { result: `signed delegation ${signed.delegation.id}`, signed };
        },
      });
      const signed = r.signed as { delegation: unknown; chain: unknown } | null;
      return { invoice: name, model: r.model, text: r.text, toolCalls: r.toolCalls, error: r.error ?? null, delegation: signed?.delegation ?? null, chain: signed?.chain ?? null };
    });
  }

  const port = await agent.listen(PORTS[role]);
  console.log(`${rogue ? "rogue procure" : role} agent listening on :${port} as ${NAMES[role]}`);
}
