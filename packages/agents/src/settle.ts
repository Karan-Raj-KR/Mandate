import { launch } from "./launch.js";

launch("settle").catch((err) => {
  console.error(err);
  process.exit(1);
});
