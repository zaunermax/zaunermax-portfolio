This is a TanStack Start app on Cloudflare Workers. `pnpm dev` runs Vite with workerd and local Durable Objects; local state persists in `.wrangler/state`. Put local configuration in gitignored `.dev.vars` (see `.dev.vars.example`).

Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` before committing. `src/routeTree.gen.ts` and `worker-configuration.d.ts` are generated. Preserve tabs, single quotes, and existing formatting in moved Quest files; format only new files.

Use Wrangler for this setup. Deployment and remote resource changes require explicit owner authorization.
