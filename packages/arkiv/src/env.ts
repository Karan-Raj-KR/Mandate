import { config } from "dotenv";
import path from "node:path";

// Load the repo-root .env. Resolved from the working directory rather than import.meta.url,
// because Next.js (webpack) rewrites import.meta.url. pnpm and Next both run packages from
// packages/<name>, so the root is two levels up; a root-level run finds ./.env.
// dotenv never overrides variables that are already set.
for (const candidate of [".env", "../../.env"]) config({ path: path.resolve(process.cwd(), candidate) });
