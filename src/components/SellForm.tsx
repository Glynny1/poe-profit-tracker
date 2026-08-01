"use client";

import { useActionState, useState } from "react";
import { recordSale, type ActionState } from "@/app/actions";
import { Alert, Button, Input, Label } from "@/components/ui";
import { ItemPicker, type PickedItem } from "@/components/ItemPicker";

const initial: ActionState = {};

/**
 * S4: record a realised sale against a strategy, freezing the price now.
 * A stash diff can never tell selling from vendoring or consuming, so this is
 * the only place the app learns what something was actually worth to you.
 */
export function SellForm({ strategyId }: { strategyId?: string }) {
  const [state, action, pending] = useActionState(recordSale, initial);
  const [picked, setPicked] = useState<PickedItem | null>(null);

  return (
    <form action={action} className="space-y-4">
      {strategyId && <input type="hidden" name="strategyId" value={strategyId} />}
      {state.error && <Alert kind="error">{state.error}</Alert>}
      {state.ok && <Alert kind="ok">{state.ok}</Alert>}

      <ItemPicker label="What did you sell?" onPick={setPicked} />

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <Label>Quantity</Label>
          <Input name="qty" type="number" min={1} defaultValue={1} required />
        </div>
        <div>
          <Label hint="optional">Price each, in chaos</Label>
          <Input name="overrideChaos" type="number" step="any" placeholder="today's price" />
        </div>
        <div>
          <Label hint="optional">Note</Label>
          <Input name="note" placeholder="bulk sale, 10% under" />
        </div>
      </div>

      <Button variant="primary" type="submit" disabled={pending || !picked}>
        {pending ? "Recording…" : "Record sale"}
      </Button>
    </form>
  );
}
