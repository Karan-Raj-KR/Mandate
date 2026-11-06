import express from "express";
import type { Express, Request, Response } from "express";
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

    const verdict = await deps.verifyLocal(chain, request, deps.cfg, now);
    if (!verdict.ok) {
      log("✗", verdict.code, verdict.detail);
      res.status(403).json(toWire(verdict));
      return;
    }
    log("✓", "LOCAL_VERIFY", "chain and request verified");

    if (request.amount > deps.cfg.stepUpThreshold) {
      log("✗", "STEP_UP_REQUIRED", `amount ${request.amount} exceeds step-up threshold`);
      res.status(403).json({
        ok: false,
        code: "STEP_UP_REQUIRED",
        detail: "amount requires fresh World ID approval",
      });
      return;
    }
    log("✓", "STEP_UP", "below step-up threshold");

    // Synchronous check-and-consume: no await separates the check from the
    // write, so two concurrent requests with the same nonce can't both pass.
    // From here on, a failure leaves the nonce burned — fail closed.
    if (!deps.nonceStore.checkAndConsume(request.nonce)) {
      log("✗", "REPLAY", `nonce ${request.nonce} already used`);
      res.status(403).json({ ok: false, code: "REPLAY", detail: "nonce already used" });
      return;
    }
    log("✓", "NONCE", "nonce consumed");

    const revocation = await deps.checkRevocation(chain, deps.cfg, deps.reader, now);
    if (!revocation.ok) {
      log("✗", revocation.code, revocation.detail);
      res.status(403).json(toWire(revocation));
      return;
    }
    log("✓", "REVOCATION", "no revoked delegation in chain");

    const targetAddress = deps.resolveTarget(request.target);
    if (!targetAddress) {
      log("✗", "SCHEMA", `unknown target ${request.target}`);
      res.status(400).json({ ok: false, code: "SCHEMA", detail: `unknown target ${request.target}` });
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
          chainIds: chain.map((d) => d.id),
          ...(deps.simulated ? { simulated: true } : {}),
        }),
      );
    } catch (err) {
      const detail = err instanceof Error ? err.message : "transfer failed";
      log("✗", "EXECUTION_FAILED", detail);
      res.status(502).json({ ok: false, code: "EXECUTION_FAILED", detail });
    }
  });

  app.get("/balance", async (_req: Request, res: Response) => {
    const balance = await deps.getBalance();
    res.status(200).json({ balance: balance.toString(), ...(deps.simulated ? { simulated: true } : {}) });
  });

  return app;
}
