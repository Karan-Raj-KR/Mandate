import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MALICIOUS_INVOICE } from "@/fixtures/demo";
import { mockRun } from "@/lib/api";
import { ChainTree, Decision, PlainText } from "./chain";

const now = 1_800_000_000;

describe("chain view rendering", () => {
  it("renders invoice text escaped, never as HTML", () => {
    const html = renderToStaticMarkup(<PlainText label="Invoice" text={MALICIOUS_INVOICE} />);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<!--");
  });

  it("denied decision shows every violation and the no-side-effect line", () => {
    const run = mockRun("amplify", now);
    const html = renderToStaticMarkup(<Decision run={run} />);
    expect(html).toContain("DENIED");
    expect(html).toContain("AMPLIFICATION");
    for (const dim of ["actions", "maxAmount", "targets"]) expect(html).toContain(`<b>${dim}</b>`);
    expect(html).toContain("No side effect: balance unchanged.");
    const tree = renderToStaticMarkup(<ChainTree run={run} />);
    expect(tree).toContain("AMPLIFICATION on edge 2");
  });

  it("mock executions never link to Etherscan", () => {
    const html = renderToStaticMarkup(<Decision run={mockRun("legit", now)} />);
    expect(html).toContain("EXECUTED");
    expect(html).not.toContain("etherscan.io");
    expect(html).toContain("MOCK TX");
  });
});
