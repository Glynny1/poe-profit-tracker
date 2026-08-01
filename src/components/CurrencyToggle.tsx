"use client";

import { useTransition } from "react";
import { setCurrency } from "@/app/actions";

/** R2: switch the whole UI between chaos and divine. */
export function CurrencyToggle({ current }: { current: "CHAOS" | "DIVINE" }) {
  const [pending, start] = useTransition();

  return (
    <div className="flex rounded-lg border border-[#262c3a] p-0.5 text-xs">
      {(["CHAOS", "DIVINE"] as const).map((c) => (
        <button
          key={c}
          disabled={pending}
          onClick={() => start(() => setCurrency(c))}
          className={`rounded-md px-2.5 py-1 transition-colors ${
            current === c
              ? "bg-[#c8aa6e] font-semibold text-[#0a0c11]"
              : "text-[#7d8798] hover:text-[#e4e8f0]"
          }`}
        >
          {c === "CHAOS" ? "chaos" : "divine"}
        </button>
      ))}
    </div>
  );
}
