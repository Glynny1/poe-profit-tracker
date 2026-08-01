/**
 * A real PostgreSQL server, running locally, with no Docker and no system install.
 *
 *   npm run db:local        start it and leave it running
 *   npm run db:local:reset  wipe the data directory and start fresh
 *
 * You usually don't need this: `npm run dev` starts the database itself. Use it
 * when you want the database up WITHOUT the app — to run `npm run db:push`,
 * `npm run smoke`, or `npm run db:studio` on their own.
 *
 * `embedded-postgres` downloads an actual Postgres binary and runs it out of
 * ./.local-db. That matters because the schema uses Postgres-specific features —
 * scalar arrays for tab ids, jsonb for the fetch report — so SQLite would need a
 * different schema and would stop being a faithful rehearsal for production.
 */

import "dotenv/config";
import { startLocalDb } from "./lib/localDb.mjs";

const db = await startLocalDb({ reset: process.argv.includes("--reset") });

console.log(`
PostgreSQL is running.

  DATABASE_URL="${db.url}"

That is already the default in .env.example. In another terminal:

  npm run db:push     create the tables (first run, and after schema changes)
  npm run dev         start the app

Leave this terminal open. Ctrl+C stops the database; your data persists in
./.local-db and will still be there next time.
`);

let stopping = false;
const shutdown = async () => {
  if (stopping) return;
  stopping = true;
  console.log("\nStopping PostgreSQL…");
  await db.stop();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// Hold the process open; the server runs as a child of it.
setInterval(() => {}, 1 << 30);
