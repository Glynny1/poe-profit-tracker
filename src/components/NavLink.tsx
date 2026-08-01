"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Nav item that knows whether it is the current page.
 *
 * "Where am I" was previously unanswerable from the chrome: every link looked
 * identical whichever page you were on. The active state is carried by weight
 * and colour plus an underline rule, not by colour alone.
 */
export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const active = href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={
        "relative mx-2 rounded-md py-2 text-sm transition-colors duration-150 ease-out " +
        (active
          ? "font-medium text-[#e4e8f0] after:absolute after:inset-x-0 after:-bottom-3 after:h-px after:bg-[#c8aa6e]"
          : "text-[#7d8798] hover:text-[#aab3c2]")
      }
    >
      {children}
    </Link>
  );
}
