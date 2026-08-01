import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { logout } from "@/app/actions";
import { CurrencyToggle } from "@/components/CurrencyToggle";

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/snapshots", label: "Snapshots" },
  { href: "/items", label: "Items" },
  { href: "/strategies", label: "Strategies" },
  { href: "/prices", label: "Prices" },
  { href: "/setup", label: "Import" },
  { href: "/settings", label: "Settings" },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-[#2a3346] bg-[#141821]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-6 py-3">
          <Link href="/" className="font-semibold text-[#c8aa6e]">
            PoE Profit Tracker
          </Link>
          <nav className="flex flex-1 flex-wrap gap-1 text-sm">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="rounded-lg px-3 py-1.5 text-[#8b97ad] transition-colors hover:bg-[#1b2130] hover:text-[#e6ebf5]"
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <CurrencyToggle current={user.displayCurrency} />
            <span className="text-sm text-[#8b97ad]">{user.username}</span>
            <form action={logout}>
              <button className="text-sm text-[#8b97ad] hover:text-[#f87171]">Sign out</button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 p-6">{children}</main>

      <footer className="border-t border-[#2a3346] px-6 py-4 text-center text-xs text-[#8b97ad]">
        Prices by poe.ninja. This product isn&apos;t affiliated with or endorsed by Grinding Gear
        Games in any way.
      </footer>
    </div>
  );
}
