"use client";

import { useActionState, useState } from "react";
import { recordSale, type ActionState } from "@/app/actions";
import { Alert, Button, Input, Label } from "@/components/ui";

const initial: ActionState = {};

/**
 * S4: freeze a realised price at this instant.
 *
 * `strategyId` is optional, because most trades aren't part of a strategy, and locking
 * this behind one would mean the app never learns what anything actually sold for.
 */
export function SellButton({
  priceKey,
  displayName,
  maxQty,
  strategyId,
}: {
  priceKey: string;
  displayName: string;
  maxQty?: number;
  strategyId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(recordSale, initial);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-md border border-[#262c3a] px-2.5 py-1 text-xs text-[#7d8798] transition-colors hover:border-[#c8aa6e] hover:text-[#c8aa6e]"
      >
        Sell
      </button>
    );
  }

  return (
    <form
      action={action}
      className="mt-2 space-y-3 rounded-lg border border-[#c8aa6e]/40 bg-[#1d222d] p-3 text-left"
    >
      <input type="hidden" name="priceKey" value={priceKey} />
      {strategyId && <input type="hidden" name="strategyId" value={strategyId} />}

      <p className="text-sm text-[#e4e8f0]">
        Sell <strong>{displayName}</strong>
      </p>
      {state.error && <Alert kind="error">{state.error}</Alert>}
      {state.ok && <Alert kind="ok">{state.ok}</Alert>}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>Quantity</Label>
          <Input name="qty" type="number" min={1} max={maxQty} defaultValue={maxQty ?? 1} required />
        </div>
        <div>
          <Label hint="optional">Price each, in chaos</Label>
          <Input name="overrideChaos" type="number" step="any" placeholder="today's price" />
        </div>
      </div>

      <p className="text-xs text-[#7d8798]">
        Leave the price blank to freeze today&apos;s market price. Fill it in if you got something
        different. That&apos;s what makes the historical figure real.
      </p>

      <div className="flex gap-2">
        <Button variant="primary" type="submit" disabled={pending}>
          {pending ? "Recording..." : "Record sale"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
