"use client";

import { useState } from "react";
import { Alert, Button, Input, Label } from "@/components/ui";

/**
 * Builds the stash URL from an account name typed normally.
 *
 * Hand-encoding this is a genuine trap. The '#' before the discriminator has to
 * be written %23, and a wrong guess doesn't fail loudly. '%69' is a perfectly
 * valid escape for 'i', so "Glynny%6921" silently becomes "Glynnyi21" and you
 * get a permission error that looks like being logged out.
 *
 * encodeURIComponent removes the whole class of problem.
 */
export function StashUrlHelper({
  account,
  league,
}: {
  account: string;
  league: string;
}) {
  const [name, setName] = useState(account);
  const [tab, setTab] = useState(0);
  const [copied, setCopied] = useState(false);

  const trimmed = name.trim();
  const url =
    `https://www.pathofexile.com/character-window/get-stash-items` +
    `?accountName=${encodeURIComponent(trimmed)}` +
    `&realm=pc&league=${encodeURIComponent(league)}&tabs=1&tabIndex=${tab}`;

  const looksComplete = /#\d{3,}$/.test(trimmed);

  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
        <div>
          <Label hint="exactly as the site shows it, # and all">Account name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Glynny#6291"
            spellCheck={false}
          />
        </div>
        <div>
          <Label hint="0, then 1, 2...">Tab number</Label>
          <Input
            type="number"
            min={0}
            value={tab}
            onChange={(e) => setTab(Math.max(0, Number(e.target.value)))}
          />
        </div>
      </div>

      {trimmed && !looksComplete && (
        <Alert kind="warn">
          That doesn&apos;t look complete. Account names end in a <code>#</code> and four digits.
          Check the top-left of pathofexile.com when you&apos;re logged in. Type it normally; the{" "}
          <code>#</code> is encoded for you below.
        </Alert>
      )}

      <div>
        <Label>Your URL</Label>
        <div className="rounded-lg border border-[#262c3a] bg-[#0a0c11] p-3">
          <code className="block break-all text-xs text-[#c8aa6e]">
            {trimmed ? url : "Enter your account name above."}
          </code>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="primary" onClick={copy} disabled={!trimmed}>
          {copied ? "Copied" : "Copy URL"}
        </Button>
        <a href={trimmed ? url : undefined} target="_blank" rel="noreferrer">
          <Button type="button" disabled={!trimmed}>
            Open in a new tab
          </Button>
        </a>
        <Button type="button" onClick={() => setTab((t) => t + 1)} disabled={!trimmed}>
          Next tab ({tab + 1})
        </Button>
      </div>

      <p className="text-sm text-[#7d8798]">
        Open it while logged in to pathofexile.com, copy the whole response, and paste it above.
        Then bump the tab number and repeat. Imports accumulate, so you can do a few at a time.
      </p>
    </div>
  );
}
