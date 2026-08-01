"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface Point {
  t: number;
  /** Net worth in chaos. Converted for display only. */
  value: number;
}

// The reference palette's dark-mode yellow step. The app's UI gold (#c8aa6e) is
// deliberately NOT used here: as a data mark it sits above the dark-mode
// lightness band and under the chroma floor, so it reads washed out against the
// panel. It stays as chrome for headings and buttons, where it is text.
const SERIES = "#c98500";
const GRID = "#262c3a";
const MUTED = "#7d8798";

export function NetWorthChart({
  data,
  currency,
  divineRate,
}: {
  data: Point[];
  currency: "CHAOS" | "DIVINE";
  divineRate: number;
}) {
  const toDisplay = (chaos: number) => (currency === "DIVINE" ? chaos / divineRate : chaos);
  const unit = currency === "DIVINE" ? "div" : "c";

  const points = data.map((d) => ({ ...d, display: toDisplay(d.value) }));

  const fmt = (n: number) =>
    n >= 10000
      ? `${(n / 1000).toLocaleString("en-GB", { maximumFractionDigits: 1 })}k`
      : n.toLocaleString("en-GB", { maximumFractionDigits: n < 10 ? 2 : 0 });

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          {/* Recessive: horizontal only, no vertical clutter behind the line. */}
          <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />

          <XAxis
            dataKey="t"
            type="number"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(t) =>
              new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
            }
            stroke={GRID}
            tick={{ fill: MUTED, fontSize: 12 }}
            tickLine={false}
            minTickGap={40}
          />
          <YAxis
            tickFormatter={fmt}
            stroke={GRID}
            tick={{ fill: MUTED, fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            width={56}
          />

          {/* A line chart is interactive by default: crosshair plus tooltip. */}
          <Tooltip
            cursor={{ stroke: MUTED, strokeWidth: 1, strokeDasharray: "4 4" }}
            contentStyle={{
              background: "#161a23",
              border: `1px solid ${GRID}`,
              borderRadius: 8,
              fontSize: 13,
            }}
            // Values wear text tokens, never the series colour.
            itemStyle={{ color: "#e4e8f0" }}
            labelStyle={{ color: MUTED, marginBottom: 4 }}
            labelFormatter={(t) =>
              new Date(Number(t)).toLocaleString("en-GB", {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })
            }
            formatter={(v) => [`${fmt(Number(v ?? 0))} ${unit}`, "Net worth"]}
          />

          <Area
            type="monotone"
            dataKey="display"
            stroke={SERIES}
            strokeWidth={2}
            fill={SERIES}
            fillOpacity={0.12}
            // No dot per point: a 60-snapshot series would become a bead string.
            dot={false}
            activeDot={{ r: 4, fill: SERIES, stroke: "#161a23", strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
