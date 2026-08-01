/**
 * Create a user, reset a password, list accounts, or delete an account.
 *
 *   npm run user -- list
 *   npm run user -- create <username> [password]   password generated if omitted
 *   npm run user -- password <username> [password] reset an existing password
 *   npm run user -- delete <username>              deletes their snapshots too
 *
 * No credentials live in this file or anywhere else in the repo. The password
 * exists only as a scrypt hash in the database, and whatever you see printed
 * once in your terminal.
 *
 * A password typed as an argument lands in your shell history. For a local app
 * that is a small thing, but omit it and let this generate one if you would
 * rather it did not.
 */

import "dotenv/config";
import { randomBytes, scrypt as scryptCb } from "node:crypto";
import { promisify } from "node:util";
import { prisma } from "../src/lib/prisma";

const scrypt = promisify(scryptCb) as (p: string, s: Buffer, l: number) => Promise<Buffer>;

// Deliberately duplicated from src/lib/session.ts rather than imported: that
// module reads SESSION_SECRET and pulls in next/headers, neither of which makes
// sense in a CLI. The format must stay identical.
async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

/** Readable but strong: 4 words plus digits beats a hex blob you will retype wrong. */
function generatePassword(): string {
  const words = [
    "amber", "basalt", "cinder", "delve", "ember", "flask", "gilded", "harvest",
    "ivory", "jewel", "kraken", "lantern", "marble", "nexus", "onyx", "prism",
    "quarry", "ripple", "sable", "tundra", "umbra", "vault", "willow", "zenith",
  ];
  const pick = () => words[randomBytes(1)[0] % words.length];
  const digits = String(randomBytes(2).readUInt16BE(0) % 10000).padStart(4, "0");
  return `${pick()}-${pick()}-${pick()}-${digits}`;
}

const [command, username, providedPassword] = process.argv.slice(2);

function usage(): never {
  console.log(`
  npm run user -- list
  npm run user -- create <username> [password]
  npm run user -- password <username> [password]
  npm run user -- delete <username>
`);
  process.exit(1);
}

if (command === "list") {
  const users = await prisma.appUser.findMany({
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { snapshots: true, strategies: true } } },
  });
  if (users.length === 0) console.log("\nNo accounts yet.\n");
  else {
    console.log("\nAccounts:");
    for (const u of users) {
      console.log(
        `  ${u.username.padEnd(20)} league ${u.league.padEnd(12)} ` +
          `${u._count.snapshots} snapshot(s), ${u._count.strategies} strateg${u._count.strategies === 1 ? "y" : "ies"}`,
      );
    }
    console.log();
  }
} else if (command === "create" || command === "password") {
  if (!username) usage();
  const existing = await prisma.appUser.findUnique({ where: { username } });

  if (command === "create" && existing) {
    console.error(
      `\n"${username}" already exists. Use "npm run user -- password ${username}" to reset it.\n`,
    );
    process.exit(1);
  }
  if (command === "password" && !existing) {
    console.error(`\nNo account called "${username}".\n`);
    process.exit(1);
  }

  const password = providedPassword || generatePassword();
  const passwordHash = await hashPassword(password);

  if (existing) await prisma.appUser.update({ where: { username }, data: { passwordHash } });
  else await prisma.appUser.create({ data: { username, passwordHash } });

  console.log(`
  ${existing ? "Password reset for" : "Created"} "${username}"

    username: ${username}
    password: ${password}

  Save that somewhere. It is stored only as a hash, so it cannot be read back.
  Change it any time with:  npm run user -- password ${username}
`);
} else if (command === "delete") {
  if (!username) usage();
  const user = await prisma.appUser.findUnique({
    where: { username },
    include: { _count: { select: { snapshots: true, strategies: true } } },
  });
  if (!user) {
    console.error(`\nNo account called "${username}".\n`);
    process.exit(1);
  }
  await prisma.appUser.delete({ where: { username } });
  console.log(
    `\nDeleted "${username}" along with ${user._count.snapshots} snapshot(s) ` +
      `and ${user._count.strategies} strateg${user._count.strategies === 1 ? "y" : "ies"}.\n`,
  );
} else {
  usage();
}

await prisma.$disconnect();
