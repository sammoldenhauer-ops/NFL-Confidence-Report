"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const NAV = [
  { href: "/prizepicks", label: "Home" },
  { href: "/prizepicks/entry-builder", label: "Entry Builder" },
  { href: "/prizepicks/entry-input", label: "Entry Input" },
  { href: "/prizepicks/payout-finder", label: "Payout Finder" },
  { href: "/prizepicks/anytime-tds", label: "Anytime TDs" },
  { href: "/prizepicks/best-legs", label: "Best Legs" },
  { href: "/prizepicks/all-lines", label: "All Lines" },
  { href: "/prizepicks/injuries", label: "Injuries" },
  { href: "/prizepicks/info-math", label: "Info & Math" },
];

export default function Sidebar() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <>
      <button
        type="button"
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((v) => !v)}
        className="fixed left-4 top-4 z-50 flex h-11 w-11 flex-col items-center justify-center gap-1.5 rounded-md bg-white/90"
      >
        <span className="h-1 w-6 rounded bg-black" />
        <span className="h-1 w-6 rounded bg-black" />
        <span className="h-1 w-6 rounded bg-black" />
      </button>

      {open && (
        <div className="fixed inset-0 z-40 bg-black/60" onClick={() => setOpen(false)}>
          <nav
            onClick={(e) => e.stopPropagation()}
            className="flex h-full w-56 flex-col gap-6 bg-black/95 px-5 pt-20 text-lg"
          >
            {NAV.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="pp-title text-sm leading-snug"
                  style={{ color: active ? "var(--pp-teal)" : "var(--pp-fg)" }}
                >
                  {item.label.toUpperCase()}
                </Link>
              );
            })}
          </nav>
        </div>
      )}
    </>
  );
}
