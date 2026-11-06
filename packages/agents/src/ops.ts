import { launch } from "./launch.js";

launch("ops").catch((err) => {
  console.error(err);
  process.exit(1);
});
