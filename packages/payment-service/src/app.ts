import express from "express";
import type { Express, Request, Response } from "express";
import type { Hex } from "viem";
import {
  MAX_PAYLOAD_BYTES,
  parseChain,
  parseRequest,
  toWire,
} from "@mandate/core";
import type {
  Delegation,
  ExecutionRequest,
  RegistryReader,
  Verdict,
  VerifierConfig,
} from "@mandate/core";
import { requestDisplayDigest } from "./digest.js";
import type { NonceStore } from "./nonces.js";
import type { RunStore } from "./requests.js";
import { approvalSignal } from "./worldid.js";
import type { ApprovalMethod, ApprovalVerifier } from "./worldid.js";
import type { TargetResolver } from "./targets.js";
import type { Transfer } from "./transfer.js";

export type VerifyLocalFn = (
  chain: Delegation[],
  req: ExecutionRequest,
  cfg: VerifierConfig,
  now: number,
) => Promise<Verdict>;

export type CheckRevocationFn = (
  chain: Delegation[],
  cfg: VerifierConfig,
  reader: RegistryReader,
  now: number,
) => Promise<Verdict>;

export type AppDeps = {
  cfg: VerifierConfig;
  verifyLocal: VerifyLocalFn;
  checkRevocation: CheckRevocationFn;
  reader: RegistryReader;
  transfer: Transfer;
  getBalance: () => Promise<bigint>;
  resolveTarget: TargetResolver;
  nonceStore: NonceStore;
  simulated: boolean;
  now?: () => number;
  /** Dashboard history. Optional and display only; never read by an authorization decision. */
  runs?: RunStore;
  /** Step 13. Absent means no approval can ever be accepted, so every request above the threshold is denied. */
  approvalVerifier?: ApprovalVerifier;
  /** Signs the rp_context for a browser approval. Absent means the approval endpoint is disabled. */
  worldContext?: () => unknown;
  /** Reported to the dashboard so it knows whether to offer the demo bypass button. */
  demoBypass?: boolean;
  statusOf?: (chain: Delegation[]) => Promise<boolean[]>;
  dashboardOrigin?: string;
};

function log(mark: "✓" | "✗", code: string, detail: string): void {
  console.log(`${mark} ${code} ${detail}`);
}

export function createApp(deps: AppDeps): Express {
  const app = express();
  app.use(express.json({ limit: `${MAX_PAYLOAD_BYTES}b` }));

  app.post("/execute", async (req: Request, res: Response) => {
    const now = (deps.now ?? (() => Math.floor(Date.now() / 1000)))();

    let chain: Delegation[];
    let request: ExecutionRequest;
    try {
      chain = parseChain(req.body?.chain);
      request = parseRequest(req.body?.request);
    } catch (err) {
      const detail = err instanceof Error ? err.message : "invalid payload";
      log("✗", "SCHEMA", detail);
      res.status(400).json({ ok: false, code: "SCHEMA", detail });
      return;
    }
    log("✓", "SCHEMA", "chain and request parsed");

    // Recorded after the response is sent; a failure here must never affect the response.
    let approval: ApprovalMethod | undefined;
    const record = (verdict: Verdict, txHash?: Hex): void => {
      if (!deps.runs) return;
      deps.runs.add({ chain, request, verdict, txHash, now, statusOf: deps.statusOf, approval }).catch(() => {});
    };

    const verdict = await deps.verifyLocal(chain, request, deps.cfg, now);
    if (!verdict.ok) {
      log("✗", verdict.code, verdict.detail);
      res.status(403).json(toWire(verdict));
      record(verdict);
      return;
    }
    log("✓", "LOCAL_VERIFY", "chain and request verified");

    if (request.amount > deps.cfg.stepUpThreshold) {
      // Step 13: needs a World ID approval bound to this exact request. Approval never widens scope:
      // verifyLocal has already confirmed the request is inside the final delegation's scope.
      const proof = req.body?.worldProof;
      let detail = "amount requires fresh World ID approval";
      if (proof !== undefined && deps.approvalVerifier) {
        const approved = await deps.approvalVerifier(proof, approvalSignal(request, deps.cfg));
        if (approved.ok) {
          approval = approved.method;
          log("✓", "STEP_UP", approved.method === "demo-bypass" ? "DEMO BYPASS (no World ID)" : "World ID approval bound to this request");
          detail = "";
        } else {
          detail = approved.detail;
        }
      }
      if (detail) {
        log("✗", "STEP_UP_REQUIRED", `amount ${request.amount} exceeds step-up threshold: ${detail}`);
        res.status(403).json({ ok: false, code: "STEP_UP_REQUIRED", detail });
        record({ ok: false, code: "STEP_UP_REQUIRED", detail });
        return;
      }
    } else {
      log("✓", "STEP_UP", "below step-up threshold");
    }

    // Synchronous check-and-consume: no await separates the check from the
    // write, so two concurrent requests with the same nonce can't both pass.
    // From here on, a failure leaves the nonce burned — fail closed.
    if (!deps.nonceStore.checkAndConsume(request.nonce)) {
      log("✗", "REPLAY", `nonce ${request.nonce} already used`);
      res.status(403).json({ ok: false, code: "REPLAY", detail: "nonce already used" });
      record({ ok: false, code: "REPLAY", detail: "nonce already used" });
      return;
    }
    log("✓", "NONCE", "nonce consumed");

    const revocation = await deps.checkRevocation(chain, deps.cfg, deps.reader, now);
    if (!revocation.ok) {
      log("✗", revocation.code, revocation.detail);
      res.status(403).json(toWire(revocation));
      record(revocation);
      return;
    }
    log("✓", "REVOCATION", "no revoked delegation in chain");

    const targetAddress = deps.resolveTarget(request.target);
    if (!targetAddress) {
      log("✗", "SCHEMA", `unknown target ${request.target}`);
      res.status(400).json({ ok: false, code: "SCHEMA", detail: `unknown target ${request.target}` });
      record({ ok: false, code: "SCHEMA", detail: `unknown target ${request.target}` });
      return;
    }

    try {
      const txHash = await deps.transfer(targetAddress, request.amount);
      log("✓", "EXECUTE", `paid ${request.amount} to ${request.target} (tx ${txHash})`);
      res.status(200).json(
        toWire({
          ok: true,
          txHash,
          amount: request.amount,
          target: request.target,
          requestDigest: requestDisplayDigest(request),
          ...(approval ? { approval } : {}),
          chainIds: chain.map((d) => d.id),
          ...(deps.simulated ? { simulated: true } : {}),
        }),
      );
      record({ ok: true }, txHash);
    } catch (err) {
      const detail = err instanceof Error ? err.message : "transfer failed";
      log("✗", "EXECUTION_FAILED", detail);
      res.status(502).json({ ok: false, code: "EXECUTION_FAILED", detail });
      record({ ok: false, code: "EXECUTION_FAILED", detail });
    }
  });

  // Read-only decision history for the dashboard. Public data: signed delegations and verdicts, no secrets.
  app.get("/requests", (_req: Request, res: Response) => {
    res.setHeader("access-control-allow-origin", deps.dashboardOrigin ?? "http://localhost:3000");
    res.setHeader("vary", "origin");
    res.status(200).json(deps.runs ? deps.runs.list() : []);
  });

  // Lets the dashboard know whether the demo bypass is on. Read only.
  app.get("/world/config", (_req: Request, res: Response) => {
    res.setHeader("access-control-allow-origin", deps.dashboardOrigin ?? "http://localhost:3000");
    res.status(200).json({ bypass: deps.demoBypass === true, worldId: deps.worldContext !== undefined });
  });

  // Starts a browser approval: returns the signal the proof must be bound to, plus the signed rp_context.
  app.post("/world/context", (req: Request, res: Response) => {
    res.setHeader("access-control-allow-origin", deps.dashboardOrigin ?? "http://localhost:3000");
    if (!deps.worldContext) {
      res.status(503).json({ ok: false, detail: "World ID approval is not configured" });
      return;
    }
    try {
      const request = parseRequest(req.body?.request);
      res.status(200).json({ signal: approvalSignal(request, deps.cfg), ...(deps.worldContext() as object) });
    } catch (err) {
      res.status(400).json({ ok: false, detail: err instanceof Error ? err.message : "invalid request" });
    }
  });

  app.get("/balance", async (_req: Request, res: Response) => {
    const balance = await deps.getBalance();
    res.status(200).json({ balance: balance.toString(), ...(deps.simulated ? { simulated: true } : {}) });
  });

  return app;
}
