import { spawn } from "node:child_process";

// Starts the three agents as separate OS processes. ROGUE=1 makes procurement the rogue variant.
const roles = ["ops", "procure", "settle"] as const;
const children = roles.map((role) => {
  const child = spawn("npx", ["tsx", `src/${role}.ts`], { stdio: ["ignore", "inherit", "inherit"] });
  child.on("exit", (code) => console.log(`${role} exited (${code})`));
  return child;
});
const stop = () => children.forEach((c) => c.kill());
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
