import ExcelJS from "exceljs";
import { requireCoach } from "@/lib/auth";
import { todayISO } from "@/lib/plan";
import { createClient } from "@/lib/supabase/server";

// Every table, one sheet each, in an order that reads well. Uploaded resource files are not
// included (only their titles and links), they stay in storage.
const TABLES: [table: string, sheet: string][] = [
  ["athletes", "Athletes"],
  ["programs", "Programs"],
  ["sessions", "Sessions"],
  ["session_exercises", "Session exercises"],
  ["workout_logs", "Workouts"],
  ["workout_exercises", "Workout exercises"],
  ["set_logs", "Sets"],
  ["workout_exercise_notes", "Exercise notes"],
  ["workout_reviews", "Workout reviews"],
  ["workout_swaps", "Swaps"],
  ["maxes", "Maxes"],
  ["bodyweights", "Bodyweights"],
  ["check_ins", "Daily check-ins"],
  ["weekly_check_ins", "Weekly check-ins"],
  ["habits", "Habits"],
  ["habit_logs", "Habit logs"],
  ["injury_notes", "Injury log"],
  ["tests", "Tests"],
  ["test_events", "Test days"],
  ["test_results", "Test results"],
  ["client_packages", "Packages"],
  ["exercises", "Exercise library"],
  ["exercise_alternatives", "Exercise alternatives"],
  ["resources", "Resources"],
  ["profiles", "Logins"],
];

/** Downloads everything in the app as one spreadsheet. Coach only. */
export async function GET() {
  await requireCoach();
  const supabase = await createClient();

  const read = async (table: string) => {
    const rows: Record<string, unknown>[] = [];
    // The API returns at most 1000 rows at a time.
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from(table).select("*").range(from, from + 999);
      if (error) throw new Error(`${table}: ${error.message}`);
      rows.push(...((data ?? []) as Record<string, unknown>[]));
      if (!data || data.length < 1000) return rows;
    }
  };

  const data = new Map<string, Record<string, unknown>[]>();
  for (const [table] of TABLES) data.set(table, await read(table));
  // A name next to every athlete id, so the sheets read without looking ids up.
  const names = new Map((data.get("athletes") ?? []).map((a) => [a.id as string, a.full_name as string]));

  const wb = new ExcelJS.Workbook();
  wb.creator = "Leys Performance";
  wb.created = new Date();
  const about = wb.addWorksheet("Read me");
  about.addRows([
    ["Leys Performance backup"],
    [`Made on ${todayISO()}. One sheet per table; ids link the sheets together (athlete_id points to Athletes, and so on).`],
    ["Weights are in kg. Uploaded resource files are not in here, only their titles and links."],
    [],
    ["Sheet", "Rows"],
    ...TABLES.map(([table, sheet]) => [sheet, data.get(table)?.length ?? 0]),
  ]);
  about.getRow(1).font = { bold: true, size: 14 };
  about.getRow(5).font = { bold: true };
  about.getColumn(1).width = 28;

  for (const [table, sheet] of TABLES) {
    const rows = data.get(table) ?? [];
    const ws = wb.addWorksheet(sheet);
    const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))];
    const withName = keys.includes("athlete_id") && table !== "athletes";
    const cols = withName ? ["athlete_name", ...keys] : keys;
    if (cols.length === 0) {
      ws.addRow(["No rows"]);
      continue;
    }
    ws.addRow(cols).font = { bold: true };
    for (const r of rows) {
      ws.addRow(
        cols.map((c) => {
          const v = c === "athlete_name" ? names.get(r.athlete_id as string) ?? "" : r[c];
          if (v == null) return null;
          if (typeof v === "object") return JSON.stringify(v);
          return v as string | number | boolean;
        }),
      );
    }
    ws.views = [{ state: "frozen", ySplit: 1 }];
    cols.forEach((c, i) => (ws.getColumn(i + 1).width = Math.min(40, Math.max(10, c.length + 2))));
  }

  const buffer = await wb.xlsx.writeBuffer();
  return new Response(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="leys-performance-backup-${todayISO()}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
