import dotenv from "dotenv";
import path from "node:path";
import { createApp } from "./app";

// Explicit path, not the implicit process.cwd()-relative default: this
// process can be started from different working directories (npm --prefix,
// a monorepo task runner, etc.), and dotenv silently loading zero variables
// because cwd wasn't what was assumed is a genuinely hard bug to notice --
// found by exactly that happening in local dev.
dotenv.config({ path: path.join(__dirname, "../.env") });

const port = Number(process.env.PORT ?? 4000);

const app = createApp();

app.listen(port, () => {
  console.log(`Dhaka Tesla Pool API listening on port ${port}`);
});
