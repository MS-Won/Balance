# 오늘의 밸런스 게임

## Local development

This project develops against a hosted Supabase project (no local Docker-based
Supabase is used).

1. Install dependencies: `npm install`
2. Create a project at supabase.com (or reuse an existing one for this app).
3. Copy `.env.local.example` to `.env.local` and fill in
   `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` /
   `SUPABASE_SERVICE_ROLE_KEY` from the dashboard's Project Settings → API
   page. Set `ADMIN_PASSWORD` and generate `ADMIN_SESSION_SECRET` with
   `openssl rand -hex 16`.
4. Generate a personal access token at
   https://supabase.com/dashboard/account/tokens, export it as
   `SUPABASE_ACCESS_TOKEN`, then link and push the schema:
   ```bash
   npx supabase init
   npx supabase link --project-ref <PROJECT_REF> --password '<DB_PASSWORD>'
   npx supabase db push
   npx supabase gen types typescript --linked > src/types/database.ts
   ```
5. Run the app: `npm run dev`
6. Run tests: `npm run test`

If you're on a network with TLS-inspecting security software (common on some
corporate/institutional networks), Node and the Supabase CLI may reject the
intercepted certificate even though your browser trusts it. If `npm run dev`
or `npx supabase` commands fail with a certificate error, export your
network's root CA as a PEM file and set `NODE_EXTRA_CA_CERTS` (for Node/Next.js)
and `SSL_CERT_FILE` (for the Supabase CLI) to point at it before running these
commands.

## Deployment

1. Reuse the same Supabase project from local development (or create a
   separate production project) and confirm `npx supabase db push` has been
   applied to it.
2. In the Supabase dashboard, confirm the `pg_cron` extension is enabled and
   the `midnight-rollover` job is listed under Database → Cron Jobs.
3. Create a Vercel project linked to this repository.
4. Set the same environment variables from `.env.local` (using the hosted
   Supabase project's values) in the Vercel project settings.
5. Deploy. Use the Supabase dashboard SQL editor (or `/admin`) to schedule
   the first `balance_games` row with `status = 'active'` so the site has
   content on first load.
