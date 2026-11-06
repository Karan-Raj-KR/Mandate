import { randomBytes } from "node:crypto";
import type { Hex } from "viem";
import { toWire } from "@mandate/core";
import type { Delegation, ExecutionRequest, Verdict } from "@mandate/core";

// Read-only history of decisions for the dashboard (GET /requests). It is display only:
// nothing here feeds back into an authorization decision, and it is written AFTER the
// response has been sent, so it can never slow down or change enforcement.

type Scenario = "legit" | "amplify" | "replay" | "revoke" | "stepup";

const ATTEMPTED: Record<Scenario, string> = {
  legit: "Settlement pays a supplier within its permit",
  amplify: "A delegation in the chain grants more than its parent held",
  replay: "A request is sent again with a nonce that was already used",
  revoke: "A delegation in the chain was revoked on Ethereum",
  stepup: "A payment above the World ID threshold",
};

function scenarioOf(v: Verdict): Scenario {
  if (v.ok) return "legit";
  switch (v.code) {
    case "AMPLIFICATION": return "amplify";
    case "REPLAY": return "replay";
    case "REVOKED": return "revoke";
    case "STEP_UP_REQUIRED": return "stepup";
    default: return "legit";
  }
}

export type RunInput = {
  chain: Delegation[];
  request: ExecutionRequest;
  verdict: Verdict;
  txHash?: Hex;
  now: number;
  /** Per-hop revocation status for display. Best effort: a failure shows hops as not revoked,
   *  which is harmless because the decision itself was already made by checkRevocation. */
  statusOf?: (chain: Delegation[]) => Promise<boolean[]>;
};

export type RunStore = {
  add(input: RunInput): Promise<void>;
  /** newest first, bigints as decimal strings */
  list(): unknown[];
};

export function createRunStore(max = 50): RunStore {
  const runs: Record<string, unknown>[] = [];
  return {
    async add({ chain, request, verdict, txHash, now, statusOf }) {
      let revoked = chain.map(() => false);
      try {
        if (statusOf) revoked = await statusOf(chain);
      } catch {
        /* display only */
      }
      const scenario = scenarioOf(verdict);
      runs.unshift({
        id: `0x${randomBytes(32).toString("hex")}`,
        at: now,
        scenario,
        mock: false,
        attempted: ATTEMPTED[scenario],
        invoice: "",
        agentOutput: {
          label: "Scripted fixture",
          text: `${request.action} ${request.amount} -> ${request.target}`,
        },
        chain,
        revoked,
        request,
        verdict,
        ...(txHash ? { txHash } : {}),
        stepUp: { required: !verdict.ok && verdict.code === "STEP_UP_REQUIRED" },
      });
      if (runs.length > max) runs.length = max;
    },
    list: () => runs.map((r) => toWire(r)),
  };
}
