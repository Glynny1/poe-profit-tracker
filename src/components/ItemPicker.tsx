"use client";

import { useEffect, useRef, useState } from "react";
import { Input, Label } from "@/components/ui";

export interface PickedItem {
  priceKey: string;
  displayName: string;
  icon?: string | null;
  chaos: number;
}

export function ItemPicker({
  name = "priceKey",
  label = "Item",
  onPick,
}: {
  name?: string;
  label?: string;
  onPick?: (item: PickedItem | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PickedItem[]>([]);
  const [picked, setPicked] = useState<PickedItem | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const searchable = !picked && query.trim().length >= 2;

  useEffect(() => {
    if (!searchable) return;

    // Debounced so typing "chaos orb" is one request, not nine.
    const ctl = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/prices/search?q=${encodeURIComponent(query)}`, {
          signal: ctl.signal,
        });
        const json = await res.json();
        setResults(json.results ?? []);
        setOpen(true);
      } catch {
        /* aborted or offline — the picker just shows nothing */
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
  }, [query, searchable]);

  // Derived, not stored: clearing `results` from inside the effect would cause a
  // cascading re-render, and stale rows must not show for a query they don't match.
  const visible = searchable ? results : [];

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function choose(item: PickedItem) {
    setPicked(item);
    setQuery(item.displayName);
    setOpen(false);
    onPick?.(item);
  }

  function clear() {
    setPicked(null);
    setQuery("");
    onPick?.(null);
  }

  return (
    <div ref={box} className="relative">
      <Label hint={picked ? `${picked.chaos.toLocaleString()} c each right now` : undefined}>
        {label}
      </Label>
      <input type="hidden" name={name} value={picked?.priceKey ?? ""} />
      <div className="flex gap-2">
        <Input
          value={query}
          placeholder="Search scarabs, fragments, astrolabes, maps, anything…"
          autoComplete="off"
          onChange={(e) => {
            setQuery(e.target.value);
            if (picked) {
              setPicked(null);
              onPick?.(null);
            }
          }}
          onFocus={() => visible.length > 0 && setOpen(true)}
        />
        {picked && (
          <button
            type="button"
            onClick={clear}
            className="shrink-0 rounded-lg border border-[#2a3346] px-3 text-sm text-[#8b97ad] hover:text-[#e6ebf5]"
          >
            Clear
          </button>
        )}
      </div>

      {open && visible.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-[#2a3346] bg-[#1b2130] shadow-xl">
          {visible.map((r) => (
            <li key={r.priceKey}>
              <button
                type="button"
                onClick={() => choose(r)}
                className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-[#232b3d]"
              >
                {r.icon && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.icon} alt="" className="size-6 object-contain" />
                )}
                <span className="flex-1 truncate text-[#e6ebf5]">{r.displayName}</span>
                <span className="text-xs text-[#8b97ad]">{r.chaos.toLocaleString()} c</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {loading && <p className="mt-1 text-xs text-[#8b97ad]">Searching…</p>}
      {!loading && query.trim().length >= 2 && !picked && visible.length === 0 && open && (
        <p className="mt-1 text-xs text-[#8b97ad]">
          Nothing matched. poe.ninja doesn&apos;t price rare items — enter the cost manually instead.
        </p>
      )}
    </div>
  );
}
