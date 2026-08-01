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

/**
 * Add an input to a strategy, freezing its price at this instant (S3).
 * The frozen figure is COPIED onto the row. There is deliberately no join back
 * to a live price, because that is precisely the bug this feature exists to avoid.
 */
export async function addStrategyInput(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const strategyId = String(form.get("strategyId") ?? "");
  const priceKey = String(form.get("priceKey") ?? "");
  const qty = Number(form.get("qty"));
  const overrideChaos = String(form.get("overrideChaos") ?? "").trim();

  if (!priceKey) return { error: "Pick an item." };
  if (!Number.isFinite(qty) || qty <= 0) return { error: "Quantity must be a positive number." };

  const strategy = await prisma.strategy.findFirst({
    where: { id: strategyId, userId: user.id },
  });
  if (!strategy) return { error: "Strategy not found." };

  const priceBookId = await getFreshPriceBookId(strategy.league);
  const price = await prisma.price.findUnique({
    where: { priceBookId_priceKey: { priceBookId, priceKey } },
  });

  const manual = overrideChaos !== "";
  const unitCostMicro = manual ? chaosToMicro(Number(overrideChaos)) : (price?.chaosMicro ?? 0n);
  if (!manual && !price) {
    return { error: "That item has no current price. Enter what you actually paid instead." };
  }

  await prisma.strategyInput.create({
    data: {
      strategyId,
      priceKey,
      displayName: price?.displayName ?? priceKey,
      icon: price?.icon,
      qty: Math.round(qty),
      unitCostMicro,
      priceBookId,
      isManualOverride: manual,
    },
  });

  revalidatePath(`/strategies/${strategyId}`);
  return { ok: "Cost recorded at today's price." };
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
