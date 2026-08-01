/**
 * `npm run dev` — starts the local database, then Next, as one command.
 *
 * Two terminals is an easy thing to forget, and forgetting it produces a Prisma
 * P1001 that says nothing about the real cause. Owning the database here means
 * the app can't be started without one, and it's shut down cleanly on exit so no
 * orphaned postmaster is left holding the port.
 */

import "dotenv/config";
import { spawn } from "node:child_process";
import { startLocalDb } from "./lib/localDb.mjs";

const db = await startLocalDb();
console.log(`Database ready on ${db.url}\n`);

const next = spawn("npx", ["next", "dev", ...process.argv.slice(2)], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL ?? db.url },
});

let shuttingDown = false;
async function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  if (db.owned) {
    console.log("\nStopping the database…");
    await db.stop();
  }
  process.exit(code);
}

next.on("exit", (code) => shutdown(code ?? 0));
process.on("SIGINT", () => next.kill("SIGINT"));
process.on("SIGTERM", () => next.kill("SIGTERM"));
