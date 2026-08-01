import { cookies } from "next/headers";
import { getIronSession, type SessionOptions } from "iron-session";
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { prisma } from "./prisma";

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

export interface SessionData {
  userId?: string;
}

const secret = process.env.SESSION_SECRET;
if (!secret || secret.length < 32) {
  // Fail loudly at boot rather than silently signing cookies with a weak key.
  throw new Error(
    "SESSION_SECRET must be set to at least 32 characters. Generate one with:\n" +
      '  node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
  );
}

export const sessionOptions: SessionOptions = {
  password: secret,
  cookieName: "poe_profit_session",
  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
  },
};

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), sessionOptions);
}

export async function getCurrentUser() {
  const session = await getSession();
  if (!session.userId) return null;
  return prisma.appUser.findUnique({ where: { id: session.userId } });
}

/** Throws if unauthenticated. Use in every route that touches user data. */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");
  return user;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, keyHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !keyHex) return false;
  const key = await scrypt(password, Buffer.from(saltHex, "hex"), 64);
  const expected = Buffer.from(keyHex, "hex");
  // Constant-time: a length mismatch must not short-circuit before comparing.
  return key.length === expected.length && timingSafeEqual(key, expected);
}
