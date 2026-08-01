/**
 * Starting (or reusing) the local embedded PostgreSQL server.
 *
 * Shared by `npm run dev` and `npm run db:local`, so that either can own the
 * server and the other will happily attach to it instead of fighting over the
 * port.
 */

import { existsSync, readFileSync, rmSync, unlinkSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { Client } from "pg";

export const DATA_DIR = path.resolve(".local-db");
export const PORT = 5433; // not 5432, so it can't collide with a real Postgres install
export const USER = "poe";
export const PASSWORD = "poe";
export const DATABASE = "poe_profit";
export const URL = `postgresql://${USER}:${PASSWORD}@localhost:${PORT}/${DATABASE}`;

/** Is something holding the port, whether or not it still answers queries? */
function portInUse(): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = net
      .createServer()
      .once("error", () => resolve(true))
      .once("listening", () => probe.close(() => resolve(false)))
      .listen(PORT, "127.0.0.1");
  });
}

/** Does a real Postgres answer on the port within the timeout? */
async function accepting(timeoutMs = 3000): Promise<boolean> {
  const client = new Client({ connectionString: URL, connectionTimeoutMillis: timeoutMs });
  try {
    await client.connect();
    await client.query("select 1");
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => {});
  }
}

/**
 * A postmaster killed without a clean shutdown leaves `postmaster.pid` behind.
 * Postgres then refuses to start ("lock file already exists"), and the symptom
 * the user sees is an unhelpful P1001 from Prisma. Clear it when the process it
 * names is genuinely gone.
 */
function clearStaleLock(): boolean {
  const lock = path.join(DATA_DIR, "postmaster.pid");
  if (!existsSync(lock)) return false;

  const pid = Number(readFileSync(lock, "utf8").split("\n")[0]?.trim());
  if (Number.isFinite(pid) && pid > 0) {
    try {
      // Signal 0 tests for existence without touching the process.
      process.kill(pid, 0);
      return false; // still alive, not stale, leave it alone
    } catch {
      /* no such process: the lock is stale */
    }
  }
  try {
    unlinkSync(lock);
    return true;
  } catch {
    return false;
  }
}

export interface LocalDb {
  url: string;
  /** True when we started the server, false when we attached to a running one. */
  owned: boolean;
  stop: () => Promise<void>;
}

export async function startLocalDb({ reset = false } = {}): Promise<LocalDb> {
  if (reset && existsSync(DATA_DIR)) {
    console.log("Removing existing data directory...");
    rmSync(DATA_DIR, { recursive: true, force: true });
  }

  if (await portInUse()) {
    if (await accepting()) {
      console.log(`Reusing the PostgreSQL server already running on port ${PORT}.`);
      return { url: URL, owned: false, stop: async () => {} };
    }
    throw new Error(
      `Port ${PORT} is held by a process that isn't answering queries, usually a\n` +
        `PostgreSQL that was force-killed rather than shut down.\n\n` +
        `Find and stop it, then try again:\n` +
        `  netstat -ano | findstr :${PORT}\n` +
        `  taskkill /PID <pid> /F\n`,
    );
  }

  if (clearStaleLock()) console.log("Cleared a stale postmaster.pid from a previous run.");

  // Imported here rather than at the top so that a missing binary produces this
  // explanation instead of a module-resolution stack trace. It is an OPTIONAL
  // dependency, a 108 MB platform binary that hosting platforms have no use for,
  // and which must never be able to fail a deploy.
  const EmbeddedPostgres = await import("embedded-postgres")
    .then((m) => m.default)
    .catch(() => {
      throw new Error(
        "embedded-postgres isn't installed, so there's no local database to start.\n" +
          "It's an optional dependency. Install it with:\n" +
          "  npm install embedded-postgres\n" +
          "Or point DATABASE_URL at a Postgres server you already have.",
      );
    });

  const fresh = !existsSync(DATA_DIR);
  const pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: USER,
    password: PASSWORD,
    port: PORT,
    persistent: true,
    onLog: () => {},
    onError: (err) => console.error("[postgres]", err),
  });

  if (fresh) {
    console.log("Initialising a new database cluster (first run only)...");
    await pg.initialise();
  }

  await pg.start();
  if (fresh) {
    await pg.createDatabase(DATABASE);
    console.log(`Created database "${DATABASE}".`);
  }

  return {
    url: URL,
    owned: true,
    stop: async () => {
      try {
        await pg.stop();
      } catch {
        /* already gone */
      }
    },
  };
}
