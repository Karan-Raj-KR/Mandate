import { config } from "dotenv";
import { fileURLToPath } from "node:url";

// Load the repo-root .env explicitly (pnpm runs package scripts from the package dir).
config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)) });
