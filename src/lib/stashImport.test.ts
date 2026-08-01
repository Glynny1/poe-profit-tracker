import { describe, expect, it } from "vitest";
import { ImportError, mergeTabs, parseStashJson } from "./stashImport";

const item = { name: "", typeLine: "Chaos Orb", baseType: "Chaos Orb", stackSize: 10, frameType: 5 };

describe("parseStashJson", () => {
  it("reads a single-stash response", () => {
    const r = parseStashJson(
      JSON.stringify({ stash: { id: "abc", name: "Currency", type: "CurrencyStash", items: [item] } }),
    );
    expect(r.tabs).toHaveLength(1);
    expect(r.tabs[0].items).toHaveLength(1);
  });

  it("reads a tab-list response and warns that it carries no items", () => {
    const r = parseStashJson(
      JSON.stringify({ stashes: [{ id: "a", name: "One", type: "PremiumStash" }] }),
    );
    expect(r.emptyTabs).toBe(1);
    expect(r.warnings.join(" ")).toContain("never returns items");
  });

  it("digs sub-tabs out of a parent wrapper", () => {
    // Requesting a child returns the PARENT with the child inside children[].
    const r = parseStashJson(
      JSON.stringify({
        stash: {
          id: "map",
          name: "Maps",
          type: "MapStash",
          children: [{ id: "map-t16", name: "T16", type: "MapStash", items: [item] }],
        },
      }),
    );
    expect(r.tabs.map((t) => t.tabId)).toContain("map-t16");
  });

  it("skips folders but keeps their contents", () => {
    const r = parseStashJson(
      JSON.stringify([
        {
          id: "f1",
          name: "Folder",
          type: "Folder",
          children: [{ id: "t1", name: "Inside", type: "PremiumStash", items: [item] }],
        },
      ]),
    );
    expect(r.tabs).toHaveLength(1);
    expect(r.tabs[0].tabId).toBe("t1");
  });

  it("reads the legacy get-stash-items shape", () => {
    const r = parseStashJson(
      JSON.stringify({
        numTabs: 2,
        tabIndex: 1,
        tabs: [
          { id: "x", n: "First", type: "PremiumStash" },
          { id: "y", n: "Second", type: "CurrencyStash" },
        ],
        items: [item],
      }),
    );
    expect(r.tabs[1].items).toHaveLength(1);
    expect(r.tabs[0].items).toHaveLength(0);
    expect(r.warnings.join(" ")).toContain("only carries the items of one");
  });

  it("rejects malformed JSON with an actionable message", () => {
    expect(() => parseStashJson("{not json")).toThrow(ImportError);
  });

  it("rejects JSON that contains no tabs", () => {
    expect(() => parseStashJson(JSON.stringify({ hello: "world" }))).toThrow(ImportError);
  });
});

describe("mergeTabs", () => {
  it("lets a later import replace a tab's contents", () => {
    const a = [{ tabId: "t1", name: "One", type: "P", items: [] }];
    const b = [{ tabId: "t1", name: "One", type: "P", items: [item] }];
    expect(mergeTabs(a, b)[0].items).toHaveLength(1);
  });

  it("does not let a tab-list import blank a tab we already loaded", () => {
    const a = [{ tabId: "t1", name: "Old", type: "P", items: [item] }];
    const b = [{ tabId: "t1", name: "Renamed", type: "P", items: [] }];
    const merged = mergeTabs(a, b);
    expect(merged[0].items).toHaveLength(1);
    expect(merged[0].name).toBe("Renamed");
  });

  it("accumulates tabs pasted one at a time", () => {
    let acc = mergeTabs([], [{ tabId: "t1", name: "A", type: "P", items: [item] }]);
    acc = mergeTabs(acc, [{ tabId: "t2", name: "B", type: "P", items: [item] }]);
    expect(acc).toHaveLength(2);
  });
});
