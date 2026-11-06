import type { Delegation, EdgeFailure, NarrowFailure, Scope } from "./types.js";

export function narrows(child: Scope, parent: Scope): NarrowFailure[] {
  const f: NarrowFailure[] = [];

  const p = new Set(parent.actions);
  const escalated = child.actions.filter(a => !p.has(a));
  if (escalated.length) f.push({ dimension: "actions",
    reason: `claims action(s) the parent never held: ${escalated.join(", ")}`,
    parentValue: parent.actions.join(", "), childValue: child.actions.join(", ") });

  if (child.maxAmount > parent.maxAmount) f.push({ dimension: "maxAmount",
    reason: "per-execution ceiling exceeds parent's",
    parentValue: parent.maxAmount.toString(), childValue: child.maxAmount.toString() });

  if (child.expiry > parent.expiry) f.push({ dimension: "expiry",
    reason: "outlives parent", parentValue: String(parent.expiry), childValue: String(child.expiry) });

  if (!parent.targets.includes("*")) {
    if (child.targets.includes("*")) {
      f.push({ dimension: "targets", reason: "claims unrestricted targets from a restricted parent",
        parentValue: parent.targets.join(", "), childValue: "*" });
    } else {
      const pt = new Set(parent.targets);
      const bad = child.targets.filter(t => !pt.has(t));
      if (bad.length) f.push({ dimension: "targets",
        reason: `claims target(s) outside parent's set: ${bad.join(", ")}`,
        parentValue: parent.targets.join(", "), childValue: child.targets.join(", ") });
    }
  }
  return f;
}

/** edge i compares chain[i] (child) against chain[i-1] (parent), for every i >= 1 */
export function checkAllEdges(chain: Delegation[]): EdgeFailure[] {
  const out: EdgeFailure[] = [];
  for (let i = 1; i < chain.length; i++) {
    const failures = narrows(chain[i].scope, chain[i - 1].scope);
    if (failures.length) out.push({ edge: i, failures });
  }
  return out;
}
