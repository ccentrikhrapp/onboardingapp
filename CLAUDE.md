# Working in this repo

This repo contains two live, production Supabase-backed apps (`apps/hr`, `apps/recruitment`), each with its own Supabase project and its own production Vercel deployment. Treat every push and every deploy as touching production — because it does.

## Local-first workflow — required, not optional

1. Make the change. Run it locally (`npm run dev`, or against local state where applicable) and actually exercise the behavior, not just confirm it compiles.
2. Run `npm run build` and `npm run test` (the SSR smoke test) in the affected app. Both must pass before anything leaves this machine.
3. Stop there. Report what changed and that it's verified locally.
4. Do **not** run `git push`, `vercel --prod`, `supabase functions deploy`, or `supabase db query`/`db push` against a live project — none of it — until the user explicitly says to proceed, for that specific change.
5. Each go-ahead is scoped to the change it was given for. It is not standing permission for whatever comes next in the same session.

See `.claude/skills/safe-deploy/SKILL.md` for the full checklist — load it before building or shipping anything in this repo.
