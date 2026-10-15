# Deployment to Netlify

This is a static Vite application. Netlify hosts the frontend; Supabase remains the database and authentication provider.

## First-time setup

Install dependencies and authorize the Netlify CLI once:

```bash
npm install
npx netlify login
```

The browser will open for authorization. On the first deploy, Netlify asks whether to create a new site; confirm the default team and a site name.

After that, every production deploy is one command:

```bash
npm run deploy
```

The command builds the app and publishes `dist/` to Netlify.

## Production environment variables

In Netlify, open **Site configuration → Environment variables** and add:

- `VITE_SUPABASE_URL`: the public Supabase project URL.
- `VITE_SUPABASE_ANON_KEY`: the public anon/publishable key.

The app is served from the domain root. No `VITE_BASE_PATH` is used. `netlify.toml` rewrites every path to `/index.html` with status 200 (a rewrite, not a redirect: the URL stays untouched) so `BrowserRouter` deep links work on refresh and when opened directly.

Never add the Supabase service-role key to Netlify or the repository. The browser may use only the anon/publishable key, protected by Row Level Security.

## Supabase Auth

In Supabase, open **Authentication → URL Configuration**:

1. Set **Site URL** to the final Netlify URL, for example `https://your-site.netlify.app/`.
2. Add the final URL to **Redirect URLs** if the authentication flow uses redirects.
3. Keep the local URL while testing locally.

## Database migrations

Test migrations against local Supabase with `npm run db:reset`, then link the intended staging project and run `supabase db push`. Regenerate types with `npm run db:types` and run the full quality suite before applying the same immutable migrations to production. Never use the legacy `supabase_setup.sql` for a new environment.

After creating a new Auth operator, insert that user's UUID into `public.admin_users` using a privileged server-side/admin workflow. An Auth account without this allowlist membership intentionally has no operational table access.

## Verify after deployment

Check the public home page, the inline login on `/admin`, the authenticated dashboard, tenant detail, payments, anonymous tenant links, and the browser console. The service worker caches only same-origin static assets; Supabase requests remain live.

## Custom domain

In Netlify, open **Domain management → Add a domain**. Netlify provisions HTTPS automatically once DNS is configured.
