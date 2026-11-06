import { describe, expect, it } from "vitest";
import { exploreAuthority, mock, mockRevokeRoot, mockRun } from "./api";

const now = 1_800_000_000;

describe("mock service", () => {
  it("legit request executes", () => {
    const r = mockRun("legit", now);
    expect(r.verdict.ok).toBe(true);
    expect(r.mock).toBe(true);
  });

  it("amplification lists every violation on the injected edge", () => {
    const r = mockRun("amplify", now);
    expect(r.verdict.ok).toBe(false);
    if (r.verdict.ok) return;
    expect(r.verdict.code).toBe("AMPLIFICATION");
    expect(r.verdict.edges?.[0].edge).toBe(2);
    expect(r.verdict.edges?.[0].failures.map((f) => f.dimension).sort()).toEqual(["actions", "maxAmount", "targets"]);
    expect(r.txHash).toBeUndefined();
  });

  it("step-up is denied unless approved for that exact request", () => {
    expect(mockRun("stepup", now).verdict).toMatchObject({ ok: false, code: "STEP_UP_REQUIRED" });
    const ok = mockRun("stepup", now, true);
    expect(ok.verdict.ok).toBe(true);
    expect(ok.stepUp.approvedNonce).toBe(ok.request.nonce);
  });

  it("replaying the last executed request is denied", () => {
    expect(mock.lastExecuted).toBeDefined();
    expect(mockRun("replay", now).verdict).toMatchObject({ ok: false, code: "REPLAY" });
  });

  it("ancestor revocation denies a fresh request and every descendant in the explorer", async () => {
    mockRevokeRoot();
    const r = mockRun("revoke", now);
    expect(r.verdict).toMatchObject({ ok: false, code: "REVOKED" });
    expect(r.revoked).toEqual([true, false, false]);
    const rows = await exploreAuthority("treasury.dhruv.eth", now);
    expect(rows.length).toBe(4);
    expect(rows.every((x) => x.status === "DENIED")).toBe(true);
  });

  it("explorer shows the rogue sibling as DENIED and the rest USABLE before revocation", async () => {
    mock.revoked.clear();
    const rows = await exploreAuthority("treasury.dhruv.eth", now);
    expect(rows.map((x) => x.status)).toEqual(["USABLE", "USABLE", "USABLE", "DENIED"]);
    await expect(exploreAuthority("nobody.eth", now)).rejects.toThrow();
  });
});
