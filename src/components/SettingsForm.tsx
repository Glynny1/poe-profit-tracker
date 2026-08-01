"use client";

import { useActionState } from "react";
import { updateSettings, type ActionState } from "@/app/actions";
import { Alert, Button, Input, Label } from "@/components/ui";

const initial: ActionState = {};

export function SettingsForm({
  user,
}: {
  user: {
    poeAccount: string;
    league: string;
    displayCurrency: "CHAOS" | "DIVINE";
    liquidityHaircutPct: number;
    minCount: number;
  };
}) {
  const [state, action, pending] = useActionState(updateSettings, initial);

  const select =
    "w-full rounded-lg border border-[#262c3a] bg-[#0a0c11] px-3 py-2 text-sm text-[#e4e8f0] outline-none focus:border-[#c8aa6e]";

  return (
    <form action={action} className="max-w-xl space-y-5">
      {state.error && <Alert kind="error">{state.error}</Alert>}
      {state.ok && <Alert kind="ok">{state.ok}</Alert>}

      <div>
        <Label hint="self-reported, we can't verify it without OAuth">PoE account name</Label>
        <Input name="poeAccount" defaultValue={user.poeAccount} placeholder="YourName#1234" />
      </div>

      <div>
        <Label>League</Label>
        <Input name="league" defaultValue={user.league} placeholder="Allflame" />
        <p className="mt-1.5 text-xs text-[#7d8798]">
          The API name, not the marketing name. 3.29 &quot;Curse of the Allflame&quot; is just{" "}
          <code className="text-[#c8aa6e]">Allflame</code>. poe.ninja only prices Allflame, Hardcore
          Allflame, Standard and Hardcore; SSF and Ruthless have no price data at all.
        </p>
      </div>

      <div>
        <Label>Display currency</Label>
        <select name="displayCurrency" defaultValue={user.displayCurrency} className={select}>
          <option value="CHAOS">Chaos</option>
          <option value="DIVINE">Divine</option>
        </select>
      </div>

      <div>
        <Label hint="percent of list price">Liquidity haircut</Label>
        <Input
          name="liquidityHaircutPct"
          type="number"
          min={1}
          max={100}
          defaultValue={user.liquidityHaircutPct}
        />
        <p className="mt-1.5 text-xs text-[#7d8798]">
          Values what you&apos;re still holding at this share of poe.ninja&apos;s list price. The gap
          between list price and what you actually get selling in bulk is the biggest systematic
          error in tools like this. 85 is a realistic setting, 100 means no adjustment.
        </p>
      </div>

      <div>
        <Label hint="minimum listings for a price to count">Confidence threshold</Label>
        <Input name="minCount" type="number" min={0} defaultValue={user.minCount} />
        <p className="mt-1.5 text-xs text-[#7d8798]">
          Ignores prices backed by fewer listings than this. A single listing at 60,000c is noise,
          and counting it invents wealth that vanishes on the next refresh.
        </p>
      </div>

      <Button variant="primary" type="submit" disabled={pending}>
        {pending ? "Saving..." : "Save settings"}
      </Button>
    </form>
  );
}
