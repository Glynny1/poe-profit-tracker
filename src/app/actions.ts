"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession, hashPassword, requireUser, verifyPassword } from "@/lib/session";
import { ImportError, mergeTabs, parseStashJson } from "@/lib/stashImport";
import { createSnapshot } from "@/lib/services/snapshots";
import { getFreshPriceBookId, refreshPriceBook } from "@/lib/services/priceBook";
import { chaosToMicro } from "@/domain/money";
import type { ParsedTab } from "@/domain/snapshot";

export interface ActionState {
  error?: string;
  ok?: string;
}

// --- auth -----------------------------------------------------------------

/**
 * INVITE_CODE accepts a comma-separated list, so different people can be given
 * different codes: your friends one, GGG another while they review the OAuth
 * application. Removing a code later revokes only that route in, without
 * disturbing anyone else's.
 */
function validInviteCodes(): string[] {
  return (process.env.INVITE_CODE ?? "")
    .split(",")
    .map((code) => code.trim())
    .filter(Boolean);
}

export async function register(_prev: ActionState, form: FormData): Promise<ActionState> {
  const username = String(form.get("username") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const invite = String(form.get("invite") ?? "").trim();

  const codes = validInviteCodes();
  if (codes.length === 0) {
    // Otherwise a missing INVITE_CODE reads as "your code is wrong" and sends
    // the user hunting for a typo that isn't there.
    return { error: "No invite codes are configured on this instance, so nobody can register yet." };
  }
  if (!codes.includes(invite)) return { error: "That invite code is not valid." };
  if (username.length < 3) return { error: "Username must be at least 3 characters." };
  if (password.length < 8) return { error: "Password must be at least 8 characters." };

  const existing = await prisma.appUser.findUnique({ where: { username } });
  if (existing) return { error: "That username is taken." };

  const user = await prisma.appUser.create({
    data: { username, passwordHash: await hashPassword(password) },
  });

  const session = await getSession();
  session.userId = user.id;
  await session.save();
  redirect("/setup");
}

export async function login(_prev: ActionState, form: FormData): Promise<ActionState> {
  const username = String(form.get("username") ?? "").trim();
  const password = String(form.get("password") ?? "");

  const user = await prisma.appUser.findUnique({ where: { username } });
  // Same message either way, so this cannot be used to enumerate usernames.
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return { error: "Wrong username or password." };
  }

  const session = await getSession();
  session.userId = user.id;
  await session.save();
  redirect("/");
}

export async function logout() {
  const session = await getSession();
  session.destroy();
  redirect("/login");
}

// --- settings -------------------------------------------------------------

export async function updateSettings(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const haircut = Number(form.get("liquidityHaircutPct"));
  const minCount = Number(form.get("minCount"));

  await prisma.appUser.update({
    where: { id: user.id },
    data: {
      poeAccount: String(form.get("poeAccount") ?? "").trim() || null,
      league: String(form.get("league") ?? "Allflame").trim() || "Allflame",
      displayCurrency: form.get("displayCurrency") === "DIVINE" ? "DIVINE" : "CHAOS",
      liquidityHaircutPct: Number.isFinite(haircut) ? Math.min(100, Math.max(1, haircut)) : 100,
      minCount: Number.isFinite(minCount) ? Math.max(0, minCount) : 5,
    },
  });
  revalidatePath("/", "layout");
  return { ok: "Settings saved." };
}

export async function setCurrency(currency: "CHAOS" | "DIVINE") {
  const user = await requireUser();
  await prisma.appUser.update({ where: { id: user.id }, data: { displayCurrency: currency } });
  revalidatePath("/", "layout");
}

// --- stash import ---------------------------------------------------------

/**
 * Imported tabs are staged, not snapshotted immediately, because the user must
 * choose which of them count (R1) before any value is computed.
 */
async function loadStaged(userId: string, league: string): Promise<ParsedTab[]> {
  const row = await prisma.stagedImport.findUnique({ where: { userId } });
  if (!row || row.league !== league) return [];
  return row.tabs as unknown as ParsedTab[];
}

async function saveStaged(userId: string, league: string, tabs: ParsedTab[]) {
  const data = { league, tabs: tabs as unknown as object };
  await prisma.stagedImport.upsert({ where: { userId }, create: { userId, ...data }, update: data });
}

export async function importStash(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const file = form.get("file");
  let text = String(form.get("json") ?? "").trim();

  if (file instanceof File && file.size > 0) text = await file.text();
  if (!text) return { error: "Paste some JSON or choose a file first." };

  let result;
  try {
    result = parseStashJson(text);
  } catch (e) {
    return { error: e instanceof ImportError ? e.message : "Could not read that JSON." };
  }

  const merged = mergeTabs(await loadStaged(user.id, user.league), result.tabs);
  await saveStaged(user.id, user.league, merged);

  // Persist tab metadata so selection survives a reload, and carries forward to
  // a new league by name rather than making everyone re-tick 15 tabs on day one.
  for (const tab of merged) {
    const carried = await prisma.trackedTab.findFirst({
      where: { userId: user.id, name: tab.name, NOT: { league: user.league } },
      select: { isTracked: true },
    });
    await prisma.trackedTab.upsert({
      where: {
        userId_league_gggTabId: { userId: user.id, league: user.league, gggTabId: tab.tabId },
      },
      create: {
        userId: user.id,
        league: user.league,
        gggTabId: tab.tabId,
        name: tab.name,
        type: tab.type,
        isTracked: carried?.isTracked ?? tab.items.length > 0,
      },
      update: { name: tab.name, type: tab.type },
    });
  }

  revalidatePath("/setup");
  const withItems = merged.filter((t) => t.items.length > 0).length;
  return {
    ok:
      `Loaded ${merged.length} tab${merged.length === 1 ? "" : "s"} ` +
      `(${withItems} with items).` +
      (result.warnings.length ? ` ${result.warnings.join(" ")}` : ""),
  };
}

export async function setTabTracked(tabId: string, tracked: boolean) {
  const user = await requireUser();
  await prisma.trackedTab.updateMany({
    where: { userId: user.id, league: user.league, gggTabId: tabId },
    data: { isTracked: tracked },
  });
  revalidatePath("/setup");
}

export async function takeSnapshot(_prev: ActionState): Promise<ActionState> {
  const user = await requireUser();
  const staged = await loadStaged(user.id, user.league);
  if (staged.length === 0) {
    return { error: "Import your stash JSON first. There is nothing staged to snapshot." };
  }

  const tracked = await prisma.trackedTab.findMany({
    where: { userId: user.id, league: user.league, isTracked: true },
    select: { gggTabId: true },
  });
  const trackedIds = new Set(tracked.map((t) => t.gggTabId));
  const tabs = staged.filter((t) => trackedIds.has(t.tabId));

  if (tabs.length === 0) return { error: "Tick at least one tab to include in tracking." };

  try {
    await createSnapshot({
      userId: user.id,
      league: user.league,
      tabs,
      minCount: user.minCount,
      liquidityHaircutPct: user.liquidityHaircutPct,
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Snapshot failed." };
  }

  revalidatePath("/", "layout");
  redirect("/");
}

// --- prices ---------------------------------------------------------------

export async function refreshPrices(): Promise<void> {
  const user = await requireUser();
  await refreshPriceBook(user.league);
  revalidatePath("/prices");
}

// --- strategies -----------------------------------------------------------

export async function createStrategy(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const name = String(form.get("name") ?? "").trim();
  if (!name) return { error: "Give the strategy a name." };

  // Pin the current snapshot as the baseline, and protect it from any future
  // retention job. Losing a baseline would make the strategy unmeasurable.
  const baseline = await prisma.snapshot.findFirst({
    where: { userId: user.id, league: user.league },
    orderBy: { capturedAt: "desc" },
    select: { id: true },
  });
  if (baseline) {
    await prisma.snapshot.update({ where: { id: baseline.id }, data: { pinned: true } });
  }

  const strategy = await prisma.strategy.create({
    data: {
      userId: user.id,
      league: user.league,
      name,
      notes: String(form.get("notes") ?? "").trim() || null,
      baselineSnapshotId: baseline?.id ?? null,
    },
  });
  redirect(`/strategies/${strategy.id}`);
}

export interface PulledPrice {
  priceKey: string;
  displayName: string;
  icon: string | null;
  /** micro-chaos as a string: BigInt cannot cross the server/client boundary. */
  unitCostMicro: string;
  priceBookId: string;
  found: boolean;
}

/**
 * Look up the current price of several items at once.
 *
 * Doing the whole basket in one go is the point: every row is then frozen at the
 * same instant against the same price book, so a cost sheet built over ten
 * minutes of typing doesn't end up with rows priced ten minutes apart.
 */
export async function pullLivePrices(
  strategyId: string,
  priceKeys: string[],
): Promise<{ prices: PulledPrice[]; error?: string }> {
  const user = await requireUser();
  const strategy = await prisma.strategy.findFirst({
    where: { id: strategyId, userId: user.id },
    select: { league: true },
  });
  if (!strategy) return { prices: [], error: "Strategy not found." };

  const keys = [...new Set(priceKeys.filter(Boolean))].slice(0, 200);
  if (keys.length === 0) return { prices: [] };

  const priceBookId = await getFreshPriceBookId(strategy.league);
  const rows = await prisma.price.findMany({
    where: { priceBookId, priceKey: { in: keys } },
    select: { priceKey: true, displayName: true, icon: true, chaosMicro: true },
  });
  const byKey = new Map(rows.map((r) => [r.priceKey, r]));

  return {
    prices: keys.map((priceKey) => {
      const row = byKey.get(priceKey);
      return {
        priceKey,
        displayName: row?.displayName ?? priceKey,
        icon: row?.icon ?? null,
        unitCostMicro: (row?.chaosMicro ?? 0n).toString(),
        priceBookId,
        found: !!row,
      };
    }),
  };
}

export interface BatchInput {
  priceKey: string;
  displayName: string;
  icon?: string | null;
  qty: number;
  /** micro-chaos as a string, exactly as shown to the user before they committed. */
  unitCostMicro: string;
  priceBookId?: string;
  isManualOverride: boolean;
}

/**
 * Commit a whole basket of inputs at once (S2 + S3).
 *
 * The figure stored is the one the client was displaying, not a fresh lookup.
 * Re-reading the price here would mean the number you saw before pressing the
 * button is not the number that got frozen, which is exactly the class of
 * surprise this feature exists to prevent. An arbitrary value is acceptable
 * because a manual override is a supported feature; it is only bounded so a
 * malformed one cannot be stored.
 */
export async function addStrategyInputs(
  strategyId: string,
  inputs: BatchInput[],
): Promise<ActionState> {
  const user = await requireUser();
  const strategy = await prisma.strategy.findFirst({
    where: { id: strategyId, userId: user.id },
    select: { id: true },
  });
  if (!strategy) return { error: "Strategy not found." };
  if (inputs.length === 0) return { error: "Nothing to add." };

  const rows = [];
  for (const i of inputs) {
    if (!i.priceKey) return { error: "One of the rows has no item selected." };
    const qty = Math.round(Number(i.qty));
    if (!Number.isFinite(qty) || qty <= 0) {
      return { error: `Quantity for "${i.displayName}" must be a positive number.` };
    }
    let micro: bigint;
    try {
      micro = BigInt(i.unitCostMicro);
    } catch {
      return { error: `Could not read the price for "${i.displayName}".` };
    }
    if (micro < 0n) return { error: `Price for "${i.displayName}" cannot be negative.` };

    rows.push({
      strategyId,
      priceKey: i.priceKey,
      displayName: i.displayName,
      icon: i.icon ?? null,
      qty,
      unitCostMicro: micro,
      priceBookId: i.priceBookId ?? null,
      isManualOverride: i.isManualOverride,
    });
  }

  await prisma.strategyInput.createMany({ data: rows });

  revalidatePath(`/strategies/${strategyId}`);
  return { ok: `Added ${rows.length} item${rows.length === 1 ? "" : "s"} at frozen prices.` };
}

/**
 * Stage stash JSON against a strategy, ready for finishRun.
 *
 * Shares the same staging area as the Import screen, so a stash that needs
 * several pastes accumulates the same way here.
 */
export async function importForRun(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const strategyId = String(form.get("strategyId") ?? "");
  const file = form.get("file");
  let text = String(form.get("json") ?? "").trim();

  if (file instanceof File && file.size > 0) text = await file.text();
  if (!text) return { error: "Paste the stash JSON or choose a file first." };

  let result;
  try {
    result = parseStashJson(text);
  } catch (e) {
    return { error: e instanceof ImportError ? e.message : "Could not read that JSON." };
  }

  const merged = mergeTabs(await loadStaged(user.id, user.league), result.tabs);
  await saveStaged(user.id, user.league, merged);

  revalidatePath(`/strategies/${strategyId}`);
  const withItems = merged.filter((t) => t.items.length > 0).length;
  return {
    ok:
      `Ready: ${withItems} tab${withItems === 1 ? "" : "s"} with items staged. ` +
      `Paste more tabs if you need to, then finish the run.`,
  };
}

/**
 * Close a strategy by snapshotting the stash and comparing it to the baseline.
 *
 * Both snapshots are pinned: the whole point of a finished run is being able to
 * look at it later, and a retention job reclaiming either end would make it
 * unmeasurable.
 */
export async function finishRun(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const strategyId = String(form.get("strategyId") ?? "");

  const strategy = await prisma.strategy.findFirst({
    where: { id: strategyId, userId: user.id },
  });
  if (!strategy) return { error: "Strategy not found." };
  if (!strategy.baselineSnapshotId) {
    return {
      error:
        "This strategy has no baseline snapshot, so there is nothing to compare against. " +
        "It was started before you had taken any snapshot.",
    };
  }

  const staged = await loadStaged(user.id, user.league);
  if (staged.length === 0) {
    return { error: "Import your stash JSON above first, so there is something to compare." };
  }

  // Tabs chosen on this screen win. Falling back to the globally tracked set
  // keeps the button working if the checkboxes never rendered.
  const chosen = form.getAll("tabIds").map(String).filter(Boolean);
  let wanted: Set<string>;
  if (chosen.length > 0) {
    wanted = new Set(chosen);
  } else {
    const tracked = await prisma.trackedTab.findMany({
      where: { userId: user.id, league: user.league, isTracked: true },
      select: { gggTabId: true },
    });
    wanted = new Set(tracked.map((t) => t.gggTabId));
  }

  const tabs = staged.filter((t) => wanted.has(t.tabId));
  if (tabs.length === 0) {
    return { error: "Tick at least one tab to include in the closing snapshot." };
  }

  let endSnapshotId: string;
  try {
    const { snapshot } = await createSnapshot({
      userId: user.id,
      league: user.league,
      tabs,
      minCount: user.minCount,
      liquidityHaircutPct: user.liquidityHaircutPct,
      pinned: true,
    });
    endSnapshotId = snapshot.id;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not take the closing snapshot." };
  }

  await prisma.snapshot.update({
    where: { id: strategy.baselineSnapshotId },
    data: { pinned: true },
  });
  await prisma.strategy.update({
    where: { id: strategyId },
    data: { endSnapshotId, endedAt: new Date() },
  });

  revalidatePath(`/strategies/${strategyId}`);
  return { ok: "Run finished. Everything that changed is listed below." };
}

/** Re-open a finished run, for when the closing snapshot was taken too early. */
export async function reopenRun(strategyId: string) {
  const user = await requireUser();
  await prisma.strategy.updateMany({
    where: { id: strategyId, userId: user.id },
    data: { endSnapshotId: null, endedAt: null },
  });
  revalidatePath(`/strategies/${strategyId}`);
}

export async function deleteStrategyInput(id: string) {
  const user = await requireUser();
  const input = await prisma.strategyInput.findUnique({
    where: { id },
    include: { strategy: { select: { userId: true, id: true } } },
  });
  if (input?.strategy.userId !== user.id) return;
  await prisma.strategyInput.delete({ where: { id } });
  revalidatePath(`/strategies/${input.strategy.id}`);
}

export async function setMapsRun(strategyId: string, mapsRun: number) {
  const user = await requireUser();
  await prisma.strategy.updateMany({
    where: { id: strategyId, userId: user.id },
    data: { mapsRun: Math.max(0, Math.round(mapsRun)) },
  });
  revalidatePath(`/strategies/${strategyId}`);
}

export async function closeStrategy(strategyId: string) {
  const user = await requireUser();
  const end = await prisma.snapshot.findFirst({
    where: { userId: user.id },
    orderBy: { capturedAt: "desc" },
    select: { id: true },
  });
  if (end) await prisma.snapshot.update({ where: { id: end.id }, data: { pinned: true } });
  await prisma.strategy.updateMany({
    where: { id: strategyId, userId: user.id },
    data: { endedAt: new Date(), endSnapshotId: end?.id ?? null },
  });
  revalidatePath(`/strategies/${strategyId}`);
}

export async function setStrategyShared(strategyId: string, shared: boolean) {
  const user = await requireUser();
  await prisma.strategy.updateMany({ where: { id: strategyId, userId: user.id }, data: { shared } });
  revalidatePath(`/strategies/${strategyId}`);
}

// --- sales ----------------------------------------------------------------

/**
 * Record a realised sale (S4), freezing the price at this instant.
 *
 * `strategyId` is optional on purpose: most trades happen outside a strategy,
 * and a Sale is the ONLY mechanism that gives the app a realised price. A stash
 * diff can never distinguish sold from vendored from consumed.
 */
export async function recordSale(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const priceKey = String(form.get("priceKey") ?? "");
  const strategyId = String(form.get("strategyId") ?? "") || null;
  const qty = Number(form.get("qty"));
  const overrideChaos = String(form.get("overrideChaos") ?? "").trim();

  if (!priceKey) return { error: "Pick an item." };
  if (!Number.isFinite(qty) || qty <= 0) return { error: "Quantity must be a positive number." };

  const priceBookId = await getFreshPriceBookId(user.league);
  const price = await prisma.price.findUnique({
    where: { priceBookId_priceKey: { priceBookId, priceKey } },
  });

  const manual = overrideChaos !== "";
  const unitPriceMicro = manual ? chaosToMicro(Number(overrideChaos)) : (price?.chaosMicro ?? 0n);
  if (!manual && !price) {
    return { error: "No current price for that item. Enter what you actually sold it for." };
  }

  await prisma.sale.create({
    data: {
      userId: user.id,
      strategyId,
      priceKey,
      displayName: price?.displayName ?? priceKey,
      icon: price?.icon,
      qty: Math.round(qty),
      unitPriceMicro,
      priceBookId,
      isManualOverride: manual,
      note: String(form.get("note") ?? "").trim() || null,
    },
  });

  revalidatePath("/", "layout");
  return { ok: "Sale recorded at today's price." };
}

export async function deleteSale(id: string) {
  const user = await requireUser();
  const sale = await prisma.sale.findUnique({ where: { id }, select: { userId: true } });
  if (sale?.userId !== user.id) return;
  await prisma.sale.delete({ where: { id } });
  revalidatePath("/", "layout");
}
