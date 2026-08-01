/**
 * Parsing pasted / uploaded stash JSON into `ParsedTab[]`.
 *
 * This is the `ImportStashSource` adapter. It deliberately accepts every shape a
 * user could plausibly arrive with, because the alternative is a support burden
 * of "it says invalid JSON and I don't know why":
 *
 *   - `{ stashes: [...] }`               GET /stash/<league>            (no items)
 *   - `{ stash: {...} }`                 GET /stash/<league>/<id>
 *   - `{ tabs: [...], items: [...] }`    legacy get-stash-items
 *   - `{ items: [...] }`                 legacy, single tab
 *   - `[ {...}, {...} ]`                 a bare array of tabs
 *
 * When OAuth or the session-cookie adapter lands, they produce the same
 * `ParsedTab[]` and everything downstream is untouched.
 */

import type { ParsedTab } from "@/domain/snapshot";
import type { StashItem, StashTab } from "@/domain/types";

export interface ImportResult {
  tabs: ParsedTab[];
  /** Tabs that exist but carry no items, usually a tab list fetched without contents. */
  emptyTabs: number;
  warnings: string[];
}

export class ImportError extends Error {}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function tabFrom(raw: StashTab, fallbackIndex: number): ParsedTab {
  return {
    tabId: raw.id ?? `idx-${fallbackIndex}`,
    name: raw.name ?? `Tab ${fallbackIndex + 1}`,
    type: raw.type ?? "NormalStash",
    items: Array.isArray(raw.items) ? raw.items : [],
  };
}

/**
 * Flatten a tab and its children. Map and Unique sub-tabs only ever appear
 * inside their parent's reply, never in a top-level list, so a walk that
 * ignored `children` would silently drop everything in them.
 */
function collect(raw: StashTab, out: ParsedTab[], depth = 0) {
  if (depth > 4) return;
  if (raw.type !== "Folder") out.push(tabFrom(raw, out.length));
  for (const child of raw.children ?? []) collect(child, out, depth + 1);
}

export function parseStashJson(text: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ImportError(
      "That is not valid JSON. Paste the whole response, starting with { and ending with }.",
    );
  }

  const warnings: string[] = [];
  const tabs: ParsedTab[] = [];

  const root = asRecord(parsed);

  if (Array.isArray(parsed)) {
    for (const t of parsed as StashTab[]) collect(t, tabs);
  } else if (root && Array.isArray(root.stashes)) {
    for (const t of root.stashes as StashTab[]) collect(t, tabs);
  } else if (root && asRecord(root.stash)) {
    collect(root.stash as StashTab, tabs);
  } else if (root && Array.isArray(root.tabs)) {
    // Legacy get-stash-items: `tabs` describes the tabs, `items` holds ONE tab's
    // contents (whichever tabIndex was requested).
    const legacyTabs = root.tabs as Array<Record<string, unknown>>;
    const items = Array.isArray(root.items) ? (root.items as StashItem[]) : [];
    const activeIndex = typeof root.tabIndex === "number" ? root.tabIndex : 0;

    legacyTabs.forEach((t, i) => {
      tabs.push({
        tabId: String(t.id ?? `idx-${i}`),
        name: String(t.n ?? t.name ?? `Tab ${i + 1}`),
        type: String(t.type ?? "NormalStash"),
        items: i === activeIndex ? items : [],
      });
    });
    if (legacyTabs.length > 1) {
      warnings.push(
        `This response describes ${legacyTabs.length} tabs but only carries the items of one ` +
          `(tab ${activeIndex + 1}). Import each tab's response in turn, or the others will ` +
          `look empty.`,
      );
    }
  } else if (root && Array.isArray(root.items)) {
    tabs.push({
      tabId: String(root.id ?? "imported"),
      name: String(root.name ?? "Imported tab"),
      type: String(root.type ?? "NormalStash"),
      items: root.items as StashItem[],
    });
  } else {
    throw new ImportError(
      "Could not find any stash tabs in that JSON. Expected an object with " +
        '"stashes", "stash", "tabs" or "items".',
    );
  }

  if (tabs.length === 0) throw new ImportError("That JSON contained no stash tabs.");

  const emptyTabs = tabs.filter((t) => t.items.length === 0).length;
  if (emptyTabs === tabs.length) {
    // The tab-list endpoint never includes items, and this is by far the most
    // common import mistake.
    warnings.push(
      "None of these tabs contain any items. The tab-list endpoint " +
        "(/stash/<league>) never returns items. You need each tab's own " +
        "response (/stash/<league>/<tab id>).",
    );
  }

  return { tabs, emptyTabs, warnings };
}

/**
 * Merge repeated imports into one set of tabs, so a user can paste one tab at a
 * time and still end up with a complete snapshot. Later imports win for a tab id.
 */
export function mergeTabs(existing: ParsedTab[], incoming: ParsedTab[]): ParsedTab[] {
  const byId = new Map(existing.map((t) => [t.tabId, t]));
  for (const t of incoming) {
    const prev = byId.get(t.tabId);
    // A tab-list import carries no items; it must not blank a tab we already have.
    if (prev && t.items.length === 0 && prev.items.length > 0) {
      byId.set(t.tabId, { ...prev, name: t.name, type: t.type });
    } else {
      byId.set(t.tabId, t);
    }
  }
  return [...byId.values()];
}
