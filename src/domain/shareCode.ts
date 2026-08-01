/**
 * Strategy share codes.
 *
 * A code is self-contained rather than a pointer at a row in someone's database,
 * so it survives being pasted into Discord and works between people running
 * separate instances.
 *
 *   PPT1.<base64url of gzipped JSON>
 *
 * The payload uses arrays instead of objects and short keys because the whole
 * thing has to stay short enough to paste comfortably.
 *
 * Decoding treats the input as hostile: it arrives from another person, so every
 * field is bounded and re-validated, and the decompressed size is capped so a
 * small code cannot expand into a large allocation.
 */

import { gunzipSync, gzipSync } from "node:zlib";

const PREFIX = "PPT1.";
const MAX_ITEMS = 250;
const MAX_NAME = 80;
const MAX_DECOMPRESSED = 256 * 1024;
/** ~1e15 micro-chaos, far above any real price, low enough to stay sane. */
const MAX_MICRO = 1_000_000_000_000_000n;

export interface ShareItem {
  priceKey: string;
  displayName: string;
  qty: number;
  /** micro-chaos as a string, so the payload is JSON-safe. */
  unitCostMicro: string;
}

export interface SharePayload {
  name: string;
  mapsRun: number;
  notes?: string;
  items: ShareItem[];
}

/** Wire form: [priceKey, displayName, qty, unitCostMicro] */
type WireItem = [string, string, number, string];
interface Wire {
  v: 1;
  n: string;
  m: number;
  d?: string;
  i: WireItem[];
}

export class ShareCodeError extends Error {}

function base64urlEncode(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlDecode(s: string): Buffer {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(b64, "base64");
}

export function encodeShareCode(payload: SharePayload): string {
  const wire: Wire = {
    v: 1,
    n: payload.name.slice(0, MAX_NAME),
    m: Math.max(0, Math.round(payload.mapsRun)),
    i: payload.items
      .slice(0, MAX_ITEMS)
      .map((i) => [i.priceKey, i.displayName.slice(0, MAX_NAME), i.qty, i.unitCostMicro]),
  };
  if (payload.notes) wire.d = payload.notes.slice(0, 200);

  return PREFIX + base64urlEncode(gzipSync(Buffer.from(JSON.stringify(wire), "utf8")));
}

function clean(s: unknown, max: number): string {
  if (typeof s !== "string") return "";
  // Strip control characters: a display name from someone else ends up in the
  // UI and in the database, and newlines in a table cell are just noise.
  return s.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max);
}

export function decodeShareCode(raw: string): SharePayload {
  const trimmed = raw.trim();
  if (!trimmed) throw new ShareCodeError("Paste a share code first.");

  const body = trimmed.startsWith(PREFIX) ? trimmed.slice(PREFIX.length) : null;
  if (body === null) {
    throw new ShareCodeError(
      `That does not look like a share code. They start with "${PREFIX}".`,
    );
  }
  if (!/^[A-Za-z0-9\-_]+$/.test(body)) {
    throw new ShareCodeError("That code contains characters that are not part of a share code.");
  }

  let json: string;
  try {
    const gz = base64urlDecode(body);
    // maxOutputLength makes zlib refuse rather than allocate without bound.
    json = gunzipSync(gz, { maxOutputLength: MAX_DECOMPRESSED }).toString("utf8");
  } catch {
    throw new ShareCodeError("That code is damaged or incomplete. Copy the whole thing and retry.");
  }

  let wire: unknown;
  try {
    wire = JSON.parse(json);
  } catch {
    throw new ShareCodeError("That code is damaged. Copy the whole thing and retry.");
  }

  if (!wire || typeof wire !== "object") throw new ShareCodeError("That code is not readable.");
  const w = wire as Partial<Wire>;

  if (w.v !== 1) {
    throw new ShareCodeError(
      "That code was made by a newer version of the app than this one can read.",
    );
  }
  if (!Array.isArray(w.i)) throw new ShareCodeError("That code contains no items.");

  const items: ShareItem[] = [];
  for (const entry of w.i.slice(0, MAX_ITEMS)) {
    if (!Array.isArray(entry)) continue;
    const [priceKey, displayName, qty, micro] = entry as WireItem;

    const key = clean(priceKey, 200);
    if (!key) continue;

    const q = Math.round(Number(qty));
    if (!Number.isFinite(q) || q <= 0 || q > 1_000_000) continue;

    let value: bigint;
    try {
      value = BigInt(String(micro));
    } catch {
      continue;
    }
    if (value < 0n || value > MAX_MICRO) continue;

    items.push({
      priceKey: key,
      displayName: clean(displayName, MAX_NAME) || key,
      qty: q,
      unitCostMicro: value.toString(),
    });
  }

  if (items.length === 0) {
    throw new ShareCodeError("That code decoded, but contained no usable items.");
  }

  const mapsRun = Math.round(Number(w.m));

  return {
    name: clean(w.n, MAX_NAME) || "Imported strategy",
    mapsRun: Number.isFinite(mapsRun) && mapsRun > 0 ? Math.min(mapsRun, 100_000) : 0,
    notes: clean(w.d, 200) || undefined,
    items,
  };
}
