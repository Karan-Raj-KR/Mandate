import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { parseChain, toWire } from "@mandate/core";
import type { Delegation } from "@mandate/core";

const CHAIN_PATH = ".data/chain.json";

export function writeChainFile(chain: Delegation[]): void {
  mkdirSync(".data", { recursive: true });
  writeFileSync(CHAIN_PATH, JSON.stringify(toWire(chain), null, 2));
}

export function readChainFile(): Delegation[] {
  const raw = JSON.parse(readFileSync(CHAIN_PATH, "utf8"));
  return parseChain(raw);
}
