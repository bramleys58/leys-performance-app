# Setup: connecting the app to Supabase and Vercel

Do these once. Menu names in Supabase and Vercel change now and then, so a label may differ slightly from what is written here.

## 1. Create the database tables (Supabase)

1. Open your project in Supabase and go to **SQL Editor**.
2. Open `supabase/migrations/0001_init.sql` from this repository, copy everything, paste it in the editor and press **Run**. It should finish with "Success".
3. Do the same with `supabase/seed/exercises.sql`. This loads the exercise library (810 exercises). It is safe to run twice.

## 2. Lock down logins (Supabase)

Under **Authentication**:

1. **Sign In / Providers:** turn off "Allow new users to sign up" and save. Accounts are by invitation only.
2. **URL Configuration:**
   - **Site URL:** `https://YOUR-APP-ADDRESS/auth/callback` (invite emails land here)
   - **Redirect URLs:** add `https://YOUR-APP-ADDRESS/auth/confirm` (login-link emails land here)

The email templates stay on Supabase's defaults. They can only be edited after connecting your own email service (custom SMTP), which is a later step.

## 3. Create your coach login (Supabase)

1. **Authentication > Users > Add user.** Enter your email and a strong password, and tick "Auto confirm user".
2. Back in the **SQL Editor**, run this with your own email address:

```sql
update public.profiles
set role = 'coach', full_name = 'Bram Leys'
where id = (select id from auth.users where email = 'YOUR-EMAIL-HERE');
```

Everyone else you invite later is an athlete automatically.

## 4. Put the app online (Vercel)

1. In Vercel choose **Add New > Project** and import `leys-performance-app` from GitHub.
2. Before deploying, open **Environment Variables** and add two values. Both are in Supabase under **Project Settings > API** (or the **Connect** button):
   - `NEXT_PUBLIC_SUPABASE_URL` : the project URL
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` : the publishable key (older projects call it the anon key)
3. Press **Deploy**. After a minute you get an address like `leys-performance-app.vercel.app`.
4. Go back to step 2.2 and fill in that address.

Never put the database password or the "secret" / "service role" key in Vercel variables that start with `NEXT_PUBLIC_`. The app does not need them.

## 5. Check that it works

1. Open the app address on your phone and log in with the coach login from step 3.
2. You should see the coach home with the number of exercises, and **Library** should list them.
3. On your phone, use "Add to Home Screen" to install it like an app.

## Good to know

- Supabase's built-in email sending is limited to a few emails per hour. Fine for testing. Before inviting a full roster, connect an email service (step for later).
- The free Supabase plan pauses a project after a week without activity. Move to the paid plan before athletes depend on it.
- From now on every push to the `main` branch on GitHub goes live on Vercel automatically.
