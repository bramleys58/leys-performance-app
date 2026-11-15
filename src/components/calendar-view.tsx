import Link from "next/link";
import { Card } from "@/components/ui";
import { shiftMonth, type CalDay, type CalItem, type getCalendar } from "@/lib/calendar";

type Data = Awaited<ReturnType<typeof getCalendar>>;

const DAYS = ["M", "T", "W", "T", "F", "S", "S"];

/** A small mark per item. Shape and fill differ, so it never depends on colour alone. */
function Mark({ item }: { item: CalItem }) {
  if (item.kind === "done") return <span className="h-2 w-2 rounded-full bg-ok" />;
  if (item.kind === "started") return <span className="h-2 w-2 rounded-full border-2 border-ok" />;
  if (item.kind === "planned") return <span className="h-2 w-2 rounded-full border-2 border-accent" />;
  if (item.kind === "missed") return <span className="h-0.5 w-2 rounded bg-muted" />;
  return <span className="h-2 w-2 rotate-45 bg-text" />;
}

function describe(d: CalDay): string {
  const parts = d.items.map((i) => `${i.name}, ${i.kind === "done" ? "done" : i.kind === "started" ? "in progress" : i.kind === "planned" ? "planned" : i.kind === "missed" ? "not done" : "test day"}`);
  if (d.checkedIn) parts.push("checked in");
  return parts.length ? parts.join("; ") : "nothing planned";
}

export function CalendarView({ data, selected, basePath }: { data: Data; selected: string; basePath: string }) {
  const title = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }).format(new Date(data.month + "-15T12:00:00Z"));
  const long = (d: string) => new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" }).format(new Date(d + "T12:00:00Z"));
  const day = data.days.find((d) => d.date === selected) ?? data.days.find((d) => d.isToday) ?? data.days.find((d) => d.inMonth)!;
  const hours = data.totals.minutes >= 60 ? `${Math.floor(data.totals.minutes / 60)} h ${data.totals.minutes % 60} min` : `${data.totals.minutes} min`;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <Link href={`${basePath}?m=${shiftMonth(data.month, -1)}`} aria-label="Previous month" className="rounded-lg border border-border bg-surface-2 px-3 py-2">
          ←
        </Link>
        <h2 className="text-lg font-semibold">{title}</h2>
        <Link href={`${basePath}?m=${shiftMonth(data.month, 1)}`} aria-label="Next month" className="rounded-lg border border-border bg-surface-2 px-3 py-2">
          →
        </Link>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-2">
        <div className="grid grid-cols-7 text-center text-xs text-muted">
          {DAYS.map((d, i) => (
            <span key={i} className="py-1">
              {d}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {data.days.map((d) => {
            const isSelected = d.date === day.date;
            return (
              <Link
                key={d.date}
                href={`${basePath}?m=${data.month}&d=${d.date}`}
                scroll={false}
                aria-label={`${long(d.date)}: ${describe(d)}`}
                aria-current={isSelected ? "date" : undefined}
                className={`flex h-14 flex-col items-center justify-start rounded-lg pt-1.5 ${isSelected ? "bg-accent/20 ring-1 ring-accent" : "hover:bg-surface-2"} ${d.inMonth ? "" : "opacity-35"}`}
              >
                <span className={`flex h-6 w-6 items-center justify-center rounded-full text-sm tabular-nums ${d.isToday ? "bg-text font-bold text-bg" : ""}`}>{Number(d.date.slice(8))}</span>
                <span className="mt-1 flex h-2 items-center gap-0.5">
                  {d.items.slice(0, 3).map((i) => (
                    <Mark key={i.kind + i.id} item={i} />
                  ))}
                </span>
                {d.checkedIn && <span className="mt-0.5 h-0.5 w-3 rounded bg-ok/60" />}
              </Link>
            );
          })}
        </div>
        <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 border-t border-border px-2 pt-2 text-xs text-muted">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-ok" /> done</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full border-2 border-accent" /> planned</span>
          <span className="flex items-center gap-1.5"><span className="h-0.5 w-2 rounded bg-muted" /> not done</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rotate-45 bg-text" /> test</span>
          <span className="flex items-center gap-1.5"><span className="h-0.5 w-3 rounded bg-ok/60" /> check-in</span>
        </div>
      </div>

      <Card>
        <h3 className="font-semibold">{long(day.date)}</h3>
        {day.items.length === 0 && <p className="mt-2 text-sm text-muted">Nothing planned.</p>}
        <ul className="mt-2 divide-y divide-border">
          {day.items.map((i) => {
            const status =
              i.kind === "done" ? `Done${i.minutes ? ` · ${i.minutes} min` : ""}` : i.kind === "started" ? "In progress" : i.kind === "planned" ? (i.slot ? "With your coach" : i.optional ? "Planned · optional" : "Planned") : i.kind === "missed" ? "Not done" : "Test day";
            const body = (
              <span className="flex items-center justify-between gap-3 py-2.5">
                <span className="flex min-w-0 items-center gap-2.5">
                  <span className="flex w-3 justify-center"><Mark item={i} /></span>
                  <span className="truncate font-medium">{i.name}</span>
                </span>
                <span className="shrink-0 text-sm text-muted">{status}{i.kind !== "test" ? " →" : ""}</span>
              </span>
            );
            return <li key={i.kind + i.id}>{i.kind === "test" ? body : <Link href={i.href}>{body}</Link>}</li>;
          })}
        </ul>
        {day.checkedIn && <p className="mt-2 text-sm text-muted">Daily check-in done.</p>}
      </Card>

      <p className="text-center text-sm text-muted">
        This month: {data.totals.done} workout{data.totals.done === 1 ? "" : "s"} done
        {data.totals.minutes > 0 ? ` in ${hours}` : ""}
        {data.totals.missed > 0 ? ` · ${data.totals.missed} not done` : ""}
        {data.totals.planned > 0 ? ` · ${data.totals.planned} still planned` : ""}
      </p>
    </div>
  );
}
