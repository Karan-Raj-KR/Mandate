import { describe, expect, it } from "vitest";
import { reviveAuthorityRow, type AuthorityRow } from "./api";

describe("reviveAuthorityRow", () => {
  it("turns the decimal-string maxAmount from the server back into a bigint and keeps the rest", () => {
    const wire = {
      d: { scope: { actions: ["payment.transfer"], maxAmount: "25000000", expiry: 1, targets: ["supplierA"] }, id: "0xabc" },
      depth: 2,
      status: "DENIED",
      reasons: ["edge 2 maxAmount: per-execution ceiling exceeds parent's (1 -> 2)"],
    } as unknown as AuthorityRow;
    const row = reviveAuthorityRow(wire);
    expect(row.d.scope.maxAmount).toBe(25_000_000n);
    expect(row.depth).toBe(2);
    expect(row.status).toBe("DENIED");
    expect(row.reasons).toHaveLength(1);
    expect(row.d.id).toBe("0xabc");
  });
});
