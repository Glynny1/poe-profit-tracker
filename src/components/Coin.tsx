/* eslint-disable @next/next/no-img-element */
import { microToChaos, microToDivine } from "@/domain/money";

/**
 * A money figure shown with the orb it is denominated in, rather than a "c" or
 * "div" suffix.
 *
 * The icon always carries alt text, so if poecdn is unreachable or the price
 * book predates having icons the figure still reads correctly instead of
 * becoming a bare number with no unit.
 */
export function Coin({
  icon,
  alt,
  children,
  size = "sm",
}: {
  icon: string | null;
  alt: string;
  children: React.ReactNode;
  size?: "sm" | "lg";
}) {
  const px = size === "lg" ? "size-6" : "size-4";
  return (
    <span className="inline-flex items-baseline gap-1.5 whitespace-nowrap">
      <span>{children}</span>
      {icon ? (
        <img src={icon} alt={alt} title={alt} className={`${px} self-center object-contain`} />
      ) : (
        <span className="text-[#7d8798]">{alt === "Divine Orb" ? "div" : "c"}</span>
      )}
    </span>
  );
}

function fmt(n: number): string {
  if (Math.abs(n) >= 10000) {
    return n.toLocaleString("en-GB", { maximumFractionDigits: 0 });
  }
  return n.toLocaleString("en-GB", { maximumFractionDigits: Math.abs(n) < 10 ? 2 : 1 });
}

/** Chaos value with the Chaos Orb icon. */
export function Chaos({
  micro,
  icons,
  size,
  sign = false,
}: {
  micro: bigint;
  icons: { chaos: string | null };
  size?: "sm" | "lg";
  sign?: boolean;
}) {
  const n = microToChaos(micro);
  const prefix = sign && n > 0 ? "+" : "";
  return (
    <Coin icon={icons.chaos} alt="Chaos Orb" size={size}>
      {prefix}
      {fmt(n)}
    </Coin>
  );
}

/**
 * The same amount in both currencies, which is what people actually want at a
 * glance: chaos is the unit everything is priced in, divine is the unit large
 * numbers are legible in.
 */
export function ChaosAndDivine({
  micro,
  divineRateMicro,
  icons,
  size = "sm",
  sign = false,
}: {
  micro: bigint;
  divineRateMicro: bigint;
  icons: CurrencyIconSet;
  size?: "sm" | "lg";
  sign?: boolean;
}) {
  const chaos = microToChaos(micro);
  const divine = microToDivine(micro, divineRateMicro);
  const prefix = sign && chaos > 0 ? "+" : "";

  return (
    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
      <Coin icon={icons.chaos} alt="Chaos Orb" size={size}>
        {prefix}
        {fmt(chaos)}
      </Coin>
      <span className="text-[#7d8798]">/</span>
      <Coin icon={icons.divine} alt="Divine Orb" size={size}>
        {prefix}
        {fmt(divine)}
      </Coin>
    </span>
  );
}

export interface CurrencyIconSet {
  chaos: string | null;
  divine: string | null;
}
