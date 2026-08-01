/* eslint-disable @next/next/no-img-element */
import type { Holding } from "@/lib/services/holdings";
import type { CurrencyIconSet } from "@/components/Coin";
import { Chaos, Coin } from "@/components/Coin";
import { Empty } from "@/components/ui";
import { SellButton } from "@/components/SellButton";
import { microToDivine } from "@/domain/money";

/**
 * Value breakdown of a snapshot, biggest holdings first.
 *
 * Unit prices stay in chaos regardless of the display currency: everything on
 * poe.ninja is priced in chaos, and showing "0.04 div" for Vivid Crystallised
 * Lifeforce is less readable than "0.04c", not more. Totals get both units.
 */
export function HoldingsTable({
  holdings,
  icons,
  divineRateMicro,
  limit,
  showSell = false,
  showTab = true,
}: {
  holdings: Holding[];
  icons: CurrencyIconSet;
  divineRateMicro: bigint;
  limit?: number;
  showSell?: boolean;
  showTab?: boolean;
}) {
  if (holdings.length === 0) return <Empty>Nothing priced in this snapshot.</Empty>;

  const rows = limit ? holdings.slice(0, limit) : holdings;
  const hidden = limit ? Math.max(0, holdings.length - limit) : 0;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wide text-[#7d8798]">
          <tr className="border-b border-[#262c3a]">
            <th className="pb-2 font-medium">Name</th>
            {showTab && <th className="pb-2 font-medium">Tab</th>}
            <th className="pb-2 text-right font-medium">Quantity</th>
            <th className="pb-2 text-right font-medium">Price</th>
            <th className="pb-2 text-right font-medium">Total</th>
            {showSell && <th className="pb-2" />}
          </tr>
        </thead>
        <tbody>
          {rows.map((h) => (
            <tr key={h.itemKey} className="border-b border-[#262c3a]/50 last:border-0">
              <td className="py-2">
                <span className="flex items-center gap-2.5">
                  {h.icon ? (
                    <img
                      src={h.icon}
                      alt=""
                      className="size-6 shrink-0 object-contain"
                      loading="lazy"
                    />
                  ) : (
                    <span className="size-6 shrink-0 rounded bg-[#1d222d]" />
                  )}
                  <span className="text-[#e4e8f0]">{h.displayName}</span>
                </span>
              </td>
              {showTab && (
                <td className="py-2 text-[#7d8798]">
                  {h.tabNames.length > 1 ? `${h.tabNames.length} tabs` : (h.tabNames[0] ?? "-")}
                </td>
              )}
              <td className="py-2 text-right text-[#7d8798]">{h.qty.toLocaleString("en-GB")}</td>
              <td className="py-2 text-right text-[#7d8798]">
                {h.unitMicro == null ? (
                  "-"
                ) : (
                  <Chaos micro={h.unitMicro} icons={icons} />
                )}
              </td>
              <td className="py-2 text-right">
                <TotalCell micro={h.totalMicro} icons={icons} divineRateMicro={divineRateMicro} />
              </td>
              {showSell && (
                <td className="py-2 text-right">
                  {h.priceKey && (
                    <SellButton
                      priceKey={h.priceKey}
                      displayName={h.displayName}
                      maxQty={h.qty}
                    />
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {hidden > 0 && (
        <p className="pt-3 text-xs text-[#7d8798]">
          and {hidden.toLocaleString("en-GB")} more, smallest first
        </p>
      )}
    </div>
  );
}

/**
 * Totals show divine once they are big enough for it to mean anything. Below
 * about a fifth of a divine the rounded figure is mostly noise, so chaos alone
 * is the honest presentation.
 */
function TotalCell({
  micro,
  icons,
  divineRateMicro,
}: {
  micro: bigint;
  icons: CurrencyIconSet;
  divineRateMicro: bigint;
}) {
  const divine = microToDivine(micro, divineRateMicro);
  if (divine < 0.2) return <Chaos micro={micro} icons={icons} />;

  return (
    <span className="inline-flex items-center gap-3">
      <span className="text-[#7d8798]">
        <Chaos micro={micro} icons={icons} />
      </span>
      <Coin icon={icons.divine} alt="Divine Orb">
        {divine.toLocaleString("en-GB", { maximumFractionDigits: divine < 10 ? 2 : 1 })}
      </Coin>
    </span>
  );
}
