# Leys Performance App

Coaching platform for Leys Performance: programs, set logging, follow-up, testing and maxes.

## Where things are

| Path | What |
| --- | --- |
| `docs/SETUP.md` | One-time setup of Supabase and Vercel |
| `supabase/migrations/0001_init.sql` | All database tables and access rules |
| `supabase/seed/exercises.sql` | Exercise library import, generated from `data/master_library.xlsx` |
| `tools/build_exercise_seed.py` | Regenerates the import after the library file changes |
| `src/app` | Screens: login, home, account, exercise library |
| `src/proxy.ts` | Keeps sessions fresh and sends logged-out visitors to the login page |
| `src/app/globals.css` | Brand colours (six values at the top) |

## Status

Done: project setup, database with access rules, login by password or email link, invitation-only accounts, coach home, exercise library with search and filters, installable to the home screen.

Next: athletes, program builder, athlete Today screen, set logging.

## Run locally

```bash
cp .env.example .env.local   # fill in the two Supabase values
npm install
npm run dev
```
