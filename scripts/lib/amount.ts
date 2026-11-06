/** DEMO_AMOUNT in USDC (default 10) as 6-decimal minor units. Exact, and it says what is wrong instead of throwing a RangeError. */
export function demoAmount(raw = process.env.DEMO_AMOUNT ?? "10"): bigint {
  const m = /^(\d+)(?:\.(\d{1,6}))?$/.exec(raw.trim());
  if (!m) throw new Error(`DEMO_AMOUNT must be a plain USDC amount like 10 or 0.25, got "${raw}"`);
  return BigInt(m[1]!) * 1_000_000n + BigInt((m[2] ?? "").padEnd(6, "0") || "0");
}
