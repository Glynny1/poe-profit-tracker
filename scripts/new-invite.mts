/**
 * Create a new invite code and add it to .env.
 *
 *   npm run invite              -> invite-a1b2c3d4e5f6
 *   npm run invite -- ggg       -> ggg-a1b2c3d4e5f6
 *
 * The earlier version of this only PRINTED a random string, which made it look
 * like the code was now usable when nothing had actually been configured with it.
 * It now appends the code to INVITE_CODE in .env, and says plainly what still has
 * to happen for a hosted deployment, where a local file obviously has no effect.
 */

import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ENV_PATH = path.resolve(".env");

const rawLabel = process.argv[2]?.trim();
const label = (rawLabel || "invite").replace(/[^A-Za-z0-9-]/g, "-").replace(/-+$/, "");
const code = `${label}-${randomBytes(6).toString("hex")}`;

if (!existsSync(ENV_PATH)) {
  console.error(
    `\nThere's no .env file yet, so there's nowhere to put this.\n\n` +
      `  cp .env.example .env\n\n` +
      `Then run this again.\n`,
  );
  process.exit(1);
}

const original = readFileSync(ENV_PATH, "utf8");
const lines = original.split(/\r?\n/);

// Match the last uncommented INVITE_CODE assignment, which is the one dotenv uses.
let index = -1;
for (let i = lines.length - 1; i >= 0; i--) {
  if (/^\s*INVITE_CODE\s*=/.test(lines[i])) {
    index = i;
    break;
  }
}

function existingCodes(line: string): string[] {
  const value = line.slice(line.indexOf("=") + 1).trim();
  const unquoted = value.replace(/^["']|["']$/g, "");
  return unquoted
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
}

const current = index >= 0 ? existingCodes(lines[index]) : [];
const updated = [...current, code];
const newLine = `INVITE_CODE="${updated.join(",")}"`;

if (index >= 0) lines[index] = newLine;
else lines.push(newLine);

writeFileSync(ENV_PATH, lines.join("\n"));

console.log(`
New invite code:

  ${code}

Added to .env, which now holds ${updated.length} code${updated.length === 1 ? "" : "s"}:
  ${updated.join("\n  ")}

RESTART the app for this to take effect — environment variables are read at
startup, so a running "npm run dev" is still using the old list. Stop it with
Ctrl+C and start it again.

If you're handing this to someone on your HOSTED site, .env is not involved at
all. Go to Vercel -> Settings -> Environment Variables, set INVITE_CODE to:

  ${updated.join(",")}

then redeploy (Deployments -> the newest one -> ... -> Redeploy). Vercel does not
rebuild on its own when a variable changes.

Delete a code from that list later to revoke it, leaving the others working.
`);
