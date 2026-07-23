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

`netlify.toml` sets `VITE_BASE_PATH=/` for the production domain. The local `.env` may keep `/rent/`.

Never add the Supabase service-role key to Netlify or the repository. The browser may use only the anon/publishable key, protected by Row Level Security.

## Supabase Auth

In Supabase, open **Authentication → URL Configuration**:

1. Set **Site URL** to the final Netlify URL, for example `https://your-site.netlify.app/`.
2. Add the final URL to **Redirect URLs** if the authentication flow uses redirects.
3. Keep the local URL while testing locally.

## Database migrations

Apply every SQL migration in `src/lib/migrations/` to the production Supabase project in filename order. Do not edit migrations that have already been applied; add a new migration for later changes.

## Verify after deployment

Check the public home page, `/admin/login`, the authenticated dashboard, tenant detail, payments, anonymous tenant links, and the browser console. The service worker caches only same-origin static assets; Supabase requests remain live.

## Custom domain

In Netlify, open **Domain management → Add a domain**. Netlify provisions HTTPS automatically once DNS is configured.
