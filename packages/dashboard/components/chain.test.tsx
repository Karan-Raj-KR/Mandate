import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MALICIOUS_INVOICE } from "@/fixtures/demo";
import { mock, mockRevokeRoot, mockRun } from "@/lib/api";
import { checkStatuses, Gatekeeper, InvoiceSheet, moneyShot, PermitChain, PlainText, Verdict } from "./chain";

const now = 1_800_000_000;

describe("stage rendering", () => {
  it("renders invoice and model text escaped, never as HTML", () => {
    for (const html of [
      renderToStaticMarkup(<PlainText label="Model output" text={MALICIOUS_INVOICE} />),
      renderToStaticMarkup(<InvoiceSheet text={MALICIOUS_INVOICE} />),
    ]) {
      expect(html).not.toContain("<script>");
      expect(html).toContain("&lt;script&gt;");
      expect(html).not.toContain("<!--");
    }
  });

  it("denied amplification shows every violation and that no money moved", () => {
    const run = mockRun("amplify", now);
    const gate = renderToStaticMarkup(<Gatekeeper run={run} />);
    for (const dim of ["actions", "maxAmount", "targets"]) expect(gate).toContain(`<b>${dim}</b>`);
    expect(gate).toContain("AMPLIFICATION");
    const chain = renderToStaticMarkup(<PermitChain run={run} showRevoked={false} />);
    expect(chain).toContain("This agent tried to give more power than it had (3 ways)");
    const verdict = renderToStaticMarkup(<Verdict run={run} />);
    expect(verdict).toContain("DENIED. No money moved.");
    expect(verdict).toContain("Balance unchanged. No money moved.");
    expect(moneyShot(run)).toEqual({ asked: 450_000_000n, allowed: 100_000_000n });
  });

  it("mock payments never link to Etherscan", () => {
    const html = renderToStaticMarkup(<Verdict run={mockRun("legit", now)} />);
    expect(html).toContain("Paid");
    expect(html).not.toContain("etherscan.io");
    expect(html).toContain("Mock tx");
  });

  it("checks after the first failure are not reached; mock never claims signatures passed", () => {
    const amp = mockRun("amplify", now);
    expect(checkStatuses(amp.verdict, true)).toEqual(["skipped (mock)", "fail", "skipped (mock)", "not reached", "not reached", "not reached"]);
    expect(checkStatuses({ ok: true }, false)).toEqual(Array(6).fill("pass"));
    mockRevokeRoot();
    const rev = mockRun("revoke", now);
    mock.revoked.clear();
    expect(checkStatuses(rev.verdict, false)).toEqual(["pass", "pass", "pass", "fail", "pass", "pass"]);
    expect(renderToStaticMarkup(<PermitChain run={rev} showRevoked />)).toContain("Void · parent revoked");
  });
});
