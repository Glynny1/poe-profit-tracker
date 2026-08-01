"use client";

import { useState, useTransition } from "react";
import { closeStrategy, setMapsRun, setStrategyShared } from "@/app/actions";
import { Button } from "@/components/ui";

export function StrategyControls({
  strategyId,
  mapsRun,
  closed,
  shared,
}: {
  strategyId: string;
  mapsRun: number;
  closed: boolean;
  shared: boolean;
}) {
  const [pending, start] = useTransition();
  const [maps, setMaps] = useState(mapsRun);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          min={0}
          value={maps}
          disabled={pending}
          onChange={(e) => setMaps(Number(e.target.value))}
          onBlur={() => maps !== mapsRun && start(() => setMapsRun(strategyId, maps))}
          className="w-20 rounded-lg border border-[#262c3a] bg-[#0a0c11] px-2 py-1.5 text-sm text-[#e4e8f0] outline-none focus:border-[#c8aa6e]"
        />
        <span className="text-sm text-[#7d8798]">maps</span>
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-sm text-[#7d8798]">
        <input
          type="checkbox"
          checked={shared}
          disabled={pending}
          onChange={(e) => {
            const next = e.target.checked;
            start(() => setStrategyShared(strategyId, next));
          }}
          className="size-4 accent-[#c8aa6e]"
        />
        Share
      </label>

      {!closed && (
        <Button
          disabled={pending}
          onClick={() => start(() => closeStrategy(strategyId))}
        >
          Close strategy
        </Button>
      )}
    </div>
  );
}
