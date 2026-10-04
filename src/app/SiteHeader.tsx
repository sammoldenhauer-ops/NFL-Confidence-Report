"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function SiteHeader() {
  const pathname = usePathname();
  if (pathname?.startsWith("/prizepicks")) return null;

  return (
    <header className="border-b border-zinc-200 dark:border-zinc-800">
      <nav className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-3 text-sm font-medium">
        <Link href="/" className="font-semibold tracking-tight">
          NFL Confidence Report
        </Link>
        <Link href="/prizepicks" className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50">
          PrizePicks
        </Link>
      </nav>
    </header>
  );
}
