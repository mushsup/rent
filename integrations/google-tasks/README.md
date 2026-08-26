# Google Tasks ↔ E-Bike

This Google Apps Script mirrors the `E-Bike` Google Tasks list with the
`bike_tasks` table in Supabase every minute.

## One-time setup

1. Open [script.google.com](https://script.google.com) with the same Google
   account used by Gemini and create a standalone project named `E-Bike Sync`.
2. Replace `Code.gs` with the contents of this folder's `Code.gs`.
3. Open **Project Settings**, enable **Show "appsscript.json" manifest file**,
   and replace the manifest with this folder's `appsscript.json`.
4. In **Project Settings → Script properties**, add:
   - `SUPABASE_FUNCTION_URL`:
     `https://geeyefhmccqbtvlfesba.supabase.co/functions/v1/google-tasks-sync`
   - `SYNC_SECRET`: use the value from the local `.google-tasks-sync-secret`
     file.
   - `TASK_LIST_TITLE`: `E-Bike`
5. Run `installSyncTrigger` once and approve access to Google Tasks and external
   network requests. The function also performs the first sync immediately.

## Instant site-to-Google push

The five-minute trigger remains the recovery path, but tasks created or changed
on the site can be sent immediately through an Apps Script web app:

1. In **Deploy → New deployment**, choose **Web app**, execute as yourself and
   allow access to anyone with the link.
2. Copy the web app URL.
3. Add a `WEBHOOK_SECRET` Script property. It may be the same value as
   `SYNC_SECRET`.
4. Set these Supabase Edge Function secrets:
   - `GOOGLE_TASKS_WEBHOOK_URL`: the web app URL;
   - `GOOGLE_TASKS_WEBHOOK_SECRET`: the same value as `WEBHOOK_SECRET`;
   - `GOOGLE_TASKS_LIST_TITLE`: `E-Bike`.
5. Redeploy the `google-tasks-push` Edge Function and the site.

After that, creating, editing, completing, or deleting a task on the site calls
Google Tasks immediately. The one-minute trigger imports changes made directly
in Google Tasks.

## Voice format

Use Gemini Live with a command such as:

> Добавь в Google Tasks, в список E-Bike: m12 — заменить задние колодки,
> высокий приоритет, срок в пятницу.

MTB codes use `m1`, `m2`, and so on; FAT bike codes use `f1`, `f2`, and so on.
Spaces and hyphens are accepted, so `m 12` and `f-3` are recognized too. If no
code or exact model is recognized, the task still appears on the site's general
Tasks page with no bike selected, where it can be assigned manually.

## Conflict behavior

The newest edit wins. Site edits are pushed to Google Tasks, while Google title,
notes, due date, completion, and deletion changes are pulled into Supabase.
Google Tasks has no in-progress or priority fields, so:

- `in_progress` is represented as an unchecked Google task;
- priority is stored in the task notes;
- bike identity is stored in both the title prefix and notes.
