/**
 * Money is integer micro-chaos: 1 chaos = 1_000_000 micro. Everything is bigint.
 *
 * Why: the three-term profit decomposition in `diff.ts` asserts an exact identity
 * (quantity + price + coverage === net worth delta). With floats that assertion
 * needs an epsilon, and an epsilon means "we hope this is right". With integers
 * it is provable, so a broken interval is detected rather than displayed.
 *
 * Divine is a DISPLAY UNIT ONLY. Never store, sum, or compare divine values —
 * poe.ninja rounds `divineValue` to 2dp, which is 5-50% error on cheap items,
 * and the chaos:divine rate moves. Convert once, at render, using the rate that
 * was recorded on the price book the figure came from.
 */

export const MICRO = 1_000_000n;

/** Parse a poe.ninja chaos value (a JSON float) into micro-chaos. */
export function chaosToMicro(chaos: number): bigint {
  if (!Number.isFinite(chaos)) return 0n;
  // Round half away from zero. Math.round() alone biases negatives (-0.5 -> -0).
  return BigInt(Math.sign(chaos) * Math.round(Math.abs(chaos) * 1_000_000));
}

export function microToChaos(micro: bigint): number {
  return Number(micro) / 1_000_000;
}

/**
 * Convert micro-chaos to divine for display.
 * @param divineRateMicro micro-chaos per 1 divine, from the price book.
 */
export function microToDivine(micro: bigint, divineRateMicro: bigint): number {
  if (divineRateMicro <= 0n) return 0;
  return Number(micro) / Number(divineRateMicro);
}

export type DisplayCurrency = "CHAOS" | "DIVINE";

/**
 * The single formatting entry point. Everything user-facing goes through this so
 * a divine figure can never be produced without an explicit rate.
 */
export function formatMoney(
  micro: bigint,
  currency: DisplayCurrency,
  divineRateMicro: bigint,
  opts: { sign?: boolean } = {},
): string {
  const negative = micro < 0n;
  const abs = negative ? -micro : micro;
  let body: string;

  if (currency === "DIVINE") {
    const d = microToDivine(abs, divineRateMicro);
    body = `${round(d, d < 10 ? 2 : 1)} div`;
  } else {
    const c = microToChaos(abs);
    body = c >= 10000 ? `${round(c / 1000, 1)}k c` : `${round(c, c < 10 ? 2 : 0)} c`;
  }

  const prefix = negative ? "−" : opts.sign ? "+" : "";
  return prefix + body;
}

function round(n: number, dp: number): string {
  return n.toLocaleString("en-GB", {
    minimumFractionDigits: 0,
    maximumFractionDigits: dp,
  });
}

/** Apply a liquidity haircut (percentage, 0-100) to an unrealised value. */
export function applyHaircut(micro: bigint, haircutPct: number): bigint {
  if (haircutPct >= 100) return micro;
  const pct = BigInt(Math.max(0, Math.min(100, Math.round(haircutPct))));
  return (micro * pct) / 100n;
}
