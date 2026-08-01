/**
 * Converting poe.ninja rows into `PriceRow`s keyed the same way stash items are.
 *
 * Pure functions, no I/O, so they can be tested against saved response fixtures.
 */

import { chaosToMicro } from "@/domain/money";
import {
  clusterKey,
  currencyKey,
  gemKey,
  ilvlBand,
  mapKey,
  uniqueKey,
} from "@/domain/priceKey";
import type { PriceRow } from "@/domain/types";
import type { ExchangeOverview, ItemLine, ItemOverview } from "./types";

const CDN = "https://web.poecdn.com";

function absoluteIcon(src?: string): string | undefined {
  if (!src) return undefined;
  return src.startsWith("/") ? CDN + src : src;
}

/**
 * Exchange rows carry only a slug, so the display name has to come from the
 * sibling `items` array. Rows whose slug is missing from it are dropped rather
 * than shown with a slug for a name.
 */
export function parseExchange(data: ExchangeOverview): PriceRow[] {
  const meta = new Map<string, { name: string; image?: string }>();
  for (const it of [...(data.items ?? []), ...(data.core?.items ?? [])]) {
    if (it?.id && it.name) meta.set(it.id, { name: it.name, image: it.image });
  }

  const out: PriceRow[] = [];
  for (const line of data.lines ?? []) {
    const m = meta.get(line.id);
    if (!m || !Number.isFinite(line.primaryValue) || line.primaryValue <= 0) continue;
    out.push({
      priceKey: currencyKey(m.name),
      displayName: m.name,
      icon: absoluteIcon(m.image),
      chaosMicro: chaosToMicro(line.primaryValue),
      // The exchange endpoint reports traded volume rather than a listing count.
      // Volume is a strictly better liquidity signal, so it stands in for count.
      count: Math.round(line.volumePrimaryValue ?? 0),
      listingCount: Math.round(line.volumePrimaryValue ?? 0),
    });
  }
  return out;
}

/** chaos per 1 divine, in micro-chaos. */
export function divineRateMicro(data: ExchangeOverview): bigint | null {
  const perChaos = data.core?.rates?.divine;
  if (!perChaos || perChaos <= 0) return null;
  return chaosToMicro(1 / perChaos);
}

const UNIQUE_TYPES = new Set([
  "UniqueWeapon",
  "UniqueArmour",
  "UniqueAccessory",
  "UniqueFlask",
  "UniqueJewel",
  "UniqueRelic",
  "UniqueTincture",
  "UniqueMap",
  "ForbiddenJewel",
  "ShrineBelt",
]);

const PLAIN_NAME_TYPES = new Set([
  "Invitation",
  "Incubator",
  "Beast",
  "Vial",
  "Memory",
  "IncursionTemple",
  "Wombgift",
  "BlightedMap",
  "BlightRavagedMap",
  "ValdoMap",
]);

/**
 * A gem row can be reachable under more than one name: a transfigured gem is
 * named "Vaal Summon Skeletons (Summon Skeletons of Archers)" on poe.ninja but
 * appears in the stash as plain "Summon Skeletons of Archers". Emit a key for
 * every name the same row could legitimately be found under.
 */
function gemNames(line: ItemLine): string[] {
  const names = new Set<string>();
  if (line.name) names.add(line.name);
  if (line.baseType) names.add(line.baseType);
  const paren = line.name?.match(/\(([^)]+)\)\s*$/);
  if (paren) {
    names.add(paren[1]);
    names.add(line.name.replace(/\s*\([^)]+\)\s*$/, "").trim());
  }
  return [...names].filter(Boolean);
}

/** Tier lives only inside the row name — the Map dataset has no tier field. */
function genericMapTier(line: ItemLine): number | null {
  const m = line.name?.match(/^Map \(Tier (\d+)\)$/);
  return m ? parseInt(m[1], 10) : null;
}

export function parseItems(data: ItemOverview, type: string): PriceRow[] {
  const out: PriceRow[] = [];

  for (const line of data.lines ?? []) {
    if (!Number.isFinite(line.chaosValue) || line.chaosValue <= 0) continue;

    const base = {
      displayName: line.name || line.baseType || "Unknown",
      icon: absoluteIcon(line.icon),
      chaosMicro: chaosToMicro(line.chaosValue),
      count: line.count ?? 0,
      listingCount: line.listingCount ?? line.count ?? 0,
    };

    if (UNIQUE_TYPES.has(type)) {
      if (!line.name) continue;
      // `links` is absent on unlinked rows; normalise so the item side (which
      // reports 0 for anything under 5 links) can match it.
      out.push({
        ...base,
        priceKey: uniqueKey(line.name, line.links ?? 0, !!line.corrupted),
      });
      continue;
    }

    if (type === "SkillGem" || type === "ImbuedGem") {
      const level = line.gemLevel ?? 1;
      const quality = line.gemQuality ?? 0;
      for (const name of gemNames(line)) {
        out.push({ ...base, priceKey: gemKey(name, level, quality, !!line.corrupted) });
      }
      continue;
    }

    if (type === "ClusterJewel") {
      const passives = parseInt(line.variant?.match(/(\d+)\s*passive/i)?.[1] ?? "", 10);
      if (!line.name || Number.isNaN(passives)) continue;
      // For cluster jewels `levelRequired` is the item level band, not a
      // level requirement.
      out.push({
        ...base,
        priceKey: clusterKey(line.name, passives, ilvlBand(line.levelRequired ?? 1)),
      });
      continue;
    }

    if (type === "Map") {
      // Only the generic "Map (Tier N)" rows are matchable from stash JSON.
      // Influenced rows ("Veritania Vaal Temple Map") would need the item's
      // influence decoded, which the MVP does not attempt.
      //
      // NOTE: do NOT filter rows by `variant: ", Gen-N"`. That is the standard
      // advice from older tools, but in the current league EVERY generic tier
      // row is Gen-24 — applying the filter deletes map pricing entirely.
      const tier = genericMapTier(line);
      if (tier == null) continue;
      out.push({ ...base, priceKey: mapKey(tier), displayName: `Map (Tier ${tier})` });
      continue;
    }

    if (PLAIN_NAME_TYPES.has(type)) {
      if (!line.name) continue;
      out.push({ ...base, priceKey: currencyKey(line.name) });
      continue;
    }
  }

  return out;
}
