/* eslint-disable @next/next/no-img-element */
import type { CurrencyIconSet } from "@/components/Coin";
import { ChaosAndDivine } from "@/components/Coin";
import { Alert, Empty, Stat } from "@/components/ui";

export interface RunLine {
  itemKey: string;
  displayName: string;
  icon: string | null;
  qtyDelta: number;
  quantityMicro: bigint;
}

/**
 * What the stash actually did across a run.
 *
 * Gains and losses are listed separately because they answer different
 * questions: what dropped, and what got consumed. The headline is the net of
 * the two, which is the only figure that is true regardless of how the two
 * lists are read.
 */
export function RunResult({
  gains,
  losses,
  netMicro,
  driftMicro,
  coverageMicro,
  reconciles,
  divineRateMicro,
  icons,
  mapsRun,
}: {
  gains: RunLine[];
  losses: RunLine[];
  netMicro: bigint;
  driftMicro: bigint;
  coverageMicro: bigint;
  reconciles: boolean;
  divineRateMicro: bigint;
  icons: CurrencyIconSet;
  mapsRun: number;
}) {
  const gained = gains.reduce((t, l) => t + l.quantityMicro, 0n);
  const lost = losses.reduce((t, l) => t + l.quantityMicro, 0n);
  const perMap = mapsRun > 0 ? netMicro / BigInt(mapsRun) : null;

  return (
    <div className="space-y-6">
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Came in"
          value={<ChaosAndDivine micro={gained} divineRateMicro={divineRateMicro} icons={icons} />}
          tone="gain"
          hint={`${gains.length} item${gains.length === 1 ? "" : "s"}`}
        />
        <Stat
          label="Went out"
          value={<ChaosAndDivine micro={lost} divineRateMicro={divineRateMicro} icons={icons} />}
          tone="loss"
          hint="Consumed, sold or traded away"
        />
        <Stat
          label="Net from the run"
          value={<ChaosAndDivine micro={netMicro} divineRateMicro={divineRateMicro} icons={icons} />}
          tone={netMicro >= 0n ? "gain" : "loss"}
          hint={
            perMap == null
              ? "Set maps run for a per-map figure"
              : `${(Number(perMap) / 1_000_000).toLocaleString("en-GB", { maximumFractionDigits: 1 })} c per map`
          }
        />
        <Stat
          label="Market drift"
          value={
            <ChaosAndDivine micro={driftMicro} divineRateMicro={divineRateMicro} icons={icons} />
          }
          tone="drift"
          hint="Prices moved, excluded from the net"
        />
      </div>

      {!reconciles && (
        <Alert kind="warn">
          These figures do not balance against the change in net worth, so they cannot be trusted.
          That is a bug rather than a data quirk.
        </Alert>
      )}

      {coverageMicro !== 0n && (
        <Alert kind="warn">
          Some of the change came from tabs that were not tracked at both ends of the run, or items
          that gained or lost a price. That part is excluded from the net above, because it is not
          something the run produced.
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <RunColumn title="What came in" lines={gains} tone="gain" divineRateMicro={divineRateMicro} icons={icons} />
        <RunColumn title="What went out" lines={losses} tone="loss" divineRateMicro={divineRateMicro} icons={icons} />
      </div>

      <Alert>
        <strong>Careful adding this to the cost sheet.</strong> Anything you bought before starting
        the run was already sitting in your stash at the baseline, so consuming it during the run is
        already counted under &quot;went out&quot;. Subtracting the cost sheet on top would charge
        you for it twice. The cost sheet is the right figure when you bought inputs partway through,
        or want to know what the strategy cost to set up.
      </Alert>
    </div>
  );
}

function RunColumn({
  title,
  lines,
  tone,
  divineRateMicro,
  icons,
}: {
  title: string;
  lines: RunLine[];
  tone: "gain" | "loss";
  divineRateMicro: bigint;
  icons: CurrencyIconSet;
}) {
  const colour = tone === "gain" ? "text-[#4ade80]" : "text-[#f87171]";

  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold text-[#e4e8f0]">{title}</h3>
      {lines.length === 0 ? (
        <Empty>Nothing.</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-[#7d8798]">
              <tr className="border-b border-[#262c3a]">
                <th className="pb-2 font-medium">Item</th>
                <th className="pb-2 text-right font-medium">Qty</th>
                <th className="pb-2 text-right font-medium">Value</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.itemKey} className="border-b border-[#262c3a]/50 last:border-0">
                  <td className="py-2">
                    <span className="flex items-center gap-2.5">
                      {l.icon ? (
                        <img
                          src={l.icon}
                          alt=""
                          className="size-6 shrink-0 object-contain"
                          loading="lazy"
                        />
                      ) : (
                        <span className="size-6 shrink-0 rounded bg-[#1d222d]" />
                      )}
                      <span className="text-[#e4e8f0]">{l.displayName}</span>
                    </span>
                  </td>
                  <td className="py-2 text-right text-[#7d8798]">
                    {l.qtyDelta > 0 ? `+${l.qtyDelta}` : l.qtyDelta}
                  </td>
                  <td className={`py-2 text-right ${colour}`}>
                    <ChaosAndDivine
                      micro={l.quantityMicro}
                      divineRateMicro={divineRateMicro}
                      icons={icons}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
