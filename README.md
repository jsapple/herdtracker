# Herd Tracker — deploy checklist

## 1. Database
Run `schema.sql` once in Supabase's SQL editor (already done if you did this earlier).

## 2. Netlify environment variables
Site settings → Environment variables (or "Project configuration" on newer UIs):
- `SUPABASE_URL` = your project URL (https://teqdvcqvktgdghdiknql.supabase.co)
- `SUPABASE_SERVICE_ROLE_KEY` = the service_role secret from Supabase → Project Settings → API
- `ADMIN_SECRET` = any long random string you make up — this is YOUR password for creating producer accounts at /admin.html. Not the Supabase key.

## 3. Folder layout to deploy
This whole folder is the site:
```
netlify.toml
package.json              ← installs @supabase/supabase-js for the functions
netlify/functions/        ← the backend
public/                   ← the website (index.html, app.js, stats.js, manifest, icons, admin.html)
```
Deploy it as a Git repo connected to Netlify. The Supabase library has to
live in the root package.json. Netlify does not install a package.json that
sits inside netlify/functions.

## 4. First producer
Visit yoursite.netlify.app/admin.html, enter your ADMIN_SECRET, and create
your first producer account. Email them the code it gives you — that's
their sign-in.

## 5. Try it
- Producer: open the site, use the producer code to sign in. A code works
  on up to four devices.
- Add a client. The page opens on that client so the code stays on screen.
- Enter weights with Weigh. The date starts as today on that phone or
  computer. Change the date to key in an earlier weigh-in.
- Share that client's code with yourself on a second device to see the
  client view.

## What's NOT built yet
- A full owner console (producer list, renewal tracking) — admin.html is
  just "create one producer." Fine for a handful of producers by hand.
- Automatic email delivery of codes — you send them yourself for now.
- Expiring unused codes.
