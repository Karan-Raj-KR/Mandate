import { describe, expect, it, vi } from "vitest";
import { runInvoiceAgent, usdcToMinor } from "../src/llm.js";

const call = (id: string, args: unknown) => ({ type: "function_call", call_id: id, name: "sign_delegation", arguments: JSON.stringify(args) });
const msg = (text: string) => ({ type: "message", content: [{ type: "output_text", text }] });
const ok = (output: unknown[]) => ({ ok: true, status: 200, json: async () => ({ output }) }) as Response;

const ARGS = { actions: ["payment.transfer"], max_amount_usdc: "25", expiry_hours: 1, targets: ["supplierA"] };

describe("usdcToMinor", () => {
  it("converts decimal strings exactly", () => {
    expect(usdcToMinor("25")).toBe("25000000");
    expect(usdcToMinor("10.5")).toBe("10500000");
    expect(usdcToMinor("0.000001")).toBe("1");
    expect(usdcToMinor("1000")).toBe("1000000000");
  });
  it("rejects anything that is not a plain decimal", () => {
    for (const bad of ["", "-1", "1e3", "1.0000001", "abc", "1,000", "0x10"]) expect(() => usdcToMinor(bad)).toThrow();
  });
});

describe("runInvoiceAgent", () => {
  it("runs the tool once with the model's arguments and returns the final text", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(ok([call("c1", ARGS)])).mockResolvedValueOnce(ok([msg("Done.")]));
    const sign = vi.fn(async () => ({ result: "signed delegation 0xabc", signed: { id: "0xabc" } }));
    const r = await runInvoiceAgent({ apiKey: "k", invoice: "inv", sign, fetchImpl: fetchImpl as any });
    expect(sign).toHaveBeenCalledOnce();
    expect(sign).toHaveBeenCalledWith(ARGS);
    expect(r.signed).toEqual({ id: "0xabc" });
    expect(r.text).toBe("Done.");
    expect(r.toolCalls).toHaveLength(1);
    // the tool result went back to the model under the same call_id
    const second = JSON.parse((fetchImpl.mock.calls[1]![1] as RequestInit).body as string);
    expect(second.input.at(-1)).toEqual({ type: "function_call_output", call_id: "c1", output: "signed delegation 0xabc" });
  });

  it("signs at most once even if the model calls the tool twice", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(ok([call("c1", ARGS), call("c2", ARGS)])).mockResolvedValueOnce(ok([msg("ok")]));
    const sign = vi.fn(async () => ({ result: "signed", signed: { n: 1 } }));
    const r = await runInvoiceAgent({ apiKey: "k", invoice: "inv", sign, fetchImpl: fetchImpl as any });
    expect(sign).toHaveBeenCalledOnce();
    expect(r.toolCalls).toHaveLength(2);
    const second = JSON.parse((fetchImpl.mock.calls[1]![1] as RequestInit).body as string);
    expect(second.input.at(-1).output).toMatch(/already signed/);
  });

  it("reports a model that signs nothing as signed: null", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(ok([msg("I will not issue that.")]));
    const sign = vi.fn();
    const r = await runInvoiceAgent({ apiKey: "k", invoice: "inv", sign: sign as any, fetchImpl: fetchImpl as any });
    expect(sign).not.toHaveBeenCalled();
    expect(r.signed).toBeNull();
    expect(r.text).toBe("I will not issue that.");
  });

  it("feeds a tool failure back to the model instead of crashing", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(ok([call("c1", ARGS)])).mockResolvedValueOnce(ok([msg("sorry")]));
    const sign = vi.fn(async () => {
      throw new Error("bad scope");
    });
    const r = await runInvoiceAgent({ apiKey: "k", invoice: "inv", sign, fetchImpl: fetchImpl as any });
    expect(r.signed).toBeNull();
    const second = JSON.parse((fetchImpl.mock.calls[1]![1] as RequestInit).body as string);
    expect(second.input.at(-1).output).toBe("error: bad scope");
  });

  it("returns an error with the HTTP status only, and no response body, when OpenAI fails", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ error: "secret detail" }) } as Response);
    const r = await runInvoiceAgent({ apiKey: "k", invoice: "inv", sign: vi.fn() as any, fetchImpl: fetchImpl as any });
    expect(r.error).toBe("OpenAI request failed with HTTP 401");
    expect(JSON.stringify(r)).not.toContain("secret detail");
    expect(r.signed).toBeNull();
  });

  it("sends the API key as a bearer header and the invoice as untrusted input", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(ok([msg("x")]));
    await runInvoiceAgent({ apiKey: "sk-test", invoice: "THE INVOICE", sign: vi.fn() as any, fetchImpl: fetchImpl as any });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect((init as RequestInit).headers).toMatchObject({ authorization: "Bearer sk-test" });
    expect(JSON.parse((init as RequestInit).body as string).input[0].content).toContain("THE INVOICE");
  });
});
