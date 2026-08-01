/**
 * The snapshot diff.
 *
 * Net worth change between two snapshots decomposes into exactly three terms:
 *
 *   quantity_effect  items you actually gained or lost      <- THIS IS PROFIT
 *   price_effect     the market moved under what you held   <- not profit
 *   coverage_effect  what we could price changed            <- not profit either
 *
 * For an item priced on both sides the split is exact algebra, not an estimate:
 *
 *   qB*pB - qA*pA  ===  (qB-qA)*pB  +  qA*(pB-pA)
 *
 * so `netWorth(B) - netWorth(A) === Σquantity + Σprice + Σcoverage` must hold to
 * the unit. We assert it in bigint before returning. If it ever fails the caller
 * must refuse to show a profit figure for that interval — a wrong number that
 * looks plausible is worse than an honest gap.
 */

import type { SnapshotLine } from "./types";

export type DiffKind =
  | "added"
  | "removed"
  | "increased"
  | "decreased"
  | "repriced"
  | "unchanged"
  | "became_priceable"
  | "became_unpriceable"
  | "out_of_scope"
  | "unpriced";

export interface DiffLine {
  itemKey: string;
  displayName: string;
  icon?: string;
  qtyBefore: number;
  qtyAfter: number;
  qtyDelta: number;
  unitBefore: bigint | null;
  unitAfter: bigint | null;
  quantityMicro: bigint;
  priceMicro: bigint;
  coverageMicro: bigint;
  kind: DiffKind;
}

export interface DiffResult {
  quantityMicro: bigint;
  priceMicro: bigint;
  coverageMicro: bigint;
  /** Σ of the three terms. Equals netWorth(B) − netWorth(A) when `reconciles`. */
  netMicro: bigint;
  totalBefore: bigint;
  totalAfter: bigint;
  reconciles: boolean;
  lines: DiffLine[];
  /** Tab ids present in one snapshot but not the other. */
  scopeChanged: string[];
}

export interface SnapshotInput {
  lines: SnapshotLine[];
  tabIds: string[];
}

function lineValue(line: SnapshotLine): bigint {
  return line.unitMicro == null ? 0n : BigInt(line.qty) * line.unitMicro;
}

export function netWorth(lines: SnapshotLine[]): bigint {
  let total = 0n;
  for (const l of lines) total += lineValue(l);
  return total;
}

/**
 * Diff two snapshots.
 *
 * When the tracked tab set changed between A and B we diff over the
 * INTERSECTION and route the symmetric difference into coverage_effect. The
 * alternative — refusing to diff on a scope mismatch — permanently blanks any
 * strategy the moment its owner ticks a tab, which over a 90-day league is a
 * certainty rather than an edge case. Ticking a tab holding 40 div is not
 * income, but it must not destroy the timeline either.
 */
export function diffSnapshots(a: SnapshotInput, b: SnapshotInput): DiffResult {
  const tabsA = new Set(a.tabIds);
  const tabsB = new Set(b.tabIds);
  const shared = new Set([...tabsA].filter((t) => tabsB.has(t)));
  const scopeChanged = [
    ...[...tabsA].filter((t) => !tabsB.has(t)),
    ...[...tabsB].filter((t) => !tabsA.has(t)),
  ].sort();

  // A line is in scope only if it was seen in a tab both snapshots covered.
  // Lines carry every contributing tab, so a stack split across an included and
  // an excluded tab stays partially in scope — which is correct, because the
  // quantity we can compare is the quantity in the shared tabs.
  const inScope = (l: SnapshotLine) =>
    scopeChanged.length === 0 || l.tabIds.some((t) => shared.has(t));

  const mapA = new Map<string, SnapshotLine>();
  const mapB = new Map<string, SnapshotLine>();
  let outOfScope = 0n;
  const outLines: DiffLine[] = [];

  for (const l of a.lines) {
    if (inScope(l)) mapA.set(l.itemKey, l);
    else {
      outOfScope -= lineValue(l);
      outLines.push(makeScopeLine(l, "before"));
    }
  }
  for (const l of b.lines) {
    if (inScope(l)) mapB.set(l.itemKey, l);
    else {
      outOfScope += lineValue(l);
      outLines.push(makeScopeLine(l, "after"));
    }
  }

  let quantityMicro = 0n;
  let priceMicro = 0n;
  let coverageMicro = outOfScope;
  const lines: DiffLine[] = [...outLines];

  for (const itemKey of new Set([...mapA.keys(), ...mapB.keys()])) {
    const la = mapA.get(itemKey);
    const lb = mapB.get(itemKey);

    const qA = BigInt(la?.qty ?? 0);
    const qB = BigInt(lb?.qty ?? 0);

    // "Absent" and "present but unpriceable" are different things and must not
    // collapse. An item that left the stash is a real quantity change and is
    // valued at the last price we knew; only an item that is still there but
    // lost its price row is a coverage change.
    let pA = la?.unitMicro ?? null;
    let pB = lb?.unitMicro ?? null;
    if (!la) pA = pB;
    if (!lb) pB = pA;

    let quantity = 0n;
    let price = 0n;
    let coverage = 0n;
    let kind: DiffKind;

    if (pA !== null && pB !== null) {
      quantity = (qB - qA) * pB;
      price = qA * (pB - pA);
      kind =
        qB > qA
          ? qA === 0n
            ? "added"
            : "increased"
          : qB < qA
            ? qB === 0n
              ? "removed"
              : "decreased"
            : pA !== pB
              ? "repriced"
              : "unchanged";
    } else if (pA === null && pB !== null) {
      // A poe.ninja category came back, or the listing count rose past the
      // confidence threshold. The item was always there — this is not income.
      coverage = qB * pB;
      kind = "became_priceable";
    } else if (pA !== null && pB === null) {
      coverage = -(qA * pA);
      kind = "became_unpriceable";
    } else {
      // Rare or unmatched on both sides. Emitted with zeros so the UI can show
      // "you gained 3 rares we can't price" without pretending it is worth 0.
      kind = "unpriced";
    }

    quantityMicro += quantity;
    priceMicro += price;
    coverageMicro += coverage;

    if (kind === "unchanged" && quantity === 0n && price === 0n && coverage === 0n) continue;

    const src = lb ?? la!;
    lines.push({
      itemKey,
      displayName: src.displayName,
      icon: src.icon,
      qtyBefore: Number(qA),
      qtyAfter: Number(qB),
      qtyDelta: Number(qB - qA),
      unitBefore: pA,
      unitAfter: pB,
      quantityMicro: quantity,
      priceMicro: price,
      coverageMicro: coverage,
      kind,
    });
  }

  const totalBefore = netWorth(a.lines);
  const totalAfter = netWorth(b.lines);
  const netMicro = quantityMicro + priceMicro + coverageMicro;

  lines.sort((x, y) => {
    const mag = (l: DiffLine) => absBig(l.quantityMicro + l.priceMicro + l.coverageMicro);
    const d = mag(y) - mag(x);
    return d > 0n ? 1 : d < 0n ? -1 : 0;
  });

  return {
    quantityMicro,
    priceMicro,
    coverageMicro,
    netMicro,
    totalBefore,
    totalAfter,
    // Integer arithmetic, so this is exact equality with no tolerance.
    reconciles: netMicro === totalAfter - totalBefore,
    lines,
    scopeChanged,
  };
}

function makeScopeLine(l: SnapshotLine, side: "before" | "after"): DiffLine {
  const v = lineValue(l);
  return {
    itemKey: l.itemKey,
    displayName: l.displayName,
    icon: l.icon,
    qtyBefore: side === "before" ? l.qty : 0,
    qtyAfter: side === "after" ? l.qty : 0,
    qtyDelta: side === "after" ? l.qty : -l.qty,
    unitBefore: side === "before" ? l.unitMicro : null,
    unitAfter: side === "after" ? l.unitMicro : null,
    quantityMicro: 0n,
    priceMicro: 0n,
    coverageMicro: side === "after" ? v : -v,
    kind: "out_of_scope",
  };
}

function absBig(v: bigint): bigint {
  return v < 0n ? -v : v;
}
