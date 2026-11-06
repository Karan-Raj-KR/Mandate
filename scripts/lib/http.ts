import { toWire } from "@mandate/core";
import type { Delegation, ExecutionRequest } from "@mandate/core";
import { serviceBaseUrl } from "./env.js";

export async function postExecute(
  chain: Delegation[],
  request: ExecutionRequest,
): Promise<{ status: number; body: any }> {
  const res = await fetch(`${serviceBaseUrl()}/execute`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(toWire({ chain, request })),
  });
  return { status: res.status, body: await res.json() };
}

export async function getBalance(): Promise<string> {
  const res = await fetch(`${serviceBaseUrl()}/balance`);
  const body = await res.json();
  return body.balance;
}
