import { describe, expect, it } from "vitest";
import type { Hex } from "viem";
import { ZERO_ID } from "@mandate/core";
import type { Delegation } from "@mandate/core";
import { resolveChain } from "../src/resolve.js";

const id = (n: number) => `0x${n.toString(16).padStart(64, "0")}` as Hex;
const d = (n: number, parent: Hex): Delegation => ({ id: id(n), parent } as unknown as Delegation);
const store = (ds: Delegation[]) => async (i: Hex) => ds.find((x) => x.id === i) ?? null;

describe("resolveChain", () => {
  it("returns the chain root first", async () => {
    const ds = [d(1, ZERO_ID), d(2, id(1)), d(3, id(2))];
    expect((await resolveChain(id(3), store(ds))).map((x) => x.id)).toEqual([id(1), id(2), id(3)]);
  });
  it("accepts a single root", async () => {
    expect(await resolveChain(id(1), store([d(1, ZERO_ID)]))).toHaveLength(1);
  });
  it("refuses a chain with a missing ancestor", async () => {
    await expect(resolveChain(id(3), store([d(3, id(2))]))).rejects.toThrow(/could not be fetched/);
  });
  it("refuses a loop", async () => {
    await expect(resolveChain(id(1), store([d(1, id(2)), d(2, id(1))]))).rejects.toThrow(/loop/);
  });
  it("refuses a chain deeper than the limit", async () => {
    const ds = Array.from({ length: 10 }, (_, i) => d(i + 1, i === 0 ? ZERO_ID : id(i)));
    await expect(resolveChain(id(10), store(ds))).rejects.toThrow(/deeper than 8/);
  });
  it("refuses a source that answers with a different delegation than asked for", async () => {
    await expect(resolveChain(id(2), async () => d(9, ZERO_ID))).rejects.toThrow(/when asked for/);
  });
});
