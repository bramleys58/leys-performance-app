import Link from "next/link";
import { requireUser } from "@/lib/auth";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const links =
    user.role === "coach"
      ? [
          { href: "/", label: "Home" },
          { href: "/athletes", label: "Athletes" },
          { href: "/library", label: "Library" },
          { href: "/account", label: "Account" },
        ]
      : [
          { href: "/", label: "Today" },
          { href: "/account", label: "Account" },
        ];

  return (
    <>
      <header className="sticky top-0 z-10 border-b border-border bg-bg/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-5 py-3">
          <Link href="/" className="text-xs font-semibold tracking-[0.25em] text-accent">
            LEYS PERFORMANCE
          </Link>
          <nav className="flex gap-4 text-sm">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="text-muted hover:text-text">
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-6">{children}</main>
    </>
  );
}
