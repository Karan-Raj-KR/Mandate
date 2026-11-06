import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { narrows } from "../src/narrow.js";
import { ACTIONS, type Scope } from "../src/types.js";

const TARGET_POOL = ["supplierA", "supplierB", "supplierC", "supplierD"];

const targetsArb = (pool: string[]): fc.Arbitrary<string[]> =>
  fc.oneof(
    fc.constant(["*"]),
    fc.subarray(pool),
  );

const rootScopeArb: fc.Arbitrary<Scope> = fc.record({
  actions: fc.subarray([...ACTIONS]),
  maxAmount: fc.bigInt({ min: 0n, max: 10_000_000_000n }),
  expiry: fc.integer({ min: 0, max: 2_000_000_000 }),
  targets: targetsArb(TARGET_POOL),
});

function narrowerOf(parent: Scope): fc.Arbitrary<Scope> {
  const childTargets = parent.targets.includes("*")
    ? targetsArb(TARGET_POOL)
    : fc.subarray(parent.targets);

  return fc.record({
    actions: fc.subarray(parent.actions),
    maxAmount: fc.bigInt({ min: 0n, max: parent.maxAmount }),
    expiry: fc.integer({ min: 0, max: parent.expiry }),
    targets: childTargets,
  });
}

describe("narrows — property based", () => {
  it("is reflexive: narrows(A, A) = []", () => {
    fc.assert(
      fc.property(rootScopeArb, (a) => {
        expect(narrows(a, a)).toEqual([]);
      }),
    );
  });

  it("is transitive: C narrows B and B narrows A implies C narrows A", () => {
    fc.assert(
      fc.property(
        rootScopeArb.chain((a) =>
          narrowerOf(a).chain((b) =>
            narrowerOf(b).map((c) => ({ a, b, c })),
          ),
        ),
        ({ a, b, c }) => {
          expect(narrows(b, a)).toEqual([]);
          expect(narrows(c, b)).toEqual([]);
          expect(narrows(c, a)).toEqual([]);
        },
      ),
    );
  });
});
