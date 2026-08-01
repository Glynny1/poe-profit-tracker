import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { logout } from "@/app/actions";
import { CurrencyToggle } from "@/components/CurrencyToggle";
import { NavLink } from "@/components/NavLink";

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/strategies", label: "Strategies" },
  { href: "/items", label: "Items" },
  { href: "/snapshots", label: "Snapshots" },
  { href: "/setup", label: "Import" },
  { href: "/prices", label: "Prices" },
  { href: "/settings", label: "Settings" },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-screen flex-col">
      {/* The header sits on the page colour with a hairline rule rather than its
          own fill, so the panels below are the only raised surfaces. */}
      <header className="sticky top-0 z-30 border-b border-[#262c3a] bg-[#0a0c11]/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-8 gap-y-3 px-6 py-3">
          <Link
            href="/"
            className="flex items-baseline gap-2 rounded-md text-[#e4e8f0] transition-colors duration-150 ease-out hover:text-[#c8aa6e]"
          >
            <span className="font-semibold tracking-tight">Profit Tracker</span>
            <span className="t-caption text-[#7d8798]">{user.league}</span>
          </Link>

          <nav className="-mx-2 flex flex-1 flex-wrap items-center">
            {NAV.map((n) => (
              <NavLink key={n.href} href={n.href}>
                {n.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-4">
            <CurrencyToggle current={user.displayCurrency} />
            <span className="t-caption text-[#7d8798]">{user.username}</span>
            <form action={logout}>
              <button className="t-caption rounded-md text-[#7d8798] transition-colors duration-150 ease-out hover:text-[#f87171]">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</main>

      <footer className="mt-8 border-t border-[#262c3a] px-6 py-5">
        <p className="t-caption mx-auto max-w-6xl text-[#7d8798]">
          Prices by poe.ninja. This product isn&apos;t affiliated with or endorsed by Grinding Gear
          Games in any way.
        </p>
      </footer>
    </div>
  );
}
