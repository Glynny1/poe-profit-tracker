/**
 * poe.ninja HTTP client.
 *
 * Their docs ask for: a descriptive User-Agent with a contact, respect for the
 * ~5 minute HTTP cache, and no polling faster than a few minutes (the PoE1 data
 * itself only refreshes every ~15 min, so faster polling just re-reads
 * identical numbers). All of that is enforced here rather than left to callers.
 */

import { parseExchange, parseItems, divineRateMicro } from "./parse";
import { EXCHANGE_TYPES, ITEM_TYPES, type ExchangeOverview, type ItemOverview } from "./types";
import type { PriceRow } from "@/domain/types";

const BASE = "https://poe.ninja/poe1/api/economy";

const CONTACT = process.env.CONTACT_EMAIL ?? "unset@example.com";
const USER_AGENT = `PoEProfitTracker/0.1 (contact: ${CONTACT})`;

export interface FetchReport {
  type: string;
  ok: boolean;
  rows: number;
  /** 404 means the category no longer exists — expected, not an error. */
  status?: number;
  error?: string;
}

export interface PriceFetchResult {
  rows: PriceRow[];
  divineRateMicro: bigint;
  reports: FetchReport[];
  league: string;
}

async function getJson<T>(url: string): Promise<{ data?: T; status: number }> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    // Their cache is ~5 min and the underlying data refreshes every ~15.
    next: { revalidate: 300 },
  });
  if (!res.ok) return { status: res.status };
  return { data: (await res.json()) as T, status: res.status };
}

export async function fetchLeagues(): Promise<string[]> {
  const { data } = await getJson<{ id: string; name: string }[]>(`${BASE}/leagues`);
  return (data ?? []).map((l) => l.id);
}

/**
 * Fetch a complete price book for one league.
 *
 * An invalid `type` returns 404 while a valid type with no data returns 200 with
 * an empty `lines` array. Those must be handled differently: retrying a 404
 * forever hammers poe.ninja, and treating it as fatal breaks the whole refresh
 * every time GGG retires a league mechanic.
 */
export async function fetchPriceBook(league: string): Promise<PriceFetchResult> {
  const reports: FetchReport[] = [];
  const rows: PriceRow[] = [];
  let rate: bigint | null = null;

  // Currency first and on its own: it carries core.rates.divine, and without a
  // divine rate the whole book is unusable.
  const currency = await getJson<ExchangeOverview>(
    `${BASE}/exchange/current/overview?league=${encodeURIComponent(league)}&type=Currency`,
  );
  if (!currency.data) {
    throw new Error(
      `poe.ninja: could not fetch Currency for "${league}" (HTTP ${currency.status}). ` +
        `Without it there is no chaos:divine rate and no price book can be built.`,
    );
  }
  rate = divineRateMicro(currency.data);
  if (!rate) throw new Error("poe.ninja: Currency response carried no core.rates.divine");

  const currencyRows = parseExchange(currency.data);

  // poe.ninja rounds the Divine Orb's chaos value (168.6) independently of the
  // rate it publishes (168.577208), so a stash of N divines would otherwise
  // render as N * 1.0001 divines. The exchange rate IS the divine price by
  // definition, so pin the row to it and the round-trip becomes exact.
  const divineRow = currencyRows.find((r) => r.priceKey === "cur:divine orb");
  if (divineRow) divineRow.chaosMicro = rate;

  rows.push(...currencyRows);
  reports.push({ type: "Currency", ok: true, rows: currencyRows.length, status: 200 });

  for (const type of EXCHANGE_TYPES) {
    if (type === "Currency") continue;
    const { data, status } = await getJson<ExchangeOverview>(
      `${BASE}/exchange/current/overview?league=${encodeURIComponent(league)}&type=${type}`,
    );
    if (!data) {
      reports.push({ type, ok: status === 404, rows: 0, status });
      continue;
    }
    const parsed = parseExchange(data);
    rows.push(...parsed);
    reports.push({ type, ok: true, rows: parsed.length, status });
  }

  for (const type of ITEM_TYPES) {
    const { data, status } = await getJson<ItemOverview>(
      `${BASE}/stash/current/item/overview?league=${encodeURIComponent(league)}&type=${type}`,
    );
    if (!data) {
      reports.push({ type, ok: status === 404, rows: 0, status });
      continue;
    }
    const parsed = parseItems(data, type);
    rows.push(...parsed);
    reports.push({ type, ok: true, rows: parsed.length, status });
  }

  return { rows, divineRateMicro: rate, reports, league };
}
