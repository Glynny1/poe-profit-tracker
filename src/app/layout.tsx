import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PoE Profit Tracker",
  description: "Snapshot your stash, and see real profit separated from price drift.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
