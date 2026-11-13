"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { signOut } from "@/app/login/actions";

export type MenuSection = { title: string; links: { href: string; label: string; icon: string }[] };

/** Top bar with a ☰ button on the left that slides the menu in from the left. */
export function AppMenu({ sections, name, role }: { sections: MenuSection[]; name: string; role: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // While the menu is open: no page scrolling behind it, and Escape closes it.
  useEffect(() => {
    if (!open) return;
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = before;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/"));

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-border bg-bg/90 backdrop-blur">
        <div className="mx-auto flex h-[49px] w-full max-w-3xl items-center gap-3 px-3">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            aria-expanded={open}
            aria-controls="app-menu"
            className="flex h-10 w-10 items-center justify-center rounded-lg text-text active:bg-surface-2"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
          <Link href="/" className="text-xs font-semibold tracking-[0.25em] text-accent">
            LEYS PERFORMANCE
          </Link>
        </div>
      </header>

      {/* Dark backdrop: tapping it closes the menu. */}
      <div
        onClick={() => setOpen(false)}
        aria-hidden
        className={`fixed inset-0 z-40 bg-black/60 transition-opacity duration-200 ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}
      />

      <nav
        id="app-menu"
        aria-label="Main menu"
        aria-hidden={!open}
        inert={!open}
        className={`fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-border bg-surface shadow-2xl transition-transform duration-200 ease-out ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex h-[49px] items-center justify-between border-b border-border px-4">
          <span className="text-xs font-semibold tracking-[0.25em] text-accent">LEYS PERFORMANCE</span>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close menu" className="flex h-9 w-9 items-center justify-center rounded-lg text-muted active:bg-surface-2">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-4">
          {sections.map((section) => (
            <div key={section.title} className="mb-5">
              <p className="px-3 pb-1.5 text-[11px] font-semibold tracking-[0.2em] text-muted">{section.title.toUpperCase()}</p>
              <ul className="space-y-0.5">
                {section.links.map((l) => {
                  const active = isActive(l.href);
                  return (
                    <li key={l.href}>
                      <Link
                        href={l.href}
                        onClick={() => setOpen(false)}
                        aria-current={active ? "page" : undefined}
                        className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${active ? "bg-accent/15 font-semibold text-text" : "text-muted hover:bg-surface-2 hover:text-text"}`}
                      >
                        <span aria-hidden className="w-5 text-center">
                          {l.icon}
                        </span>
                        {l.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>

        <div className="border-t border-border px-4 py-3">
          <p className="truncate text-sm font-medium">{name}</p>
          <p className="text-xs text-muted">{role}</p>
          <form action={signOut} className="mt-2">
            <button className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-muted">Log out</button>
          </form>
        </div>
      </nav>
    </>
  );
}
