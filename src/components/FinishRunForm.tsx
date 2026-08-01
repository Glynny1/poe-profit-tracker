"use client";

import { useActionState, useTransition } from "react";
import { finishRun, importForRun, reopenRun, type ActionState } from "@/app/actions";
import { Alert, Button, Label } from "@/components/ui";

const initial: ActionState = {};

export interface StagedTab {
  tabId: string;
  name: string;
  items: number;
}

export function FinishRunForm({
  strategyId,
  finished,
  stashUrl,
  stagedTabs,
  baselineTabIds,
}: {
  strategyId: string;
  finished: boolean;
  stashUrl: string | null;
  stagedTabs: StagedTab[];
  /** Tabs the baseline snapshot covered. Ticking the same set keeps the comparison honest. */
  baselineTabIds: string[];
}) {
  const [importState, importAction, importing] = useActionState(importForRun, initial);
  const [finishState, finishAction, finishing] = useActionState(finishRun, initial);
  const [reopening, startReopen] = useTransition();

  if (finished) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-[#7d8798]">
          This run is closed. The comparison below is fixed against the snapshot taken when you
          finished it.
        </p>
        <Button
          type="button"
          disabled={reopening}
          onClick={() => startReopen(() => reopenRun(strategyId))}
        >
          {reopening ? "Reopening..." : "Reopen run"}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Alert kind="warn">
        <strong>Change zone before you refresh your stash.</strong> Path of Exile only writes your
        stash to its servers when you leave an area, so loot from the map you just finished will not
        appear in the JSON until you take a portal or log out. Refresh too early and the run looks
        emptier than it was.
      </Alert>

      <form action={importAction} className="space-y-4">
        <input type="hidden" name="strategyId" value={strategyId} />
        {importState.error && <Alert kind="error">{importState.error}</Alert>}
        {importState.ok && <Alert kind="ok">{importState.ok}</Alert>}

        {stashUrl && (
          <p className="text-sm text-[#7d8798]">
            Open{" "}
            <a
              href={stashUrl}
              target="_blank"
              rel="noreferrer"
              className="text-[#c8aa6e] underline"
            >
              your stash JSON
            </a>{" "}
            (tab 0), copy the whole response, and paste it below. Bump{" "}
            <code className="text-[#c8aa6e]">tabIndex</code> in the address bar for each further tab.
          </p>
        )}

        <div>
          <Label hint="paste the whole response">Stash JSON</Label>
          <textarea
            name="json"
            rows={5}
            spellCheck={false}
            placeholder='{"numTabs":24,"tabs":[...],"items":[...]}'
            className="w-full rounded-lg border border-[#262c3a] bg-[#0a0c11] p-3 font-mono text-xs text-[#e4e8f0] outline-none placeholder:text-[#7d8798]/50 focus:border-[#c8aa6e]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={importing}>
            {importing ? "Reading..." : "Stage this tab"}
          </Button>
          <input
            type="file"
            name="file"
            accept=".json,application/json"
            className="block text-sm text-[#7d8798] file:mr-3 file:rounded-lg file:border file:border-[#262c3a] file:bg-[#1d222d] file:px-3 file:py-2 file:text-sm file:text-[#e4e8f0]"
          />
        </div>
      </form>

      <form action={finishAction} className="space-y-4 border-t border-[#262c3a] pt-5">
        <input type="hidden" name="strategyId" value={strategyId} />
        {finishState.error && <Alert kind="error">{finishState.error}</Alert>}

        {stagedTabs.length > 0 && (
          <div>
            <Label hint="ticked by default to match the snapshot you started from">
              Tabs to include
            </Label>
            <ul className="grid gap-2 sm:grid-cols-2">
              {stagedTabs.map((t) => {
                const inBaseline = baselineTabIds.includes(t.tabId);
                return (
                  <li key={t.tabId}>
                    <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-[#262c3a] px-3 py-2.5 transition-colors hover:bg-[#1d222d]">
                      <input
                        type="checkbox"
                        name="tabIds"
                        value={t.tabId}
                        defaultChecked={inBaseline}
                        className="size-4 accent-[#c8aa6e]"
                      />
                      <span className="flex-1 truncate text-sm text-[#e4e8f0]">{t.name}</span>
                      <span className="text-xs text-[#7d8798]">
                        {t.items > 0 ? `${t.items} items` : "empty"}
                      </span>
                      {!inBaseline && (
                        <span
                          className="text-xs text-[#fbbf24]"
                          title="This tab was not in the snapshot you started from"
                        >
                          new
                        </span>
                      )}
                    </label>
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 text-xs text-[#7d8798]">
              Including a tab the baseline did not cover, or leaving one out that it did, means part
              of the difference is not something the run produced. That part is reported separately
              rather than counted as loot.
            </p>
          </div>
        )}

        <p className="text-sm text-[#7d8798]">
          Takes a closing snapshot of the ticked tabs and compares it to the one from when you
          started, so everything that arrived or left is listed with what it is worth.
        </p>
        <Button
          variant="primary"
          type="submit"
          disabled={finishing || importing || stagedTabs.length === 0}
        >
          {finishing ? "Comparing..." : "Finish run"}
        </Button>
      </form>
    </div>
  );
}
