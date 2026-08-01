"use client";

import { useState } from "react";
import { Button } from "@/components/ui";

/**
 * Shows a strategy's share code with a copy button.
 *
 * The code is generated server-side and passed in, so the client never has to
 * reimplement the encoding and the two cannot drift.
 */
export function ShareCodeBox({ code, itemCount }: { code: string; itemCount: number }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="space-y-3">
      <p className="t-body measure text-[#7d8798]">
        Send this to anyone running the tracker and they can recreate the cost sheet:{" "}
        {itemCount} item{itemCount === 1 ? "" : "s"} with quantities and what you paid. They choose
        whether to price it at today&apos;s rates or keep yours.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded-lg border border-[#262c3a] bg-[#0a0c11] px-3 py-2.5 font-mono text-xs text-[#c8aa6e]">
          {code}
        </code>
        <Button type="button" variant="primary" onClick={copy}>
          {copied ? "Copied" : "Copy code"}
        </Button>
      </div>
    </div>
  );
}
