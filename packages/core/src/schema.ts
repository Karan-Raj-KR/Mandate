import { z } from "zod";
import { getAddress, isAddress } from "viem";
import type { Address, Hex } from "viem";
import {
  ACTIONS,
  MAX_DEPTH,
  type Delegation,
  type ExecutionRequest,
} from "./types.js";

export const MAX_PAYLOAD_BYTES = 32 * 1024;

function assertWithinSizeCap(json: unknown): void {
  const size = Buffer.byteLength(JSON.stringify(json), "utf8");
  if (size > MAX_PAYLOAD_BYTES) {
    throw new Error(`payload exceeds ${MAX_PAYLOAD_BYTES} bytes (got ${size})`);
  }
}

function isSorted(values: string[]): boolean {
  return values.every((v, i) => i === 0 || values[i - 1] < v);
}

function hasDuplicates(values: string[]): boolean {
  return new Set(values).size !== values.length;
}

const hexIdSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, "expected a 32-byte hex value")
  .transform((v) => v.toLowerCase() as Hex);

const hexSigSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{2,}$/, "expected a hex signature")
  .refine((v) => (v.length - 2) % 2 === 0, "hex signature must have an even number of digits")
  .transform((v) => v.toLowerCase() as Hex);

const addressSchema = z
  .string()
  .refine((v) => isAddress(v), "expected a valid address")
  .transform((v) => getAddress(v).toLowerCase() as Address);

const decimalBigIntSchema = z
  .string()
  .regex(/^\d+$/, "expected a non-negative decimal integer string")
  .transform((v) => BigInt(v));

const nonNegativeIntSchema = z.number().int().nonnegative();

const actionSchema = z.enum(ACTIONS);

const actionsArraySchema = z
  .array(actionSchema)
  .refine((v) => !hasDuplicates(v), "actions must not contain duplicates")
  .refine((v) => isSorted(v), "actions must be sorted");

const targetsArraySchema = z
  .array(z.string().min(1))
  .min(1, "targets must not be empty")
  .refine((v) => !hasDuplicates(v), "targets must not contain duplicates")
  .refine(
    (v) => v[0] === "*" || !v.includes("*"),
    "targets must not mix \"*\" with concrete ids",
  )
  .refine((v) => v.length === 1 || v[0] !== "*", "\"*\" must not be combined with other targets")
  .refine((v) => (v[0] === "*" ? true : isSorted(v)), "targets must be sorted");

const scopeSchema = z.object({
  actions: actionsArraySchema,
  maxAmount: decimalBigIntSchema,
  expiry: nonNegativeIntSchema,
  targets: targetsArraySchema,
});

const delegationSchema = z.object({
  v: z.literal(1),
  parent: hexIdSchema,
  issuer: addressSchema,
  subject: addressSchema,
  issuerName: z.string().min(1),
  subjectName: z.string().min(1),
  scope: scopeSchema,
  nonce: hexIdSchema,
  id: hexIdSchema,
  sig: hexSigSchema,
});

const requestSchema = z.object({
  leafId: hexIdSchema,
  audience: z.string().min(1),
  action: actionSchema,
  amount: decimalBigIntSchema,
  target: z.string().min(1),
  nonce: hexIdSchema,
  deadline: decimalBigIntSchema,
  sig: hexSigSchema,
});

const chainSchema = z.array(delegationSchema).max(MAX_DEPTH, `chain longer than ${MAX_DEPTH}`);

export function parseDelegation(json: unknown): Delegation {
  assertWithinSizeCap(json);
  return delegationSchema.parse(json) as Delegation;
}

export function parseChain(json: unknown): Delegation[] {
  assertWithinSizeCap(json);
  return chainSchema.parse(json) as Delegation[];
}

export function parseRequest(json: unknown): ExecutionRequest {
  assertWithinSizeCap(json);
  return requestSchema.parse(json) as ExecutionRequest;
}

export function toWire(x: unknown): unknown {
  if (typeof x === "bigint") return x.toString();
  if (Array.isArray(x)) return x.map(toWire);
  if (x !== null && typeof x === "object") {
    return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, toWire(v)]));
  }
  return x;
}
