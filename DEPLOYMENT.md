# Deployment to Cloudflare Pages

This project is a static Vite application. Cloudflare Pages builds the frontend; Supabase remains the database and authentication provider.

## 1. Prepare the repository

1. Push this repository to GitHub.
2. Keep `.env` out of Git. Commit only `.env.example`.
3. Confirm that `npm run build` succeeds locally.

## 2. Create the Cloudflare Pages project

1. Open [Cloudflare Dashboard](https://dash.cloudflare.com/) and select **Workers & Pages**.
2. Select **Create application** → **Pages** → **Connect to Git**.
3. Select the GitHub repository and the production branch, usually `main`.
4. Use these build settings:

   - Framework preset: `Vite`
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Node.js version: current LTS, if Cloudflare asks for one

5. Add these production environment variables under **Settings → Environment variables**:

   - `VITE_SUPABASE_URL`: the public Supabase project URL
   - `VITE_SUPABASE_ANON_KEY`: the public anon/publishable key
   - `VITE_BASE_PATH`: `/` for the default `*.pages.dev` domain

6. Save and deploy.

The current repository default remains `/rent/` for the existing deployment. The Cloudflare variable changes the Vite base to `/` without requiring a source-code edit.

## 3. Configure Supabase Auth

In Supabase, open **Authentication → URL Configuration**:

1. Set **Site URL** to the final Cloudflare URL, for example `https://your-project.pages.dev/`.
2. Add the final URL to **Redirect URLs** if the authentication flow uses redirects.
3. Keep the existing local URL in the list while testing locally.

Do not add the service-role key to Cloudflare or the repository. The browser may use only the anon/publishable key, protected by Row Level Security.

## 4. Apply database migrations

Apply every SQL migration in `src/lib/migrations/` to the production Supabase project in filename order. Do not edit migrations that have already been applied; add a new migration for later changes.

## 5. Verify after deployment

Check these URLs and flows:

1. Public home page.
2. `/admin/login`.
3. Authenticated admin dashboard.
4. Tenant detail, payment creation, editing, and deletion.
5. Anonymous tenant public link.
6. The browser console has no Supabase or service-worker errors.

The service worker caches only same-origin static frontend assets. Supabase requests are deliberately not cached, so payment and tenant data remain live.

## 6. Custom domain (optional)

In Cloudflare Pages, open **Custom domains** and add your domain. Cloudflare provisions HTTPS automatically once DNS is configured.
