# Leys Performance App

Coaching platform for Leys Performance: programs, set logging, follow-up, testing and maxes.

## Where things are

| Path | What |
| --- | --- |
| `docs/SETUP.md` | One-time setup of Supabase and Vercel |
| `supabase/migrations/` | Database tables and access rules, run in number order |
| `supabase/seed/exercises.sql` | Exercise library import, generated from `data/master_library.xlsx` |
| `tools/build_exercise_seed.py` | Regenerates the import after the library file changes |
| `src/app` | Screens: login, home, account, exercise library |
| `src/proxy.ts` | Keeps sessions fresh and sends logged-out visitors to the login page |
| `src/app/globals.css` | Brand colours (six values at the top) |

## Status

Done:
- Project setup, database with access rules, invitation-only logins
- Coach: home, athletes, program builder (prep circuit, supersets, targets, notes), exercise library, logging for a client
- Athlete: Today and this week, workout preview, set-by-set logging, finish with session RPE, summary with personal records, history
- Installable to the home screen

Next: follow-up overview for the coach, testing days, maxes sheet, My Progress charts.

## Checks

```bash
npm run lint
node --experimental-strip-types --no-warnings tools/plan.test.mjs
```

## Run locally

```bash
cp .env.example .env.local   # fill in the two Supabase values
npm install
npm run dev
```
