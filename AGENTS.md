This is a TanStack Start app on Cloudflare Workers. `pnpm dev` runs Vite with workerd and local Durable Objects; local state persists in `.wrangler/state`. Put local configuration in gitignored `.dev.vars` (see `.dev.vars.example`).

Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` before committing. `src/routeTree.gen.ts` and `worker-configuration.d.ts` are generated. Preserve tabs, single quotes, and existing formatting in moved Quest files; format only new files.

Use Wrangler for this setup. Deployment and remote resource changes require explicit owner authorization. Merging into `main` deploys beta automatically (`.github/workflows/beta.yml`), so merging is a deployment too.

Local office redeploys call OpenAI for real by default (`QUEST_WORLD_COOLDOWN_MINUTES=1` in `.dev.vars` keeps them quick to repeat). For cost-free testing, add `QUEST_FAKE_GENERATOR=1` to `.dev.vars` and restart `pnpm dev`: redeploys then stream a fake office (responses carry `X-Quest-Generator: fake`). The flag only covers office generation; chat, completion and suggestions still call OpenAI, so leave those endpoints alone or rely on the mocked unit and Playwright tests. Never commit the flag; it is compiled out of production builds.
