"use client";

import { useEffect, useState } from "react";

/**
 * Age of a timestamp, computed on the client.
 *
 * `Date.now()` during a server render is impure. The value is baked into the
 * response and then never moves, so the clock belongs here, where it can tick.
 */
export function RelativeAge({ date }: { date: string }) {
  const [minutes, setMinutes] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setMinutes(Math.round((Date.now() - new Date(date).getTime()) / 60000));
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [date]);

  if (minutes == null) return <span>-</span>;
  if (minutes < 60) return <span>{minutes} min</span>;
  const hours = Math.floor(minutes / 60);
  return <span>{hours < 24 ? `${hours} h` : `${Math.floor(hours / 24)} d`}</span>;
}
