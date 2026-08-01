"use client";

import { useActionState } from "react";
import { importStrategyCode, type ActionState } from "@/app/actions";
import { Alert, Button, Label, Textarea } from "@/components/ui";

const initial: ActionState = {};

export function ImportCodeForm() {
  const [state, action, pending] = useActionState(importStrategyCode, initial);

  return (
    <form action={action} className="space-y-4">
      {state.error && <Alert kind="error">{state.error}</Alert>}

      <div>
        <Label hint="starts with PPT1.">Share code</Label>
        <Textarea name="code" rows={3} spellCheck={false} placeholder="PPT1.H4sIAAAAAAAA..." />
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-1.5 text-sm font-medium text-[#e4e8f0]">Which prices?</legend>

        <label className="flex cursor-pointer items-start gap-3 text-sm">
          <input
            type="radio"
            name="prices"
            value="today"
            defaultChecked
            className="mt-1 size-4 accent-[#c8aa6e]"
          />
          <span>
            <span className="text-[#e4e8f0]">Today&apos;s prices</span>
            <span className="block t-caption text-[#7d8798]">
              What the items cost you now. This is the right answer if you are about to buy them.
            </span>
          </span>
        </label>

        <label className="flex cursor-pointer items-start gap-3 text-sm">
          <input type="radio" name="prices" value="shared" className="mt-1 size-4 accent-[#c8aa6e]" />
          <span>
            <span className="text-[#e4e8f0]">Keep the prices in the code</span>
            <span className="block t-caption measure text-[#7d8798]">
              What the author paid. Useful for reproducing their run exactly, but it is their cost
              basis rather than yours, so your profit figures will not reflect what you spent.
            </span>
          </span>
        </label>
      </fieldset>

      <Button variant="primary" type="submit" disabled={pending}>
        {pending ? "Importing..." : "Import strategy"}
      </Button>
    </form>
  );
}
