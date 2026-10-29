# Max Zauner’s portfolio beta

Quest runs at `/`; maxOS runs at `/os`. This branch uses TanStack Start, React 19,
Vite 8 and Cloudflare Workers. The existing portfolio remains at
[zaunermax.at](https://zaunermax.at). Links to its wiki, talks and terminal stay on that origin.
The beta sends `robots: noindex`.

## Local development

Use Node 24 and the pinned pnpm 12.15.0.

```sh
pnpm install --frozen-lockfile
cp .dev.vars.example .dev.vars
# Fill OPENAI_API_KEY, OPENAI_MODEL and the SANITY_* fields.
pnpm dev
```

`pnpm dev` serves port 3000 using workerd and the same Durable Objects as production.
`.dev.vars` is ignored. During development all its keys are loaded; production requires
`OPENAI_API_KEY` and reads the other configuration from Wrangler vars or optional secrets.
Remove blank overrides to inherit values from `wrangler.jsonc`. Sanity reads only published
content through its API CDN with a pinned API version; there is no CMS cache or webhook here.

The local QuestForge object starts with the committed ReplySprout office. Its world, history,
lock and cooldown persist in `.wrangler/state` across restarts. The global object name is
`global`; changing its name, Worker name or class names changes storage identity.

Set `QUEST_FAKE_GENERATOR=1` in `.dev.vars` and restart the server to exercise world generation
without OpenAI. World responses then include `X-Quest-Generator: fake`, and POST streams a
three-second fake office. This flag and generator are eliminated from production builds.
The shared forge continues after a visitor disconnects, with a 150-second total deadline
and a three-minute persisted lease. Interrupted runs expire rather than retry paid calls.
Replay/follow is available while the DO’s current job lives; a restart keeps the final world
and lease but loses the running stream.

Opening either page in a browser can request AI suggestions. World POST, chat and completion
use the configured OpenAI account unless intercepted by tests (the fake flag only covers
world generation). Tests mock inference and suggestions; no test needs an OpenAI key.

Contact keeps the Resend REST integration. With no `RESEND_API_KEY` or `CONTACT_FROM_EMAIL`,
development logs the email and production returns the existing 503 with Max’s direct email.
Email stays unconfigured on beta. Chat/contact limits use SQLite fixed-window counters in a
separate QuestLimits object. Suggestions cache per mode in the Workers Cache API for 300 seconds;
a POST refresh bypasses the cached read and replaces the entry.

## Checks and tooling

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
pnpm exec wrangler deploy --dry-run
```

The browser smoke tests run Vite on port 3100, load the real pages and GLBs, and intercept all
inference/suggestion requests. To reuse an existing local server, set
`PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000`. `PLAYWRIGHT_TEST_PRODUCTION=1` uses `pnpm preview`
against an existing build. Unit tests exercise domain logic, handlers, stream protocols,
fencing, SQLite adapter transactions and the suggestion cache. `pnpm typecheck` regenerates
`worker-configuration.d.ts`; Vite regenerates the committed `src/routeTree.gen.ts`.

Offline voxel tools remain under `tools/quest-voxel`; Sharp and glTF tooling are development
only. Existing `/lab/quest/*` asset URLs are unchanged. Preserve the Quest source formatting;
format new files only.

## Deployment configuration

`wrangler.jsonc` prepares Worker `zaunermax-beta` with only the exact custom domain
`beta.zaunermax.at`. Deployment, authentication and remote resource changes require owner
authorization. No deployment or Cloudflare resource change is part of this migration.
The `deploy` script builds then invokes Wrangler; the generated configuration is under
`dist/server` and `.wrangler/deploy`. `pnpm preview` runs that build locally.

The integration follows the [Cloudflare TanStack Start guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/tanstack-start/)
and [Start’s server entry API](https://tanstack.com/start/latest/docs/framework/react/guide/server-entry-point).
The specification and dated research are in `.migration-research/PLAN.md`.
