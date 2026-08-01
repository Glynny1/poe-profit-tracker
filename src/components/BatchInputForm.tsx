"use client";

/* eslint-disable @next/next/no-img-element */
import { useState, useTransition } from "react";
import { addStrategyInputs, pullLivePrices, type BatchInput } from "@/app/actions";
import { Alert, Button, Input, Label } from "@/components/ui";
import { ItemPicker, type PickedItem } from "@/components/ItemPicker";

const MICRO = 1_000_000;

interface Row {
  id: number;
  priceKey: string;
  displayName: string;
  icon: string | null;
  qty: number;
  /** micro-chaos as a string, or "" when no price has been pulled yet. */
  unitCostMicro: string;
  priceBookId?: string;
  /** True once the user has typed over the pulled price, which then survives a re-pull. */
  overridden: boolean;
  notFound?: boolean;
}

const toChaos = (micro: string) => (micro === "" ? "" : String(Number(micro) / MICRO));
const toMicro = (chaos: string) => String(Math.round(Number(chaos) * MICRO));

/**
 * Build a basket of strategy inputs, then price the whole thing in one go.
 *
 * Pulling every price at the same moment is the reason this exists: a cost sheet
 * assembled over ten minutes of typing would otherwise have rows frozen ten
 * minutes apart, against different price books.
 */
export function BatchInputForm({ strategyId }: { strategyId: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [nextId, setNextId] = useState(1);
  const [picked, setPicked] = useState<PickedItem | null>(null);
  const [qty, setQty] = useState(1);
  const [pickerKey, setPickerKey] = useState(0);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pulling, startPull] = useTransition();
  const [saving, startSave] = useTransition();

  function addRow() {
    if (!picked) return;
    setRows((r) => [
      ...r,
      {
        id: nextId,
        priceKey: picked.priceKey,
        displayName: picked.displayName,
        icon: picked.icon ?? null,
        qty: Number.isFinite(qty) && qty > 0 ? Math.round(qty) : 1,
        // Seeded from the picker so the basket is never blank, then refreshed
        // for real when prices are pulled.
        unitCostMicro: String(Math.round(picked.chaos * MICRO)),
        overridden: false,
      },
    ]);
    setNextId((n) => n + 1);
    setPicked(null);
    setQty(1);
    setPickerKey((k) => k + 1); // remount the picker to clear it
    setMessage(null);
  }

  function update(id: number, patch: Partial<Row>) {
    setRows((r) => r.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function pull() {
    if (rows.length === 0) return;
    startPull(async () => {
      const res = await pullLivePrices(
        strategyId,
        rows.map((r) => r.priceKey),
      );
      if (res.error) {
        setMessage({ kind: "error", text: res.error });
        return;
      }
      const byKey = new Map(res.prices.map((p) => [p.priceKey, p]));
      setRows((current) =>
        current.map((row) => {
          const p = byKey.get(row.priceKey);
          if (!p) return row;
          // A price you typed yourself is what you actually paid, so a refresh
          // must never overwrite it.
          if (row.overridden) return { ...row, priceBookId: p.priceBookId, notFound: !p.found };
          return {
            ...row,
            unitCostMicro: p.unitCostMicro,
            priceBookId: p.priceBookId,
            notFound: !p.found,
          };
        }),
      );
      const missing = res.prices.filter((p) => !p.found).length;
      setMessage({
        kind: missing ? "error" : "ok",
        text: missing
          ? `Pulled current prices. ${missing} item${missing === 1 ? " has" : "s have"} no price right now, so enter what you paid.`
          : `Pulled current prices for ${res.prices.length} item${res.prices.length === 1 ? "" : "s"}.`,
      });
    });
  }

  function save() {
    startSave(async () => {
      const payload: BatchInput[] = rows.map((r) => ({
        priceKey: r.priceKey,
        displayName: r.displayName,
        icon: r.icon,
        qty: r.qty,
        unitCostMicro: r.unitCostMicro === "" ? "0" : r.unitCostMicro,
        priceBookId: r.priceBookId,
        isManualOverride: r.overridden,
      }));
      const res = await addStrategyInputs(strategyId, payload);
      if (res.error) setMessage({ kind: "error", text: res.error });
      else {
        setRows([]);
        setMessage({ kind: "ok", text: res.ok ?? "Added." });
      }
    });
  }

  const total = rows.reduce(
    (t, r) => t + (r.unitCostMicro === "" ? 0 : Number(r.unitCostMicro) * r.qty),
    0,
  );

  return (
    <div className="space-y-5">
      <div className="grid items-end gap-4 sm:grid-cols-[1fr_120px_auto]">
        <ItemPicker key={pickerKey} label="Item" onPick={setPicked} />
        <div>
          <Label>Quantity</Label>
          <Input
            type="number"
            min={1}
            value={qty}
            onChange={(e) => setQty(Number(e.target.value))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addRow();
              }
            }}
          />
        </div>
        <Button type="button" onClick={addRow} disabled={!picked}>
          Add to list
        </Button>
      </div>

      {message && <Alert kind={message.kind}>{message.text}</Alert>}

      {rows.length === 0 ? (
        <p className="text-sm text-[#7d8798]">
          Add everything you bought for this strategy, then pull prices for the whole lot at once.
          Nothing is saved until you press the last button.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-[#7d8798]">
                <tr className="border-b border-[#262c3a]">
                  <th className="pb-2 font-medium">Item</th>
                  <th className="pb-2 text-right font-medium">Quantity</th>
                  <th className="pb-2 text-right font-medium">Price each (chaos)</th>
                  <th className="pb-2 text-right font-medium">Total</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-[#262c3a]/50 last:border-0">
                    <td className="py-2">
                      <span className="flex items-center gap-2.5">
                        {r.icon && (
                          <img src={r.icon} alt="" className="size-6 shrink-0 object-contain" />
                        )}
                        <span className="text-[#e4e8f0]">{r.displayName}</span>
                        {r.overridden && (
                          <span className="text-xs text-[#c8aa6e]">your price</span>
                        )}
                        {r.notFound && !r.overridden && (
                          <span className="text-xs text-[#fbbf24]">no live price</span>
                        )}
                      </span>
                    </td>
                    <td className="py-2 text-right">
                      <input
                        type="number"
                        min={1}
                        value={r.qty}
                        onChange={(e) => update(r.id, { qty: Math.max(1, Number(e.target.value)) })}
                        className="w-24 rounded-lg border border-[#262c3a] bg-[#0a0c11] px-2 py-1.5 text-right text-sm text-[#e4e8f0] outline-none focus:border-[#c8aa6e]"
                      />
                    </td>
                    <td className="py-2 text-right">
                      <input
                        type="number"
                        step="any"
                        min={0}
                        value={toChaos(r.unitCostMicro)}
                        onChange={(e) =>
                          update(r.id, {
                            unitCostMicro: e.target.value === "" ? "" : toMicro(e.target.value),
                            overridden: true,
                          })
                        }
                        className="w-28 rounded-lg border border-[#262c3a] bg-[#0a0c11] px-2 py-1.5 text-right text-sm text-[#e4e8f0] outline-none focus:border-[#c8aa6e]"
                      />
                    </td>
                    <td className="py-2 text-right text-[#7d8798]">
                      {r.unitCostMicro === ""
                        ? "-"
                        : `${((Number(r.unitCostMicro) / MICRO) * r.qty).toLocaleString("en-GB", {
                            maximumFractionDigits: 1,
                          })} c`}
                    </td>
                    <td className="py-2 text-right">
                      <button
                        type="button"
                        onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))}
                        className="text-xs text-[#7d8798] hover:text-[#f87171]"
                      >
                        remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" onClick={pull} disabled={pulling || saving}>
              {pulling ? "Pulling..." : "Pull live prices"}
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={save}
              disabled={saving || pulling || rows.length === 0}
            >
              {saving
                ? "Saving..."
                : `Freeze ${rows.length} item${rows.length === 1 ? "" : "s"} at these prices`}
            </Button>
            <span className="text-sm text-[#7d8798]">
              {(total / MICRO).toLocaleString("en-GB", { maximumFractionDigits: 1 })} c total
            </span>
          </div>

          <p className="text-xs text-[#7d8798]">
            Pulling prices overwrites every row except ones where you typed your own price. Whatever
            is shown above is exactly what gets frozen, and it will not change when the market does.
          </p>
        </>
      )}
    </div>
  );
}
