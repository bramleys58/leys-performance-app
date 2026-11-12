import Link from "next/link";
import { Card } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

function today() {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Europe/Brussels",
  }).format(new Date());
}

export default async function HomePage() {
  const user = await requireUser();
  const firstName = user.fullName.split(" ")[0];
  return user.role === "coach" ? <CoachHome firstName={firstName} /> : <AthleteHome firstName={firstName} />;
}

async function CoachHome({ firstName }: { firstName: string }) {
  const supabase = await createClient();
  const [athletes, exercises, review, programs] = await Promise.all([
    supabase.from("athletes").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("exercises").select("id", { count: "exact", head: true }).eq("archived", false),
    supabase.from("exercises").select("id", { count: "exact", head: true }).eq("needs_review", true),
    supabase.from("programs").select("id", { count: "exact", head: true }).eq("status", "active"),
  ]);

  const tiles = [
    { label: "Active athletes", value: athletes.count ?? 0, href: "/athletes" },
    { label: "Active programs", value: programs.count ?? 0 },
    { label: "Exercises", value: exercises.count ?? 0, href: "/library" },
    { label: "Exercises to review", value: review.count ?? 0, href: "/library?review=1" },
  ];

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-muted">{today()}</p>
        <h1 className="mt-1 text-2xl font-bold">{firstName ? `Hi ${firstName}` : "Coach home"}</h1>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {tiles.map((t) => {
          const body = (
            <Card className="h-full">
              <p className="text-3xl font-bold tabular-nums">{t.value}</p>
              <p className="mt-1 text-sm text-muted">{t.label}</p>
            </Card>
          );
          return t.href ? (
            <Link key={t.label} href={t.href}>
              {body}
            </Link>
          ) : (
            <div key={t.label}>{body}</div>
          );
        })}
      </div>
      <Card>
        <h2 className="font-semibold">Coming next</h2>
        <p className="mt-2 text-sm text-muted">
          Athletes, the program builder and follow-up are the next build steps. The exercise library is
          ready to browse.
        </p>
      </Card>
    </div>
  );
}

async function AthleteHome({ firstName }: { firstName: string }) {
  const supabase = await createClient();
  const { data: athlete } = await supabase.from("athletes").select("id, full_name").maybeSingle();
  const name = firstName || athlete?.full_name?.split(" ")[0] || "";

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-muted">{today()}</p>
        <h1 className="mt-1 text-2xl font-bold">{name ? `Today, ${name}` : "Today"}</h1>
      </div>
      <Card>
        <h2 className="font-semibold">No session yet</h2>
        <p className="mt-2 text-sm text-muted">
          {athlete
            ? "Your coach has not published a program for you yet. It will show up here."
            : "Your login is not linked to an athlete profile yet. Let your coach know."}
        </p>
      </Card>
    </div>
  );
}
