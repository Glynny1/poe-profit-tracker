import type { ReactNode } from "react";

export function Panel({
  title,
  subtitle,
  children,
  actions,
  className = "",
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-xl border border-[#2a3346] bg-[#141821] ${className}`}
    >
      {(title || actions) && (
        <header className="flex items-start justify-between gap-4 border-b border-[#2a3346] px-5 py-3.5">
          <div>
            {title && <h2 className="font-semibold text-[#e6ebf5]">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-sm text-[#8b97ad]">{subtitle}</p>}
          </div>
          {actions}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function Button({
  children,
  variant = "default",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "primary" | "ghost" | "danger";
}) {
  const styles = {
    default: "bg-[#1b2130] border-[#2a3346] hover:bg-[#232b3d] text-[#e6ebf5]",
    primary: "bg-[#c8aa6e] border-[#c8aa6e] hover:bg-[#d8bc82] text-[#0b0d12] font-semibold",
    ghost: "bg-transparent border-transparent hover:bg-[#1b2130] text-[#8b97ad]",
    danger: "bg-transparent border-[#2a3346] hover:bg-[#2a1a1f] text-[#f87171]",
  }[variant];

  return (
    <button
      {...props}
      className={`rounded-lg border px-3.5 py-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

export function Input({ className = "", ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-lg border border-[#2a3346] bg-[#0b0d12] px-3 py-2 text-sm text-[#e6ebf5] outline-none placeholder:text-[#8b97ad]/60 focus:border-[#c8aa6e] ${className}`}
    />
  );
}

export function Label({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="mb-1.5 block text-sm font-medium text-[#e6ebf5]">
      {children}
      {hint && <span className="ml-2 font-normal text-[#8b97ad]">{hint}</span>}
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
  const styles = {
    info: "border-[#2a3346] bg-[#1b2130] text-[#8b97ad]",
    warn: "border-[#fbbf24]/40 bg-[#fbbf24]/10 text-[#fbbf24]",
    error: "border-[#f87171]/40 bg-[#f87171]/10 text-[#f87171]",
    ok: "border-[#4ade80]/40 bg-[#4ade80]/10 text-[#4ade80]",
  }[kind];
  return <div className={`rounded-lg border px-4 py-3 text-sm ${styles}`}>{children}</div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-8 text-center text-sm text-[#8b97ad]">{children}</p>;
}

export function Stat({
  label,
  value,
  tone = "neutral",
  hint,
  big = false,
}: {
  label: ReactNode;
  value: ReactNode;
  tone?: "neutral" | "gain" | "loss" | "drift" | "warn";
  hint?: ReactNode;
  big?: boolean;
}) {
  const colour = {
    neutral: "text-[#e6ebf5]",
    gain: "text-[#4ade80]",
    loss: "text-[#f87171]",
    drift: "text-[#7dd3fc]",
    warn: "text-[#fbbf24]",
  }[tone];
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-[#8b97ad]">{label}</div>
      <div className={`${big ? "text-4xl" : "text-2xl"} font-semibold ${colour} mt-1`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-[#8b97ad]">{hint}</div>}
    </div>
  );
}
