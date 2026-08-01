/**
 * Create the tables in your HOSTED database.
 *
 *   npm run db:push:prod
 *
 * Reads PRODUCTION_DATABASE_URL from .env and runs `prisma db push` against it,
 * leaving DATABASE_URL alone.
 *
 * The obvious alternative — "temporarily point DATABASE_URL at Neon, push, then
 * change it back" — is a trap: forget the last step and your local dev server is
 * silently reading and writing the database your friends are using. Keeping the
 * two URLs in separate variables means that can't happen by accident.
 */

import "dotenv/config";
import { spawnSync } from "node:child_process";

const url = process.env.PRODUCTION_DATABASE_URL;

if (!url) {
  console.error(
    `\nPRODUCTION_DATABASE_URL is not set.\n\n` +
      `Add it to your .env file, on its own line:\n\n` +
      `  PRODUCTION_DATABASE_URL="postgresql://...-pooler...neon.tech/...?sslmode=require"\n\n` +
      `Copy that value from your Neon dashboard. .env is gitignored, so it is not\n` +
      `published when you push to GitHub.\n`,
  );
  process.exit(1);
}

if (url.includes("localhost")) {
  console.error(
    `\nPRODUCTION_DATABASE_URL points at localhost, which is your own machine —\n` +
      `that is almost certainly a copy/paste slip. It should be the Neon string.\n`,
  );
  process.exit(1);
}

const host = url.match(/@([^/?]+)/)?.[1] ?? "(unknown host)";
if (!host.includes("-pooler")) {
  console.warn(
    `\nWarning: "${host}" does not look like Neon's POOLED connection string.\n` +
      `The pooled one has "-pooler" in the hostname and is the one to use for a\n` +
      `serverless app. Continuing anyway.\n`,
  );
}

console.log(`Creating tables in ${host} …\n`);

const result = spawnSync("npx", ["prisma", "db", "push"], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, DATABASE_URL: url },
});

if (result.status === 0) {
  console.log(`\nDone. Your hosted database now has the tables.\n`);
}
process.exit(result.status ?? 1);
