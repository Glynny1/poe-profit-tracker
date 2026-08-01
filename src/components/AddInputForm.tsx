"use client";

import { useActionState, useState } from "react";
import { addStrategyInput, type ActionState } from "@/app/actions";
import { Alert, Button, Input, Label } from "@/components/ui";
import { ItemPicker, type PickedItem } from "@/components/ItemPicker";

const initial: ActionState = {};

/** S2 + S3: pick any priceable item, and freeze its cost at this moment. */
export function AddInputForm({ strategyId }: { strategyId: string; league: string }) {
  const [state, action, pending] = useActionState(addStrategyInput, initial);
  const [picked, setPicked] = useState<PickedItem | null>(null);
  const [qty, setQty] = useState(1);

  const projected = picked ? picked.chaos * (Number.isFinite(qty) ? qty : 0) : null;

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="strategyId" value={strategyId} />
      {state.error && <Alert kind="error">{state.error}</Alert>}
      {state.ok && <Alert kind="ok">{state.ok}</Alert>}

      <ItemPicker onPick={setPicked} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label>Quantity</Label>
          <Input
            name="qty"
            type="number"
            min={1}
            value={qty}
            onChange={(e) => setQty(Number(e.target.value))}
            required
          />
        </div>
        <div>
          <Label hint="optional">Price each you actually paid, in chaos</Label>
          <Input name="overrideChaos" type="number" step="any" placeholder="use today's price" />
        </div>
      </div>

      {projected != null && (
        <p className="text-sm text-[#8b97ad]">
          Freezing at{" "}
          <strong className="text-[#e6ebf5]">
            {projected.toLocaleString("en-GB", { maximumFractionDigits: 1 })} c
          </strong>{" "}
          total. This figure will not change when the market does.
        </p>
      )}

      <Button variant="primary" type="submit" disabled={pending || !picked}>
        {pending ? "Recording…" : "Add cost"}
      </Button>
    </form>
  );
}
