import { AppMenu, type MenuSection } from "@/components/app-menu";
import { requireUser } from "@/lib/auth";
import { getMyAthlete } from "@/lib/athlete";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const athlete = await getMyAthlete();

  const sections: MenuSection[] =
    user.role === "coach"
      ? [
          {
            title: "Coaching",
            links: [
              { href: "/", label: "Home", icon: "🏠" },
              { href: "/athletes", label: "Athletes", icon: "👥" },
              { href: "/follow-up", label: "Follow-up", icon: "📋" },
              { href: "/testing", label: "Testing", icon: "⏱️" },
            ],
          },
          { title: "Programming", links: [{ href: "/library", label: "Exercise library", icon: "📚" }] },
          ...(athlete
            ? [
                {
                  title: "My training",
                  links: [
                    { href: "/me", label: "Today", icon: "💪" },
                    { href: "/progress", label: "My progress", icon: "📈" },
                    { href: "/history", label: "Workout history", icon: "🕘" },
                  ],
                },
              ]
            : []),
          { title: "Account", links: [{ href: "/account", label: "Account", icon: "👤" }] },
        ]
      : [
          {
            title: "Training",
            links: [
              { href: "/", label: "Today", icon: "💪" },
              { href: "/progress", label: "My progress", icon: "📈" },
              { href: "/history", label: "Workout history", icon: "🕘" },
            ],
          },
          { title: "Account", links: [{ href: "/account", label: "Account", icon: "👤" }] },
        ];

  const name = user.fullName || athlete?.full_name || user.email;

  return (
    <>
      <AppMenu sections={sections} name={name} role={user.role === "coach" ? "Coach" : "Athlete"} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-6 has-[.page-wide]:lg:max-w-6xl">{children}</main>
    </>
  );
}
