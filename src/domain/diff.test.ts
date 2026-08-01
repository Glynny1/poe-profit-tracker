import { describe, expect, it } from "vitest";
import { diffSnapshots, netWorth, type SnapshotInput } from "./diff";
import type { SnapshotLine } from "./types";

const C = 1_000_000n; // one chaos in micro-chaos

function line(p: Partial<SnapshotLine> & { itemKey: string }): SnapshotLine {
  return {
    priceKey: p.itemKey,
    displayName: p.itemKey,
    qty: 1,
    unitMicro: C,
    isFungible: true,
    tabIds: ["tab1"],
    ...p,
  };
}

function snap(lines: SnapshotLine[], tabIds = ["tab1"]): SnapshotInput {
  return { lines, tabIds };
}

/** The invariant the whole design rests on. */
function expectReconciles(r: ReturnType<typeof diffSnapshots>) {
  expect(r.reconciles).toBe(true);
  expect(r.quantityMicro + r.priceMicro + r.coverageMicro).toBe(
    r.totalAfter - r.totalBefore,
  );
}

describe("three-term decomposition", () => {
  it("reports pure quantity gain as profit, with zero drift", () => {
    const a = snap([line({ itemKey: "cur:chaos orb", qty: 100 })]);
    const b = snap([line({ itemKey: "cur:chaos orb", qty: 200 })]);
    const r = diffSnapshots(a, b);

    expect(r.quantityMicro).toBe(100n * C);
    expect(r.priceMicro).toBe(0n);
    expect(r.coverageMicro).toBe(0n);
    expectReconciles(r);
  });

  it("attributes a pure price move to drift, never to profit", () => {
    const a = snap([line({ itemKey: "cur:divine orb", qty: 10, unitMicro: 100n * C })]);
    const b = snap([line({ itemKey: "cur:divine orb", qty: 10, unitMicro: 170n * C })]);
    const r = diffSnapshots(a, b);

    expect(r.quantityMicro).toBe(0n);
    expect(r.priceMicro).toBe(700n * C);
    expectReconciles(r);
  });

  it("splits a simultaneous quantity and price change exactly", () => {
    // 10 @ 100c -> 15 @ 170c. Net worth 1000c -> 2550c.
    // Gained 5 valued at the NEW price = 850c. Drift on the 10 held = 700c.
    const a = snap([line({ itemKey: "cur:divine orb", qty: 10, unitMicro: 100n * C })]);
    const b = snap([line({ itemKey: "cur:divine orb", qty: 15, unitMicro: 170n * C })]);
    const r = diffSnapshots(a, b);

    expect(r.quantityMicro).toBe(850n * C);
    expect(r.priceMicro).toBe(700n * C);
    expect(r.totalAfter - r.totalBefore).toBe(1550n * C);
    expectReconciles(r);
  });

  it("holds the identity for a loss", () => {
    const a = snap([line({ itemKey: "cur:chaos orb", qty: 500 })]);
    const b = snap([line({ itemKey: "cur:chaos orb", qty: 120 })]);
    const r = diffSnapshots(a, b);

    expect(r.quantityMicro).toBe(-380n * C);
    expectReconciles(r);
  });

  it("labels a stack that disappeared entirely as removed, not sold", () => {
    const a = snap([line({ itemKey: "cur:chaos orb", qty: 5 })]);
    const b = snap([]);
    const r = diffSnapshots(a, b);

    expect(r.lines[0].kind).toBe("removed");
    expect(r.quantityMicro).toBe(-5n * C);
    expectReconciles(r);
  });

  it("nets a sale to roughly zero, which is correct", () => {
    // Sell one 200c scarab for 200 chaos: -1 scarab, +200 chaos.
    const a = snap([
      line({ itemKey: "cur:horned scarab", qty: 1, unitMicro: 200n * C }),
      line({ itemKey: "cur:chaos orb", qty: 0 }),
    ]);
    const b = snap([
      line({ itemKey: "cur:horned scarab", qty: 0, unitMicro: 200n * C }),
      line({ itemKey: "cur:chaos orb", qty: 200 }),
    ]);
    const r = diffSnapshots(a, b);

    expect(r.quantityMicro).toBe(0n);
    expectReconciles(r);
  });
});

describe("identity invariants", () => {
  it("shows zero delta when a stack moves between tabs", () => {
    const a = snap(
      [line({ itemKey: "cur:chaos orb", qty: 100, tabIds: ["tab1"] })],
      ["tab1", "tab2"],
    );
    const b = snap(
      [line({ itemKey: "cur:chaos orb", qty: 100, tabIds: ["tab2"] })],
      ["tab1", "tab2"],
    );
    const r = diffSnapshots(a, b);

    expect(r.quantityMicro).toBe(0n);
    expect(r.priceMicro).toBe(0n);
    expect(r.coverageMicro).toBe(0n);
    expectReconciles(r);
  });

  it("shows zero delta when one stack splits across three tabs", () => {
    // buildSnapshot sums per key before diffing, so the split arrives as one
    // line carrying three tab ids.
    const a = snap([line({ itemKey: "cur:chaos orb", qty: 300, tabIds: ["t1"] })], [
      "t1",
      "t2",
      "t3",
    ]);
    const b = snap(
      [line({ itemKey: "cur:chaos orb", qty: 300, tabIds: ["t1", "t2", "t3"] })],
      ["t1", "t2", "t3"],
    );
    const r = diffSnapshots(a, b);

    expect(r.quantityMicro).toBe(0n);
    expectReconciles(r);
  });
});

describe("pricing coverage", () => {
  it("does not book a newly priceable item as income", () => {
    const a = snap([line({ itemKey: "cur:odd thing", qty: 10, unitMicro: null })]);
    const b = snap([line({ itemKey: "cur:odd thing", qty: 10, unitMicro: 50n * C })]);
    const r = diffSnapshots(a, b);

    expect(r.quantityMicro).toBe(0n);
    expect(r.coverageMicro).toBe(500n * C);
    expect(r.lines[0].kind).toBe("became_priceable");
    expectReconciles(r);
  });

  it("does not book a category going missing as a loss", () => {
    const a = snap([line({ itemKey: "cur:odd thing", qty: 10, unitMicro: 50n * C })]);
    const b = snap([line({ itemKey: "cur:odd thing", qty: 10, unitMicro: null })]);
    const r = diffSnapshots(a, b);

    expect(r.quantityMicro).toBe(0n);
    expect(r.coverageMicro).toBe(-500n * C);
    expectReconciles(r);
  });

  it("keeps unpriced items visible with zero value on both sides", () => {
    const a = snap([]);
    const b = snap([
      line({ itemKey: "h:abc", qty: 3, unitMicro: null, isFungible: false, priceKey: null }),
    ]);
    const r = diffSnapshots(a, b);

    expect(r.quantityMicro).toBe(0n);
    expect(r.lines[0].kind).toBe("unpriced");
    expect(r.lines[0].qtyDelta).toBe(3);
    expectReconciles(r);
  });
});

describe("tab selection changes", () => {
  it("routes a newly tracked tab into coverage, not profit", () => {
    const a = snap([line({ itemKey: "cur:chaos orb", qty: 10, tabIds: ["t1"] })], ["t1"]);
    const b = snap(
      [
        line({ itemKey: "cur:chaos orb", qty: 10, tabIds: ["t1"] }),
        line({ itemKey: "cur:divine orb", qty: 40, unitMicro: 170n * C, tabIds: ["t2"] }),
      ],
      ["t1", "t2"],
    );
    const r = diffSnapshots(a, b);

    // Ticking a tab holding 40 div is not income.
    expect(r.quantityMicro).toBe(0n);
    expect(r.coverageMicro).toBe(6800n * C);
    expect(r.scopeChanged).toEqual(["t2"]);
    expectReconciles(r);
  });

  it("still diffs the shared tabs when the tracked set changes", () => {
    // The timeline must survive a tab being unticked, or every strategy pinned
    // to an older baseline would go permanently blank.
    const a = snap(
      [
        line({ itemKey: "cur:chaos orb", qty: 10, tabIds: ["t1"] }),
        line({ itemKey: "cur:divine orb", qty: 5, unitMicro: 170n * C, tabIds: ["t2"] }),
      ],
      ["t1", "t2"],
    );
    const b = snap([line({ itemKey: "cur:chaos orb", qty: 60, tabIds: ["t1"] })], ["t1"]);
    const r = diffSnapshots(a, b);

    expect(r.quantityMicro).toBe(50n * C); // real gain in the shared tab
    expect(r.coverageMicro).toBe(-850n * C); // the untracked tab, not a loss
    expectReconciles(r);
  });
});

describe("one line per item key", () => {
  // DiffLine's primary key is (diffId, itemKey). Emitting a key twice is not a
  // cosmetic duplicate, it's a unique-constraint violation that kills the whole
  // insert, and it took down the dashboard.
  const noDuplicateKeys = (r: ReturnType<typeof diffSnapshots>) => {
    const keys = r.lines.map((l) => l.itemKey);
    expect(new Set(keys).size).toBe(keys.length);
  };

  it("emits one line when an item is out of scope on BOTH sides", () => {
    const a = snap(
      [
        line({ itemKey: "cur:chaos orb", qty: 10, tabIds: ["t1"] }),
        line({ itemKey: "cur:divine orb", qty: 5, unitMicro: 170n * C, tabIds: ["t2"] }),
      ],
      ["t1", "t2"],
    );
    const b = snap(
      [
        line({ itemKey: "cur:chaos orb", qty: 10, tabIds: ["t1"] }),
        line({ itemKey: "cur:divine orb", qty: 8, unitMicro: 170n * C, tabIds: ["t2"] }),
      ],
      ["t1", "t3"],
    );
    const r = diffSnapshots(a, b);

    noDuplicateKeys(r);
    expect(r.quantityMicro).toBe(0n);
    expectReconciles(r);
  });

  it("emits one line when an item is in scope in A but not in B", () => {
    const a = snap([line({ itemKey: "cur:divine orb", qty: 5, unitMicro: 170n * C, tabIds: ["t1"] })], [
      "t1",
      "t2",
    ]);
    const b = snap([line({ itemKey: "cur:divine orb", qty: 5, unitMicro: 170n * C, tabIds: ["t2"] })], [
      "t2",
      "t3",
    ]);
    const r = diffSnapshots(a, b);

    noDuplicateKeys(r);
    expect(r.lines[0].kind).toBe("out_of_scope");
    expectReconciles(r);
  });

  it("stays unique across a messy mix of scope changes", () => {
    const a = snap(
      [
        line({ itemKey: "cur:chaos orb", qty: 100, tabIds: ["t1"] }),
        line({ itemKey: "cur:divine orb", qty: 5, unitMicro: 170n * C, tabIds: ["t2"] }),
        line({ itemKey: "cur:scarab", qty: 40, unitMicro: 2n * C, tabIds: ["t2", "t3"] }),
        line({ itemKey: "h:rare", qty: 2, unitMicro: null, tabIds: ["t3"], isFungible: false }),
      ],
      ["t1", "t2", "t3"],
    );
    const b = snap(
      [
        line({ itemKey: "cur:chaos orb", qty: 250, tabIds: ["t1"] }),
        line({ itemKey: "cur:divine orb", qty: 9, unitMicro: 170n * C, tabIds: ["t4"] }),
        line({ itemKey: "cur:scarab", qty: 10, unitMicro: 2n * C, tabIds: ["t4"] }),
        line({ itemKey: "h:rare", qty: 3, unitMicro: null, tabIds: ["t1"], isFungible: false }),
      ],
      ["t1", "t4"],
    );
    const r = diffSnapshots(a, b);

    noDuplicateKeys(r);
    expectReconciles(r);
  });
});

describe("reconciliation", () => {
  it("is exact across a messy realistic interval", () => {
    const a = snap(
      [
        line({ itemKey: "cur:chaos orb", qty: 1200 }),
        line({ itemKey: "cur:divine orb", qty: 8, unitMicro: 142n * C }),
        line({ itemKey: "cur:horned scarab", qty: 45, unitMicro: 2_440_000n }),
        line({ itemKey: "u:deadbeef", qty: 1, unitMicro: 89_358n * C, isFungible: false }),
        line({ itemKey: "h:nope", qty: 12, unitMicro: null, isFungible: false }),
      ],
      ["t1"],
    );
    const b = snap(
      [
        line({ itemKey: "cur:chaos orb", qty: 940 }),
        line({ itemKey: "cur:divine orb", qty: 11, unitMicro: 169_800_000n }),
        line({ itemKey: "cur:horned scarab", qty: 120, unitMicro: 2_110_000n }),
        line({ itemKey: "cur:fruiting astrolabe", qty: 3, unitMicro: 152_200_000n }),
        line({ itemKey: "h:nope", qty: 19, unitMicro: null, isFungible: false }),
      ],
      ["t1"],
    );
    const r = diffSnapshots(a, b);

    expectReconciles(r);
    expect(r.netMicro).toBe(netWorth(b.lines) - netWorth(a.lines));
  });

  it("guarantees zero drift when both sides used the same price book", () => {
    // A free permanent invariant: identical unit prices cannot produce drift.
    const unit = 7_777_777n;
    const a = snap([line({ itemKey: "cur:x", qty: 13, unitMicro: unit })]);
    const b = snap([line({ itemKey: "cur:x", qty: 91, unitMicro: unit })]);
    const r = diffSnapshots(a, b);

    expect(r.priceMicro).toBe(0n);
    expectReconciles(r);
  });
});
