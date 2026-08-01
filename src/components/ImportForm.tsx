"use client";

import { useActionState } from "react";
import { importStash, takeSnapshot, type ActionState } from "@/app/actions";
import { Alert, Button, Label } from "@/components/ui";

const initial: ActionState = {};

export function ImportForm() {
  const [state, action, pending] = useActionState(importStash, initial);
  const [snapState, snapAction, snapPending] = useActionState(takeSnapshot, initial);

  return (
    <div className="space-y-5">
      <form action={action} className="space-y-4">
        {state.error && <Alert kind="error">{state.error}</Alert>}
        {state.ok && <Alert kind="ok">{state.ok}</Alert>}

        <div>
          <Label hint="paste the whole response, starting with {">Stash JSON</Label>
          <textarea
            name="json"
            rows={7}
            spellCheck={false}
            placeholder='{"numTabs":24,"tabs":[...],"items":[...]}'
            className="w-full rounded-lg border border-[#2a3346] bg-[#0b0d12] p-3 font-mono text-xs text-[#e6ebf5] outline-none placeholder:text-[#8b97ad]/50 focus:border-[#c8aa6e]"
          />
        </div>

        <div>
          <Label hint="for stashes too big to paste">Or upload a .json file</Label>
          <input
            type="file"
            name="file"
            accept=".json,application/json"
            className="block w-full text-sm text-[#8b97ad] file:mr-3 file:rounded-lg file:border file:border-[#2a3346] file:bg-[#1b2130] file:px-3 file:py-2 file:text-sm file:text-[#e6ebf5]"
          />
          <p className="mt-1.5 text-xs text-[#8b97ad]">
            Hosted on Vercel, a single request is capped at 4.5 MB. A large stash exceeds that in
            one go, so import a few tabs at a time and they accumulate.
          </p>
        </div>

        <Button type="submit" disabled={pending}>
          {pending ? "Reading..." : "Import"}
        </Button>
      </form>

      <div className="border-t border-[#2a3346] pt-5">
        <form action={snapAction} className="space-y-3">
          {snapState.error && <Alert kind="error">{snapState.error}</Alert>}
          <p className="text-sm text-[#8b97ad]">
            <strong className="text-[#e6ebf5]">Before you snapshot:</strong> empty your character
            inventory into the stash first. Inventory isn&apos;t visible to the API, so 3 divines
            sitting in your pack become +3 div of phantom profit the moment you deposit them.
          </p>
          <Button variant="primary" type="submit" disabled={snapPending}>
            {snapPending ? "Taking snapshot..." : "Take snapshot"}
          </Button>
        </form>
      </div>
    </div>
  );
}
