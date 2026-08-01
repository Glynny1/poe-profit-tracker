"use client";

import { useTransition } from "react";
import { setTabTracked } from "@/app/actions";

export interface TabRow {
  id: string;
  name: string;
  type: string;
  isTracked: boolean;
  items: number;
}

export function TabPicker({ tabs }: { tabs: TabRow[] }) {
  const [pending, start] = useTransition();
  const tracked = tabs.filter((t) => t.isTracked).length;

  return (
    <div>
      <p className="mb-3 text-sm text-[#7d8798]">
        {tracked} of {tabs.length} tabs tracked
      </p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {tabs.map((t) => (
          <li key={t.id}>
            <label
              className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                t.isTracked
                  ? "border-[#c8aa6e]/50 bg-[#c8aa6e]/5"
                  : "border-[#262c3a] hover:bg-[#1d222d]"
              }`}
            >
              <input
                type="checkbox"
                checked={t.isTracked}
                disabled={pending}
                onChange={(e) => {
                  const next = e.target.checked;
                  start(() => setTabTracked(t.id, next));
                }}
                className="size-4 accent-[#c8aa6e]"
              />
              <span className="flex-1 truncate text-sm text-[#e4e8f0]">{t.name}</span>
              <span className="text-xs text-[#7d8798]">
                {t.items > 0 ? `${t.items} items` : "no items loaded"}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
