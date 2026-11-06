import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { isAddress, isAddressEqual } from "viem";
import type { Address, LocalAccount } from "viem";
import {
  ACTIONS,
  MAX_PAYLOAD_BYTES,
  narrows,
  parseChain,
  parseDelegation,
  randomNonce,
  signDelegation,
  signRequest,
  toWire,
} from "@mandate/core";
import type { Action, Delegation, Scope, UnsignedDelegation } from "@mandate/core";

export type AgentOptions = {
  name: string;
  ensName: string;
  account: LocalAccount;
  /** EIP-712 domain parts, from config and never from a token */
  domain: { chainId: number; registry: Address };
  /** An honest agent refuses to sign a delegation that widens its own authority.
   *  A compromised or prompt-injected one does not. This is NOT a security control:
   *  the payment service re-checks every edge. */
  enforceNarrowing: boolean;
  /** Settlement only: where /pay sends the signed request */
  service?: { url: string; audience: string };
};

class HttpError extends Error {
  constructor(public status: number, message: string, public extra: Record<string, unknown> = {}) {
    super(message);
  }
}

async function readJson(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_PAYLOAD_BYTES) throw new HttpError(413, "payload too large");
    chunks.push(chunk as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "invalid json");
  }
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(toWire(body)));
}

const dedupeSorted = <T extends string>(xs: T[]): T[] => [...new Set(xs)].sort();

function parseScopeInput(x: any): Scope {
  if (!x || typeof x !== "object") throw new HttpError(400, "scope is required");
  if (!Array.isArray(x.actions) || !x.actions.every((a: unknown) => ACTIONS.includes(a as Action))) {
    throw new HttpError(400, `actions must be a list drawn from ${ACTIONS.join(", ")}`);
  }
  if (typeof x.maxAmount !== "string" || !/^\d+$/.test(x.maxAmount)) {
    throw new HttpError(400, "maxAmount must be a decimal string");
  }
  if (!Number.isInteger(x.expiry) || x.expiry < 0) throw new HttpError(400, "expiry must be unix seconds");
  if (!Array.isArray(x.targets) || x.targets.length === 0 || !x.targets.every((t: unknown) => typeof t === "string" && t)) {
    throw new HttpError(400, "targets must be a non-empty list of strings");
  }
  return {
    actions: dedupeSorted<Action>(x.actions),
    maxAmount: BigInt(x.maxAmount),
    expiry: x.expiry,
    targets: x.targets.includes("*") ? ["*"] : dedupeSorted<string>(x.targets),
  };
}

export type Agent = {
  server: Server;
  chain: () => Delegation[];
  listen: (port: number) => Promise<number>;
  close: () => Promise<void>;
};

export function createAgent(opts: AgentOptions): Agent {
  let chain: Delegation[] = [];
  const me = opts.account.address;

  async function accept(body: any) {
    const incoming = parseChain(body?.chain);
    const leaf = incoming[incoming.length - 1];
    if (!leaf) throw new HttpError(400, "chain is empty");
    if (!isAddressEqual(leaf.subject, me)) throw new HttpError(400, "the final delegation was not issued to me");
    chain = incoming;
    return { ok: true, depth: chain.length, leafId: leaf.id };
  }

  async function delegate(body: any) {
    const leaf = chain[chain.length - 1];
    if (!leaf) throw new HttpError(409, "I hold no authority yet");
    if (typeof body?.subject !== "string" || !isAddress(body.subject)) throw new HttpError(400, "subject must be an address");
    if (typeof body?.subjectName !== "string" || !body.subjectName) throw new HttpError(400, "subjectName is required");
    const scope = parseScopeInput(body.scope);

    if (opts.enforceNarrowing) {
      const failures = narrows(scope, leaf.scope);
      if (failures.length > 0) {
        throw new HttpError(422, "refusing to widen my own authority", { failures });
      }
    }

    const unsigned: UnsignedDelegation = {
      v: 1,
      parent: leaf.id,
      issuer: me,
      subject: body.subject as Address,
      issuerName: opts.ensName,
      subjectName: body.subjectName,
      scope,
      nonce: randomNonce(),
    };
    const delegation = await signDelegation(opts.account, unsigned, opts.domain);
    try {
      parseDelegation(toWire(delegation));
    } catch (e) {
      throw new HttpError(400, `delegation is malformed: ${e instanceof Error ? e.message : "invalid"}`);
    }
    return { delegation, chain: [...chain, delegation] };
  }

  async function pay(body: any) {
    if (!opts.service) throw new HttpError(404, "this agent does not pay");
    const leaf = chain[chain.length - 1];
    if (!leaf) throw new HttpError(409, "I hold no authority yet");
    if (typeof body?.amount !== "string" || !/^\d+$/.test(body.amount)) throw new HttpError(400, "amount must be a decimal string");
    if (typeof body?.target !== "string" || !body.target) throw new HttpError(400, "target is required");

    const request = await signRequest(
      opts.account,
      {
        leafId: leaf.id,
        audience: opts.service.audience,
        action: "payment.transfer",
        amount: BigInt(body.amount),
        target: body.target,
        nonce: randomNonce(),
        deadline: BigInt(Math.floor(Date.now() / 1000) + 120),
      },
      opts.domain,
    );
    // No client-side scope check on purpose: the service is the enforcement boundary.
    const res = await fetch(`${opts.service.url}/execute`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(toWire({ chain, request })),
    });
    return { service: { status: res.status, body: await res.json() } };
  }

  const server = createServer(async (req, res) => {
    try {
      const url = req.url?.split("?")[0];
      if (req.method === "GET" && url === "/status") {
        return send(res, 200, {
          name: opts.name,
          ensName: opts.ensName,
          address: me,
          depth: chain.length,
          leafId: chain[chain.length - 1]?.id ?? null,
          enforceNarrowing: opts.enforceNarrowing,
        });
      }
      if (req.method !== "POST") throw new HttpError(404, "not found");
      const body = await readJson(req);
      if (url === "/accept") return send(res, 200, await accept(body));
      if (url === "/delegate") return send(res, 200, await delegate(body));
      if (url === "/pay") return send(res, 200, await pay(body));
      throw new HttpError(404, "not found");
    } catch (e) {
      if (e instanceof HttpError) return send(res, e.status, { ok: false, error: e.message, ...e.extra });
      // Fail closed: any unexpected error is a refusal, never a partial success.
      return send(res, 500, { ok: false, error: e instanceof Error ? e.message : "internal error" });
    }
  });

  return {
    server,
    chain: () => chain,
    listen: (port) =>
      new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, "127.0.0.1", () => {
          const addr = server.address();
          resolve(typeof addr === "object" && addr ? addr.port : port);
        });
      }),
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
