import "./env.js";
import { privateKeyToAccount } from "viem/accounts";
import { loadVerifierConfig } from "@mandate/core";
import { createAgent } from "./agent.js";
import { NAMES, PORTS, requirePk } from "./env.js";

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
  const port = await agent.listen(PORTS[role]);
  console.log(`${rogue ? "rogue procure" : role} agent listening on :${port} as ${NAMES[role]}`);
}
