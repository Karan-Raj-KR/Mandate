import { hashTypedData } from "viem";
import type { Hex } from "viem";
import { hashSignal } from "@worldcoin/idkit-core/hashing";
import { signRequest as signRpRequest } from "@worldcoin/idkit-core/signing";
import { requestTypedData, stripRequest } from "@mandate/core";
import type { ExecutionRequest, VerifierConfig } from "@mandate/core";

// Step 13 of SPEC section 6: above the approval threshold, a fresh World ID approval bound to THIS
// exact request. Bound means: the proof's signal is the EIP-712 digest of the request, which covers
// leafId, audience, action, amount, target, nonce and deadline. A proof made for any other request,
// or for a different amount or target, carries a different signal and is refused.
//
// References, read 2026-11-06:
//  - verify endpoint: https://docs.world.org/world-id/idkit/integrate.md  (POST /api/v4/verify/{rp_id},
//    forward the IDKit payload as-is, accept only success:true and the expected environment)
//  - hashSignal and signRequest come from the MIT licensed @worldcoin/idkit-core package. The docs do not
//    say how signal_hash is computed, so we use the SDK's own function instead of re-implementing it.

export type ApprovalMethod = "world-id" | "demo-bypass";
export type ApprovalVerdict = { ok: true; method: ApprovalMethod } | { ok: false; detail: string };
export type ApprovalVerifier = (proof: unknown, signal: Hex) => Promise<ApprovalVerdict>;

/** The value an approval must be bound to: the canonical EIP-712 digest of the signed request. */
export function approvalSignal(req: ExecutionRequest, cfg: Pick<VerifierConfig, "chainId" | "registry">): Hex {
  return hashTypedData(requestTypedData(stripRequest(req), cfg));
}

const deny = (detail: string): ApprovalVerdict => ({ ok: false, detail });
const MAX_PROOF_BYTES = 32 * 1024;

function sameHash(a: unknown, b: string): boolean {
  if (typeof a !== "string" || !/^0x[0-9a-fA-F]+$/.test(a)) return false;
  try {
    return BigInt(a) === BigInt(b);
  } catch {
    return false;
  }
}

export function createWorldVerifier(opts: {
  rpId: string;
  /** "production" for real World App proofs, "staging" for the simulator */
  environment: "production" | "staging";
  fetchImpl?: typeof fetch;
  baseUrl?: string;
  /** How many spent proof nonces to remember (oldest forgotten first). A forgotten proof is still bound to one
   *  request digest whose own nonce is single-use, so this only bounds memory. */
  maxTracked?: number;
}): ApprovalVerifier {
  const doFetch = opts.fetchImpl ?? fetch;
  const base = opts.baseUrl ?? "https://developer.world.org/api/v4/verify";
  // Each approval proof is usable once. Burned BEFORE the network call, so a failure still burns it (fail closed).
  const usedNonces = new Map<string, number>();
  const maxTracked = opts.maxTracked ?? 10_000;

  return async (proof, signal) => {
    try {
      if (!proof || typeof proof !== "object" || Array.isArray(proof)) return deny("a World ID proof is required");
      if (Buffer.byteLength(JSON.stringify(proof), "utf8") > MAX_PROOF_BYTES) return deny("proof is too large");
      const p = proof as { environment?: unknown; nonce?: unknown; responses?: unknown };

      // Never accept a staging (simulator) proof in production, or the reverse.
      if (p.environment !== opts.environment) return deny("proof environment does not match this service");

      if (!Array.isArray(p.responses) || p.responses.length === 0) return deny("proof has no responses");
      const expected = hashSignal(signal);
      for (const r of p.responses as { signal_hash?: unknown }[]) {
        if (!r || !sameHash(r.signal_hash, expected)) return deny("approval was not made for this exact request");
      }

      if (typeof p.nonce !== "string" || !p.nonce) return deny("proof has no nonce");
      if (usedNonces.has(p.nonce)) return deny("this approval was already used");
      usedNonces.set(p.nonce, Date.now());
      while (usedNonces.size > maxTracked) usedNonces.delete(usedNonces.keys().next().value as string);

      const res = await doFetch(`${base}/${encodeURIComponent(opts.rpId)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(proof),
        signal: AbortSignal.timeout(10_000),
      });
      if (res.status !== 200) return deny(`World ID verification failed (HTTP ${res.status})`);
      const body = (await res.json()) as { success?: unknown; environment?: unknown };
      if (body.success !== true) return deny("World ID did not verify the proof");
      if (body.environment !== opts.environment) return deny("World ID verified the proof in a different environment");
      return { ok: true, method: "world-id" };
    } catch (e) {
      // Any error means no approval. Never fall through to allow.
      return deny(`World ID verification could not complete: ${e instanceof Error ? e.name : "error"}`);
    }
  };
}

/** Signs the rp_context the browser needs to start an approval. The signing key never leaves the server. */
export function createRpContextSigner(opts: { signingKeyHex: string; action: string; rpId: string }) {
  return (): { rp_id: string; action: string; rp_context: { rp_id: string; nonce: string; created_at: number; expires_at: number; signature: string } } => {
    const s = signRpRequest({ signingKeyHex: opts.signingKeyHex, action: opts.action });
    return {
      rp_id: opts.rpId,
      action: opts.action,
      rp_context: { rp_id: opts.rpId, nonce: s.nonce, created_at: s.createdAt, expires_at: s.expiresAt, signature: s.sig },
    };
  };
}

/**
 * DEMO ONLY. Replaces World ID with an explicit bypass so the step-up flow can be shown without a verified human.
 * It is enabled only when the service is started with WORLD_DEMO_BYPASS=1, accepts exactly {"demoBypass": true},
 * and every use is logged loudly and stamped "demo-bypass" in the receipt and history. It only replaces step 13:
 * the chain, scope, revocation and replay checks still run, and a request outside scope is still denied.
 * Anything else is handed to the real verifier, or denied if there is none.
 */
export function withDemoBypass(inner?: ApprovalVerifier): ApprovalVerifier {
  return async (proof, signal) => {
    if (proof && typeof proof === "object" && !Array.isArray(proof) && (proof as { demoBypass?: unknown }).demoBypass === true) {
      console.warn("⚠ DEMO BYPASS: step-up approved WITHOUT World ID. Never enable WORLD_DEMO_BYPASS outside a demo.");
      return { ok: true, method: "demo-bypass" };
    }
    return inner ? inner(proof, signal) : { ok: false, detail: "a World ID proof is required" };
  };
}
