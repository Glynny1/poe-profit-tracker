"use client";

import { useActionState } from "react";
import { createStrategy, type ActionState } from "@/app/actions";
import { Alert, Button, Input, Label } from "@/components/ui";

const initial: ActionState = {};

export function NewStrategyForm() {
  const [state, action, pending] = useActionState(createStrategy, initial);

  return (
    <form action={action} className="space-y-4">
      {state.error && <Alert kind="error">{state.error}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label>Name</Label>
          <Input name="name" placeholder="Abyss + Harvest T16s" required />
        </div>
        <div>
          <Label hint="optional">Notes</Label>
          <Input name="notes" placeholder="5 scarab slots, Fruiting astrolabe" />
        </div>
      </div>
      <p className="text-xs text-[#7d8798]">
        Your most recent snapshot becomes the baseline and is pinned, so it can never be cleaned up
        while the strategy still needs it.
      </p>
      <Button variant="primary" type="submit" disabled={pending}>
        {pending ? "Starting..." : "Start strategy"}
      </Button>
    </form>
  );
}
