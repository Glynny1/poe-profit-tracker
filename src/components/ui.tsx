import type { ReactNode } from "react";

/**
 * Panels come in three weights so a page has a shape at squint distance.
 * If every container has identical border, padding and background, the layout
 * has no hierarchy no matter how good the content is.
 *
 *   hero    the one thing this page is about. Used once per view.
 *   default structure. Hairline border, no fill.
 *   quiet   supporting detail that should recede.
 */
export function Panel({
  title,
  subtitle,
  children,
  actions,
  variant = "default",
  className = "",
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  variant?: "hero" | "default" | "quiet";
  className?: string;
}) {
  const surface = {
    hero: "border-[#262c3a] bg-[#161a23]",
    default: "border-[#262c3a] bg-[#10131a]",
    quiet: "border-[#262c3a]/60 bg-transparent",
  }[variant];

  return (
    <section className={`rounded-xl border ${surface} ${className}`}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 border-b border-[#262c3a] px-5 py-4">
          <div className="min-w-0">
            {title && <h2 className="t-title text-[#e4e8f0]">{title}</h2>}
            {subtitle && <p className="t-caption measure mt-1 text-[#7d8798]">{subtitle}</p>}
          </div>
          {actions}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

const BUTTON_BASE =
  "inline-flex items-center justify-center rounded-lg border px-3.5 py-2 text-sm font-medium " +
  // Named properties with an explicit duration, never `all`.
  "transition-[background-color,border-color,color] duration-150 ease-out " +
  "disabled:cursor-not-allowed disabled:opacity-40";

export function Button({
  variant = "default",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "primary" | "ghost" | "danger";
}) {
  const styles = {
    primary:
      "border-[#c8aa6e] bg-[#c8aa6e] text-[#0a0c11] font-semibold hover:bg-[#d6bb84] hover:border-[#d6bb84] active:bg-[#b9995d]",
    default:
      "border-[#262c3a] bg-[#1d222d] text-[#e4e8f0] hover:bg-[#262c3a] hover:border-[#39415280] active:bg-[#1d222d]",
    ghost:
      "border-transparent bg-transparent text-[#aab3c2] hover:bg-[#1d222d] hover:text-[#e4e8f0]",
    danger:
      "border-[#262c3a] bg-transparent text-[#f87171] hover:bg-[#f87171]/10 hover:border-[#f87171]/40",
  }[variant];

  return <button {...props} className={`${BUTTON_BASE} ${styles} ${className}`} />;
}

export function Input({ className = "", ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={
        "w-full rounded-lg border border-[#262c3a] bg-[#0a0c11] px-3 py-2 text-sm text-[#e4e8f0] " +
        "transition-[border-color] duration-150 ease-out " +
        "placeholder:text-[#7d8798]/70 hover:border-[#394152] focus:border-[#c8aa6e] focus:outline-none " +
        `focus-visible:outline-none ${className}`
      }
    />
  );
}

export function Textarea({
  className = "",
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={
        "w-full rounded-lg border border-[#262c3a] bg-[#0a0c11] p-3 font-mono text-xs text-[#e4e8f0] " +
        "transition-[border-color] duration-150 ease-out " +
        "placeholder:text-[#7d8798]/60 hover:border-[#394152] focus:border-[#c8aa6e] focus:outline-none " +
        `focus-visible:outline-none ${className}`
      }
    />
  );
}

export function Label({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="mb-1.5 block text-sm font-medium text-[#e4e8f0]">
      {children}
      {hint && <span className="ml-2 font-normal text-[#7d8798]">{hint}</span>}
    </label>
  );
}

export function Alert({
  kind = "info",
  children,
}: {
  kind?: "info" | "warn" | "error" | "ok";
  children: ReactNode;
}) {
  // A hairline left rule rather than a full tinted box, so a page with several
  // notes doesn't turn into a stack of shouting rectangles.
  const styles = {
    info: "border-l-[#394152] text-[#aab3c2]",
    warn: "border-l-[#fbbf24] text-[#e4e8f0]",
    error: "border-l-[#f87171] text-[#e4e8f0]",
    ok: "border-l-[#4ade80] text-[#e4e8f0]",
  }[kind];
  return (
    <div className={`measure border-l-2 py-1 pl-4 text-sm ${styles}`}>{children}</div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-8 text-center text-sm text-[#7d8798]">{children}</p>;
}

/**
 * Stat sizes: `hero` is reserved for the single most important number on a
 * page. Everything else steps down, so the eye has somewhere to land.
 */
export function Stat({
  label,
  value,
  tone = "neutral",
  hint,
  size = "md",
}: {
  label: ReactNode;
  value: ReactNode;
  tone?: "neutral" | "gain" | "loss" | "drift" | "warn";
  hint?: ReactNode;
  size?: "hero" | "md" | "sm";
}) {
  const colour = {
    neutral: "text-[#e4e8f0]",
    gain: "text-[#4ade80]",
    loss: "text-[#f87171]",
    drift: "text-[#7dd3fc]",
    warn: "text-[#fbbf24]",
  }[tone];
  const scale = {
    hero: "t-display",
    md: "text-2xl font-semibold leading-tight",
    sm: "text-lg font-semibold leading-tight",
  }[size];

  return (
    <div>
      <div className="t-label text-[#7d8798]">{label}</div>
      <div className={`${scale} ${colour} mt-1.5`}>{value}</div>
      {hint && <div className="t-caption measure mt-1.5 text-[#7d8798]">{hint}</div>}
    </div>
  );
}

/** Table primitives, so every table on the site has the same rhythm. */
export function Th({
  children,
  align = "left",
  className = "",
}: {
  children?: ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <th
      className={`t-label border-b border-[#262c3a] pb-2.5 font-medium text-[#7d8798] ${
        align === "right" ? "text-right" : "text-left"
      } ${className}`}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align = "left",
  className = "",
}: {
  children?: ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <td className={`py-2.5 ${align === "right" ? "text-right" : ""} ${className}`}>{children}</td>
  );
}

export function Tr({ children }: { children: ReactNode }) {
  return (
    <tr className="border-b border-[#262c3a]/50 transition-colors duration-150 ease-out last:border-0 hover:bg-[#10131a]">
      {children}
    </tr>
  );
}
