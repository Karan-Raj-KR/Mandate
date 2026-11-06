import { launch } from "./launch.js";

launch("procure").catch((err) => {
  console.error(err);
  process.exit(1);
});
