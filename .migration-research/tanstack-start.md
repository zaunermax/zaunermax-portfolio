# TanStack Start migration research

Verified 2026-10-29. Scope: quest becomes `/`; maxOS stays at `/lab/2-os`; retain the five API URLs used by those UIs. This is a research artifact, not an implemented migration. Source files were not changed. Snippets below use proposed destinations under `src/features`, `src/server`, and `src/routes`.

## Decisions

- Use stable Start **1.169.4**, Router **1.170.46**, Vite **8.3.5**, and the Cloudflare Vite plugin. Do not follow older Vinxi, `app.config.ts`, separate API-router, or Nitro deployment tutorials for this target.
- Keep normal SSR for both routes. Fetch private/server data through `createServerFn`; preserve quest's arrival screen with a deferred loader promise and `<Await>`/Suspense. Keep only the Three canvas behind a client-only lazy boundary.
- Keep raw HTTP API endpoints and their existing streaming formats. Move request-processing functions into `.server.ts` modules with thin `server.handlers` route adapters.
- Replace Next caching with an explicit server data-cache adapter. Router's cache does not replace a shared server cache or tag invalidation.
- Self-host the four fonts with Fontsource and preserve the existing CSS variable names.
- Forward the Worker execution context into Start's typed request context. `ctx.waitUntil` is appropriate for short background work; it cannot guarantee completion of the existing 90-second forge after a disconnect. Coordinate the durable generation design with the Cloudflare delegate.

## 1. Package versions and recent breaks

These are live npm registry results, not search-index versions. `@tanstack/react-start` currently depends on the exact Router version shown; the packages do **not** share one common version number.

| Package | npm `latest` on 2026-10-29 | Relevant requirement / decision |
| --- | --- | --- |
| `@tanstack/react-start` | **1.169.4** | Vite peer `>=8.0.0`; Node `>=22.12.0`; React and React DOM `>=18.0.0 || >=19.0.0` |
| `@tanstack/react-router` | **1.170.46** | Start 1.169.4's exact dependency; React 19.3.1 satisfies its peer range |
| `@tanstack/router-plugin` | **1.168.48** | Included through Start's plugin dependencies; don't add a second standalone Router Vite plugin |
| Start Vite plugin | **part of 1.169.4** | Import `tanstackStart` from `@tanstack/react-start/plugin/vite`; no separate package needed |
| `vite` | **8.3.5** | Start requires Vite 8; current Node engine is `^20.19.0 || >=22.12.0` |
| `@vitejs/plugin-react` | **6.1.2** | Vite peer `^8.0.0`; Babel configuration changed in v6 |
| `@cloudflare/vite-plugin` | **1.66.0** | Vite 6/7/8 peer range; Wrangler peer `^4.154.0` |
| `@tailwindcss/vite` | **4.3.3** | Matches this repo's Tailwind 4.3.3; supports Vite 8 |
| `babel-plugin-react-compiler` | **1.0.0** | Already installed in this repo |
| `@rolldown/plugin-babel` | **0.3.0** | Published today; **use 0.2.4** with plugin-react 6.1.2, whose declared optional peer range only includes `^0.1.7 || ^0.2.0` |

Registry sources: [Start](https://registry.npmjs.org/@tanstack/react-start/latest), [Router](https://registry.npmjs.org/@tanstack/react-router/latest), [Router plugin](https://registry.npmjs.org/@tanstack/router-plugin/latest), [Start plugin core](https://registry.npmjs.org/@tanstack/start-plugin-core/1.171.55), [Vite](https://registry.npmjs.org/vite/latest), [React plugin](https://registry.npmjs.org/@vitejs/plugin-react/latest), [Cloudflare plugin](https://registry.npmjs.org/@cloudflare/vite-plugin/latest), [Tailwind plugin](https://registry.npmjs.org/@tailwindcss/vite/latest), [React Compiler](https://registry.npmjs.org/babel-plugin-react-compiler/latest), [Babel plugin 0.2.4](https://registry.npmjs.org/@rolldown/plugin-babel/0.2.4).

Start **1.169 is the first stable release**, not an RC. The current migration guide removes `.inputValidator()` in favor of `.validator()`, removes the old built-in session helper, and replaces the old Nitro v2 plugin. A raw `createStartHandler` now rethrows failures; the default server entry uses `createServerEntry` to convert escaped errors. Response helper state can override a returned response, so prefer explicit `Response` status/headers in the API handlers. None of the session/Nitro features are needed here. [Official stable migration guide](https://tanstack.com/start/latest/docs/framework/react/migrate-from-release-candidate).

React Server Components are now available experimentally, but they are unnecessary for these two pages. Ordinary loaders, server functions, and SSR are enough; do not add RSC/Flight or a second experimental migration. [Start overview](https://tanstack.com/start/latest/docs/framework/react/overview).

## 2. What the current repo actually needs

Inspected the lab route/layout files, shared content and ask hooks, UI/scene imports, world store/forge, all five requested API handlers, revalidation and caching helpers, Next/Vitest/Playwright/ESLint config, and the Next-specific import/env usage across the lab subtree.

| Existing code | Migration implication |
| --- | --- |
| `src/app/(lab)/lab/1-quest/page.tsx` | Fetches `getLabContent()` and `getWorldState()` concurrently under `<Suspense fallback={<Arriving />}>`; preserve that visible loading shell |
| `src/app/(lab)/lab/2-os/page.tsx` | Fetches Sanity content and passes it, business copy, and font classes to `MaxOS` |
| `src/app/(lab)/layout.tsx` | Owns document, viewport, noindex, global CSS, and spike switcher |
| `_shared/content.ts` | Mixes server-only Sanity fetching, shared types, and public `business` data; split these before importing from browser routes |
| `quest-app.tsx` | Uses `next/dynamic({ ssr: false })` only for `world-canvas`; the rest can remain SSR |
| `small-apps.tsx` | Uses `next/image` with an imported portrait; Vite image imports produce a URL string, not Next's image metadata object |
| `_shared/spike-switcher.tsx`, `2-os/menu-bar.tsx` | Replace Next links/pathname; update quest destination to `/`; remove or replace the unported `/lab` index link |
| `_shared/use-ask.ts` | `useCompletion({ streamProtocol: 'text' })` uses `/api/completion`; keep that URL and plain-text protocol |
| Quest chat/contact/world hooks | Use `/api/lab/quest/{chat,contact,world}`; keep URLs, status codes, stream formats, and error bodies |
| `world/store.ts` | `connection()` prevents static capture; the default store uses local filesystem persistence, which needs a Cloudflare storage adapter |
| `world/forge.ts` | Stores the current job in process memory; follow/replay and coordination across isolates require the Cloudflare delegate's design |
| `server/rate-limit.ts` | In-memory limits are not a shared global limit across Worker isolates |
| `sanity-client.ts` | Imports `next-sanity`, `'use cache'`, `cacheLife('minutes')`, and `cacheTag`; replace with `@sanity/client` plus a server cache adapter |
| `generate-suggestions.ts` | Cached generation: stale/revalidate 300 seconds, expiry 3600 seconds, tag `llm-content`; explicit refresh currently bypasses the cached read |
| `api/revalidate/route.ts` | Next cache invalidation and `next-sanity/webhook`; keeping webhook invalidation requires porting this extra endpoint too |
| `openai-client.ts`, `server-url.ts` | Read env at module scope; change to server-side factories/per-request configuration |

The old marketing, wiki/talk pages, query page, Sanity Studio, sitemap generation, and site chrome are outside this port. Shared Portable Text components that the two lab UIs import still belong in the dependency closure. Check their Next link/image imports too. The old `/impressum -> /wiki/IMPRESSUM.md` redirect targets an unported route and needs an intentional new destination or removal.

## 3. Project shape and configuration

Recommended layout:

```text
public/                          # preserve asset paths, GLBs, manifest, icons
src/
  router.tsx                     # export getRouter(), fresh router per SSR request
  routeTree.gen.ts               # generated by Start/Router tooling
  worker.ts                      # custom Cloudflare entry: pass env/ctx to Start
  start.ts                       # OPTIONAL; middleware/framework policy only
  routes/
    __root.tsx
    index.tsx                    # quest at /
    lab/2-os.tsx                 # maxOS at /lab/2-os
    api/completion.ts
    api/suggestions.ts
    api/lab/quest/chat.ts
    api/lab/quest/contact.ts
    api/lab/quest/world.ts
    api/revalidate.ts            # if retaining CMS webhook invalidation
  features/
    shared/business.ts           # public constants, no server imports
    shared/content-types.ts
    quest/...                    # existing UI, world contract, scene, hooks
    maxos/...
  server/
    portfolio.functions.ts       # public RPC definitions; not .server.ts
    lab-content.server.ts
    sanity.server.ts
    world-store.server.ts
    handlers/quest-world.server.ts
    handlers/quest-chat.server.ts
    handlers/quest-contact.server.ts
    handlers/completion.server.ts
    handlers/suggestions.server.ts
  styles/globals.css
  styles/fonts.css
  types/start-context.d.ts
vite.config.ts
tsconfig.json
wrangler.jsonc
vitest.config.mts
```

Do not put arbitrary copied feature/helper/test files inside `src/routes`: the generator treats route-directory files as route candidates unless excluded. Start supplies routing generation and code splitting. A separate `src/client.tsx` or `src/server.ts` is not required with the default entries. `src/start.ts` is also optional. `src/server.ts` is the default custom Start entry location if one is needed; in this proposal `src/worker.ts` is the outer Worker adapter and the built-in Start entry remains intact. [Scaffolding](https://tanstack.com/start/latest/docs/framework/react/build-from-scratch), [server entries](https://tanstack.com/start/latest/docs/framework/react/guide/server-entry-point), [file routing](https://tanstack.com/router/latest/docs/guide/file-based-routing).

### Vite, Cloudflare, Tailwind, Compiler, aliases

```ts
// vite.config.ts — current Vite 8 / plugin-react 6 API
import { defineConfig } from 'vite'
import { cloudflare } from '@cloudflare/vite-plugin'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  server: { host: '0.0.0.0', port: 3000 },
  resolve: { tsconfigPaths: true },
  plugins: [
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    tanstackStart(),
    react(),
    babel({ presets: [reactCompilerPreset({ target: '19' })] }),
    tailwindcss(),
  ],
})
```

Start must precede the React plugin. Cloudflare's current guide uses the `ssr` Vite environment. Vite 8 can resolve TypeScript paths natively, so this setup does not need `vite-tsconfig-paths`. Existing remote-preview host allowances need a separate Vite `server.allowedHosts` configuration; `next.config.ts` no longer supplies them. [Cloudflare framework setup](https://developers.cloudflare.com/workers/framework-guides/web-apps/tanstack-start/#configure-an-existing-application), [Start setup](https://tanstack.com/start/latest/docs/framework/react/build-from-scratch), [Vite path resolution](https://vite.dev/config/shared-options#resolve-tsconfigpaths), [Vite server options](https://vite.dev/config/server-options#server-allowedhosts).

The older `react({ babel: { plugins: ['babel-plugin-react-compiler'] } })` example is for plugin-react <=5. With v6, install `@rolldown/plugin-babel@0.2.4`, `@babel/core`, and `babel-plugin-react-compiler@1.0.0`, and use the preset shown above. It invokes the Babel compiler and supplies its client-environment filter/runtime optimization. Plugin-react 6.1 also has experimental native compiler support; do not switch to that when preserving the existing Babel Compiler behavior. [React Compiler installation](https://react.dev/learn/react-compiler/installation), [React plugin changelog](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react/CHANGELOG.md), [published React plugin source](https://unpkg.com/@vitejs/plugin-react@6.1.2/dist/index.js).

Use `@tailwindcss/vite` instead of retaining the Tailwind PostCSS integration as well. Keep `@import 'tailwindcss'`, `tw-animate-css`, theme tokens, and existing CSS Modules. Don't run Tailwind through two pipelines. [Start Tailwind guide](https://tanstack.com/start/latest/docs/framework/react/guide/tailwind-integration).

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "types": ["vite/client", "node"],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src/**/*.ts", "src/**/*.tsx", "src/**/*.d.ts", "vite.config.ts", "worker-configuration.d.ts"],
  "exclude": ["node_modules", "dist"]
}
```

Remove Next's TS plugin, `next-env.d.ts`, and `.next/types` include entries. Keep the current TypeScript 6 version initially. Do not introduce `baseUrl` merely for paths. Start specifically advises leaving `verbatimModuleSyntax` disabled because of server-code elimination concerns. Generated Worker type filenames should follow the Cloudflare delegate's chosen `wrangler types` command. [Start TS setup](https://tanstack.com/start/latest/docs/framework/react/build-from-scratch).

Set package `"type": "module"`; scripts become `vite dev`, `vite build`, and `vite preview`, with deployment via Wrangler. There is no `next typegen`; generate the route tree through the Vite/Start build or dev tool before clean-checkout `tsc --noEmit`. Committing `routeTree.gen.ts` and excluding it from formatting/linting is a reasonable workflow. Confirm the clean CI sequence rather than assuming `tsc` itself generates routes. [Start scaffolding](https://tanstack.com/start/latest/docs/framework/react/build-from-scratch), [Cloudflare scripts](https://developers.cloudflare.com/workers/framework-guides/web-apps/tanstack-start/#configure-an-existing-application).

```tsx
// src/router.tsx
import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

export function getRouter() {
  return createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: false, // deliberate: don't prefetch live quest state on hover
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
```

Construct the router inside `getRouter`; do not share one server router between requests. Disabling preload here is a project decision, not a Start requirement. [Router SSR](https://tanstack.com/router/latest/docs/guide/ssr), [preloading](https://tanstack.com/router/latest/docs/guide/preloading).

## 4. Data boundaries, SSR, loading shell, and dynamic data

Route loaders are **isomorphic**: they run on the server for an initial SSR request and in the browser for navigation/reloading. A `.server.ts` helper imported directly into a loader does not make that loader server-only. `createServerFn` creates the RPC boundary; `createServerOnlyFn` only prevents client execution and does not create a callable browser endpoint. [Execution model](https://tanstack.com/start/latest/docs/framework/react/guide/execution-model), [environment functions](https://tanstack.com/start/latest/docs/framework/react/guide/environment-functions).

Use plain types and public business constants in shared files. Put Sanity SDK access, tokens, OpenAI factories, persistence, and cache implementations in `.server.ts` modules. Mark otherwise-named private modules with `import '@tanstack/react-start/server-only'`. The generic npm `server-only` package is not the replacement: its installed default entry throws unless the `react-server` export condition is active. Start's normal SSR is not an RSC environment. [Import protection](https://tanstack.com/start/latest/docs/framework/react/guide/import-protection), [published `server-only` export conditions](https://unpkg.com/server-only@0.0.1/package.json), [throwing default entry](https://unpkg.com/server-only@0.0.1/index.js).

Start's default import protection denies `.server.*` in client builds and `.client.*` in server builds, with warnings/mocks in dev and errors in production. A directory merely named `server-only` or `server` is not protected by filename convention. Keep type imports explicitly type-only, avoid mixed public/private barrels, and inspect a production build for leaks. [Import protection](https://tanstack.com/start/latest/docs/framework/react/guide/import-protection).

For an explicitly guarded server utility, the current API is:

```ts
// src/server/sanity.server.ts
import '@tanstack/react-start/server-only'
import { createServerOnlyFn } from '@tanstack/react-start'
import { createClient } from '@sanity/client'
import { env } from 'cloudflare:workers'

export const getSanityClient = createServerOnlyFn(() => createClient({
  projectId: env.SANITY_PROJECT_ID,
  dataset: env.SANITY_DATASET,
  apiVersion: env.SANITY_API_VERSION || '2023-07-28',
  perspective: 'published',
  useCdn: false,
}))
```

Call this from the content service's request path. The wrapper's client implementation throws; it is not an RPC stub. `.server.ts` plus the Start marker is already sufficient protection for this module, so the function wrapper is optional rather than a requirement to wrap every helper. The Sanity method comes from `@sanity/client`, replacing the current `next-sanity` re-export. [Environment functions](https://tanstack.com/start/latest/docs/framework/react/guide/environment-functions), [Sanity JavaScript client](https://github.com/sanity-io/client).

```ts
// src/server/portfolio.functions.ts — isomorphic RPC exports, not .server.ts
import { createServerFn } from '@tanstack/react-start'

export const loadQuest = createServerFn({ method: 'GET' }).handler(async () => {
  const { setResponseHeader } = await import('@tanstack/react-start/server')
  setResponseHeader('Cache-Control', 'no-store')
  const [{ getLabContent }, { getWorldState }] = await Promise.all([
    import('./lab-content.server'),
    import('./world-store.server'),
  ])
  const [content, initial] = await Promise.all([getLabContent(), getWorldState()])
  return { content, initial }
})

export const loadMaxOS = createServerFn({ method: 'GET' }).handler(async () => {
  const { getLabContent } = await import('./lab-content.server')
  return getLabContent()
})
```

The dynamic imports here are **inside** the compiled handler boundary; they import implementation modules, not server-function modules. Import `loadQuest`/`loadMaxOS` statically from routes so Start can create RPC stubs. Return only intentionally public data; do not return bindings, execution contexts, SDK clients, prompts, or secrets. [Server functions](https://tanstack.com/start/latest/docs/framework/react/guide/server-functions), [code execution patterns](https://tanstack.com/start/latest/docs/framework/react/guide/code-execution-patterns).

### Quest route with streamed arrival shell

```tsx
// src/routes/index.tsx
import { Suspense } from 'react'
import { Await, createFileRoute } from '@tanstack/react-router'
import { loadQuest } from '@/server/portfolio.functions'
import { business } from '@/features/shared/business'
import { QuestApp } from '@/features/quest/ui/quest-app'
import { LoadingVeil, ZoneText } from '@/features/quest/ui/hud'
import styles from '@/features/quest/ui/hud.module.css'

export const Route = createFileRoute('/')({
  ssr: true,
  staleTime: 0,
  gcTime: 0,
  headers: () => ({ 'Cache-Control': 'no-store' }),
  // Return an object containing the promise; don't await the whole payload here.
  loader: () => ({ quest: loadQuest() }),
  head: () => ({
    meta: [
      { title: 'Max Zauner – Quest' },
      {
        name: 'description',
        content: 'Hello, I’m Max. Wander a tiny voxel office that an AI redeploys every hour, chat with me, or file a ticket for your project.',
      },
    ],
  }),
  pendingComponent: Arriving,
  component: QuestPage,
})

function QuestPage() {
  const { quest } = Route.useLoaderData()
  return (
    <Suspense fallback={<Arriving />}>
      <Await promise={quest}>
        {({ content, initial }) => (
          <QuestApp initial={initial} content={content} business={business} fontVars="" />
        )}
      </Await>
    </Suspense>
  )
}

function Arriving() {
  return (
    <div className={styles.root}>
      <LoadingVeil ready={false} name="the office" />
      <ZoneText state="big" worldName="the office" tagline="" />
    </div>
  )
}
```

Here the loader finishes synchronously with a nested unresolved promise, allowing the SSR document and fallback to stream first. Start's built-in entry already uses `defaultStreamHandler`. Router handles promise serialization; manual `defer()` is no longer necessary. React 19 `use(promise)` is another option, but `<Await>` is straightforward here. This preserves the visual shell, **not** Next's build-time partial prerendering/cache-components behavior. [Deferred loading](https://tanstack.com/router/latest/docs/guide/deferred-data-loading), [`defer` notice](https://tanstack.com/router/latest/docs/api/router/deferFunction), [Start server entry](https://tanstack.com/start/latest/docs/framework/react/guide/server-entry-point).

`pendingComponent` alone is not the equivalent of the original streamed `<Suspense>` boundary with a blocking awaited loader. It handles navigation loading and selective-SSR fallback. Use the nested promise for this specific initial HTML behavior. Loader errors that occur after streaming starts can render an error boundary but cannot retroactively change already-sent HTTP headers/status; keep the title/robots independent of the deferred payload. [Deferred loading](https://tanstack.com/router/latest/docs/guide/deferred-data-loading), [Start error behavior](https://tanstack.com/start/latest/docs/framework/react/guide/server-entry-point#error-handling).

```tsx
// src/routes/lab/2-os.tsx — no extra deferred layer needed
import { createFileRoute } from '@tanstack/react-router'
import { loadMaxOS } from '@/server/portfolio.functions'
import { business } from '@/features/shared/business'
import { MaxOS } from '@/features/maxos/maxos'

export const Route = createFileRoute('/lab/2-os')({
  loader: () => loadMaxOS(),
  head: () => ({ meta: [{ title: 'maxOS – Max Zauner' }] }),
  component: MaxOSPage,
})

function MaxOSPage() {
  return <MaxOS content={Route.useLoaderData()} business={business} fontClass="" />
}
```

### Dynamic rendering and selective SSR

There is no `connection()`/`dynamic = 'force-dynamic'` requirement. With SSR enabled and prerendering/SPA mode left off, an incoming document request executes the loader. Use `Cache-Control: no-store` for the live HTML/data/API responses and avoid shared caching of world state. `staleTime: 0` means immediately stale Router data, not “no caching anywhere”; `gcTime: 0` removes inactive entries and disabling preloads avoids a separate default preload freshness window. Active data and in-flight work can still be reused. If strict blocking reloads are needed on revisits, current Router supports `loader: { handler, staleReloadMode: 'blocking' }`. Do not mistake this policy for persistent server caching. [Data-loading cache semantics](https://tanstack.com/router/latest/docs/guide/data-loading), [Start ISR/HTTP headers](https://tanstack.com/start/latest/docs/framework/react/guide/isr).

| Route `ssr` | Initial server loader / beforeLoad | Initial route component |
| --- | --- | --- |
| `true` (default) | Run | Render to HTML |
| `'data-only'` | Run and serialize results | Render pending fallback; component runs after hydration |
| `false` | Skip | Render pending fallback; loader and component run in browser |

SSR restrictions inherit downward; a child cannot restore SSR that its parent disabled. None of these settings prevents module evaluation of a statically imported browser-only dependency. Keep the canvas lazy even if experimenting with selective SSR. [Selective SSR](https://tanstack.com/start/latest/docs/framework/react/guide/selective-ssr), [execution model](https://tanstack.com/start/latest/docs/framework/react/guide/execution-model).

## 5. API routes, streams, headers, and unit tests

Use `createFileRoute(... )({ server: { handlers: { GET, POST } } })`. Methods receive a handler **object argument** containing `request`, `params`, and `context`; they do not receive a bare `Request`. The return value can be a standard `Response` or a promise of one. This differs from Next's exported `POST(request)` discovery. [Server routes](https://tanstack.com/start/latest/docs/framework/react/guide/server-routes).

Keep the existing request-processing logic as ordinary exported functions, e.g. `handleQuestChat(request)`, `handleCompletion(request)`, and `handleWorldPost(request, lifetime)`. They remain easy to unit-test and don't require a route tree or Start transform merely to test moderation/validation/stream behavior.

```ts
// src/routes/api/lab/quest/world.ts
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/lab/quest/world')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { handleWorldGet } = await import('@/server/handlers/quest-world.server')
        return handleWorldGet(request)
      },
      POST: async ({ request, context }) => {
        const { handleWorldPost } = await import('@/server/handlers/quest-world.server')
        return handleWorldPost(request, {
          waitUntil: (work) => context.cloudflare.ctx.waitUntil(work),
        })
      },
    },
  },
})
```

```ts
// src/server/handlers/quest-world.server.ts — shape of the port
import '@tanstack/react-start/server-only'
// Import the existing forge/store/rate-limit implementations after their server port.

export type RequestLifetime = { waitUntil(work: Promise<unknown>): void }

// The GET/POST bodies remain the current validated bodies. Only the adapter changes:
// export async function handleWorldGet(request: Request): Promise<Response> { ... }
// export async function handleWorldPost(request: Request, lifetime: RequestLifetime) { ... }
// In the existing successful startForge() branch, replace after(started.job.done) with:
// lifetime.waitUntil(started.job.done)
// return new Response(streamJob(started.job), { headers: NDJSON_HEADERS })
```

That fragment describes a local function port, not a new Start-provided world/forge API. Keep all prechecks, cooldown status/retry headers, input isolation, cross-site check, follow replay, stream cancellation behavior, and error mapping from the current file. The raw output remains NDJSON with `application/x-ndjson; charset=utf-8` and `Cache-Control: no-store, no-transform`. Don't return the stream object as a serialized server-function value. [Start raw responses](https://tanstack.com/start/latest/docs/framework/react/guide/server-routes), [Workers streams](https://developers.cloudflare.com/workers/runtime-apis/streams/).

The other endpoint adapters follow the same pattern:

```ts
// src/routes/api/completion.ts
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/completion')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleCompletion } = await import('@/server/handlers/completion.server')
        return handleCompletion(request)
      },
    },
  },
})
```

| Destination file | Handler wiring |
| --- | --- |
| `routes/api/lab/quest/chat.ts` | `POST: ({ request }) => handleQuestChat(request)` |
| `routes/api/lab/quest/contact.ts` | `POST: ({ request }) => handleQuestContact(request)` |
| `routes/api/suggestions.ts` | `GET` calls suggestions with refresh false; `POST` with refresh true |

For suggestions, `Response.json({ suggestions }, { headers: { 'Cache-Control': 'no-store' } })` replaces `NextResponse.json`. Retain internal generation caching separately from this endpoint's no-store HTTP policy.

Keep **AI SDK 7's existing response factories unchanged**: quest chat returns `createUIMessageStreamResponse(...)`, completion returns `createTextStreamResponse(...)`. These already produce Web Responses; return them directly from the server route adapter. Do not substitute obsolete AI SDK `StreamingTextResponse`/`toDataStreamResponse` examples or convert UI-message SSE to NDJSON. `useCompletion({ streamProtocol: 'text' })` stays compatible with `/api/completion`; `useChat` retains the existing quest chat transport. [Start Response contract](https://tanstack.com/start/latest/docs/framework/react/guide/server-routes), [AI SDK UI message response](https://ai-sdk.dev/docs/reference/ai-sdk-ui/create-ui-message-stream-response), [AI SDK completion hook](https://ai-sdk.dev/docs/reference/ai-sdk-ui/use-completion).

### Headers and request access

Prefer the explicit `Request` and `Response` in raw endpoint implementations:

```ts
const contentType = request.headers.get('content-type')
const follow = new URL(request.url).searchParams.has('follow')
return new Response(byteStream, {
  headers: {
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    'Cache-Control': 'no-store, no-transform',
    'X-Accel-Buffering': 'no',
  },
})
```

For code inside a Start server function/middleware that lacks an explicit request parameter, the current utilities come from `@tanstack/react-start/server`:

```ts
import { createServerFn } from '@tanstack/react-start'

export const readRequestInfo = createServerFn({ method: 'GET' }).handler(async () => {
  const { getRequest, getRequestHeader, setResponseHeader } =
    await import('@tanstack/react-start/server')
  setResponseHeader('Cache-Control', 'no-store')
  return { userAgent: getRequestHeader('user-agent'), path: new URL(getRequest().url).pathname }
})
```

These helpers depend on an active Start request context. Calling a plain endpoint implementation directly in Vitest does not create that context; injecting `Request`/lifetime dependencies avoids unnecessary mocks. Do not set incompatible global response headers before returning AI SDK streams. [Server-function request utilities](https://tanstack.com/start/latest/docs/framework/react/guide/server-functions#server-context--request-handling), [stable helper precedence](https://tanstack.com/start/latest/docs/framework/react/migrate-from-release-candidate).

### Vitest and Playwright

Yes, **ordinary extracted handler functions can be called directly**. Move existing `route.test.ts` imports from `POST`/`GET` in the Next route to the extracted handler modules, preserving the current tests of malformed input, moderation, stream content/errors, cooldowns, and contact delivery. This is a proposed testing design, not an official Start HTTP-testing API. The adapter argument follows the documented server-route contract. [Server-route handler contract](https://tanstack.com/start/latest/docs/framework/react/guide/server-routes).

```ts
import { expect, it, vi } from 'vitest'
import { handleWorldPost } from '@/server/handlers/quest-world.server'

it('registers generation lifetime and returns NDJSON', async () => {
  // Reuse the existing fake generator/store setup so this never calls a paid API.
  const waitUntil = vi.fn()
  const response = await handleWorldPost(
    new Request('https://portfolio.test/api/lab/quest/world', {
      method: 'POST', headers: { 'sec-fetch-site': 'same-origin' },
    }),
    { waitUntil },
  )
  expect(response.headers.get('Content-Type')).toContain('application/x-ndjson')
  expect(waitUntil).toHaveBeenCalledWith(expect.any(Promise))
  const rows = (await response.text()).trim().split('\n').map((row) => JSON.parse(row))
  expect(rows.length).toBeGreaterThan(0)
})
```

Keep the existing separate Node Vitest config and `@` alias. The Start marker package's published JS is empty, so it does not need Next's `server-only` mock. Cloudflare imports/bindings need injection, mocking, or real Worker tests; a Node unit test cannot certify `cloudflare:workers`, Worker storage, stream disconnect behavior, or routing. Preserve a few HTTP/e2e checks against the built Worker for that. [Start marker implementation](https://unpkg.com/@tanstack/react-start@1.169.4/dist/esm/server-only.js), [Workers testing](https://developers.cloudflare.com/workers/testing/).

Playwright's current server command and readiness URL are Next-specific. Replace them with `pnpm exec vite --host 127.0.0.1 --port 3100` for development and `pnpm exec vite preview --host 127.0.0.1 --port 3100` for a prebuilt Worker integration; readiness should be `/`, not the removed `/query`. Update quest e2e navigation to `/`, keep maxOS at `/lab/2-os`, and preserve query-string scene preview cases. Verify the Cloudflare plugin's production preview path with the Cloudflare delegate. [Cloudflare build/preview commands](https://developers.cloudflare.com/workers/framework-guides/web-apps/tanstack-start/#deploy).

## 6. Root document, head, viewport, fonts, and CSS

Use root `head()` for shared metadata and route `head()` for per-page title/description. The title uses `{ title: '...' }` inside `meta`; viewport and robots are ordinary named meta tags. The deepest title and same-name meta replace parent values. Render `<HeadContent />` in `<head>` and `<Scripts />` near the end of `<body>`. [Document-head management](https://tanstack.com/router/latest/docs/guide/document-head-management).

```tsx
// src/routes/__root.tsx
import type { ReactNode } from 'react'
import { createRootRoute, HeadContent, Link, Outlet, Scripts } from '@tanstack/react-router'
import '@/styles/globals.css'
import '@/styles/fonts.css'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { title: 'Max Zauner' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { name: 'robots', content: 'noindex' },
    ],
    links: [
      { rel: 'icon', href: '/favicon.ico' },
      { rel: 'apple-touch-icon', href: '/apple-icon.png' },
    ],
  }),
  shellComponent: Document,
  component: Outlet,
  notFoundComponent: () => <main>Page not found. <Link to="/">Visit the office</Link></main>,
})

function Document({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head><HeadContent /></head>
      <body className="min-h-screen antialiased">
        {children}
        {/* Add the retained two-destination switcher here if still wanted. */}
        <Scripts />
      </body>
    </html>
  )
}
```

The `noindex` above preserves the lab's existing behavior. Whether the new production homepage should become indexable is a product decision; don't silently drop it during the framework port. Move Next's special icon files into `public/` if using these explicit URLs. There is no automatic Next metadata-file convention here. The root shell remains server-rendered even when a descendant uses selective SSR. [Head management](https://tanstack.com/router/latest/docs/guide/document-head-management), [root shell](https://tanstack.com/start/latest/docs/framework/react/guide/selective-ssr#how-to-disable-ssr-of-the-root-route).

### Verified Fontsource availability

All four required families exist. Atkinson Hyperlegible **Next** is available in both static and variable packages; it is not necessary to substitute the older Atkinson Hyperlegible family. All four selected packages currently have version **5.3.0**. The variable CSS family names include the suffix `Variable`. I checked the actual npm tarball CSS, including the separate italic file.

```css
/* src/styles/fonts.css */
@import '@fontsource/jersey-15/latin-400.css';
@import '@fontsource/jersey-15/latin-ext-400.css';
@import '@fontsource-variable/atkinson-hyperlegible-next/wght.css';
@import '@fontsource-variable/atkinson-hyperlegible-next/wght-italic.css';
@import '@fontsource-variable/schibsted-grotesk/wght.css';
@import '@fontsource/ibm-plex-mono/latin-400.css';
@import '@fontsource/ibm-plex-mono/latin-600.css';

:root {
  --q-pixel: 'Jersey 15', monospace;
  --q-read: 'Atkinson Hyperlegible Next Variable', system-ui, sans-serif;
  --os-font-ui: 'Schibsted Grotesk Variable', system-ui, sans-serif;
  --os-font-mono: 'IBM Plex Mono', monospace;
}
```

Sources: [Jersey 15](https://fontsource.org/fonts/jersey-15), [Atkinson Next](https://fontsource.org/fonts/atkinson-hyperlegible-next), [Jersey package](https://registry.npmjs.org/@fontsource/jersey-15/latest), [Atkinson variable package](https://registry.npmjs.org/@fontsource-variable/atkinson-hyperlegible-next/latest), [Schibsted package](https://registry.npmjs.org/@fontsource-variable/schibsted-grotesk/latest), [IBM package](https://registry.npmjs.org/@fontsource/ibm-plex-mono/latest), [Atkinson CSS](https://unpkg.com/@fontsource-variable/atkinson-hyperlegible-next@5.3.0/wght.css), [Atkinson italic CSS](https://unpkg.com/@fontsource-variable/atkinson-hyperlegible-next@5.3.0/wght-italic.css), [Schibsted CSS](https://unpkg.com/@fontsource-variable/schibsted-grotesk@5.3.0/wght.css).

Fontsource's files use `font-display: swap` and self-hosted WOFF2 assets. Global variables simplify the current `fontVars`/`fontClass` props and also cover portaled windows; passing an empty string preserves existing component signatures until cleanup. Alternatively retain `.questFonts`/`.osFonts` wrapper classes and make sure portal roots receive them. No Next-generated metrics fallback or Google network request is needed. A Google Fonts stylesheet returned in `head().links` is valid, but self-hosting preserves the current deployment/control model. [Fontsource installation](https://fontsource.org/docs/getting-started/install), [CSS asset loading](https://tanstack.com/start/latest/docs/framework/react/guide/css-styling).

CSS Modules work unchanged as `import styles from './hud.module.css'`; Start's route manifest links matched-route CSS during SSR. Global side-effect CSS imports work, too. Keep arrival-shell and HUD styles statically reachable from the route so the first streamed shell is styled. CSS imported only by a lazy canvas component arrives with that chunk. `globals.css?url` plus an explicit `head().links` stylesheet is an alternative, not something to add alongside a second import of the same stylesheet. [Start CSS styling](https://tanstack.com/start/latest/docs/framework/react/guide/css-styling), [Vite CSS Modules](https://vite.dev/guide/features#css-modules).

## 7. Link, pathname, client-only canvas, images, redirects, 404

```tsx
import { Link, useLocation } from '@tanstack/react-router'

const spikes = [
  { href: '/', name: 'Quest' },
  { href: '/lab/2-os', name: 'maxOS' },
] as const

function SpikeLinks() {
  const pathname = useLocation({ select: (location) => location.pathname })
  const active = spikes.find((spike) => spike.href === pathname)
  return (
    <nav aria-label={`Current view: ${active?.name ?? 'unknown'}`}>
      {spikes.map((spike) => <Link key={spike.href} to={spike.href}>{spike.name}</Link>)}
    </nav>
  )
}
```

Use `to` instead of `href` for Router links. Base UI's existing `render={<Link ... />}` composition can use the Router anchor. Preserve normal anchors for external/mailto/download URLs. In the switcher, do **not** use `pathname.startsWith('/')` to identify quest: that would match every route after changing its path to `/`. [Navigation](https://tanstack.com/router/latest/docs/guide/navigation), [`useLocation`](https://tanstack.com/router/latest/docs/api/router/useLocationHook), [custom links](https://tanstack.com/router/latest/docs/guide/custom-link).

```tsx
// Replace the next/dynamic declaration and canvas rendering in quest-app.tsx.
import { lazy, Suspense } from 'react'
import { ClientOnly } from '@tanstack/react-router'

const WorldCanvas = lazy(() => import('../scene/world-canvas'))

// At the existing WorldCanvas render location; retain all current canvas props:
// <ClientOnly fallback={null}>
//   <Suspense fallback={null}>
//     <WorldCanvas world={compiled} bus={bus} ... />
//   </Suspense>
// </ClientOnly>
```

`ClientOnly` delays rendering until hydration; `lazy` keeps the canvas dependency module from being executed by the SSR render. Both matter: wrapping an eagerly imported browser-dependent module does not stop its top-level code from running. Keep the route/HUD as SSR components; do not disable SSR globally just to protect WebGL. `'use client'` does not supply a Next-like boundary in normal Start. [Execution model and ClientOnly](https://tanstack.com/start/latest/docs/framework/react/guide/execution-model), [React lazy](https://react.dev/reference/react/lazy).

```tsx
import portraitUrl from '@/components/ui/own-avatar/assets/pp.jpg'

// Keep the existing CSS size/object-fit, alt text and appropriate explicit dimensions.
// Vite imports the asset as a string URL; don't read portraitUrl.src.
<img src={portraitUrl} alt="Max Zauner" width={160} height={160} decoding="async" />
```

Start does not supply a drop-in `next/image` optimization service. Plain `<img>` is sufficient for the lab portrait; explicit dimensions prevent layout shifts. Preserve `public/` URL references, including `/...glb` files and their manifest. Vite copies `public` assets as-is; don't prefix URLs with `/public`. If importing a GLB into JS instead, use `?url` or configure `assetsInclude`, but there is no need to rewrite current fetch paths. [Vite static assets](https://vite.dev/guide/assets).

For a route-level legacy alias:

```tsx
// src/routes/lab/1-quest.tsx — optional retained legacy entry
import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/lab/1-quest')({
  beforeLoad: () => { throw redirect({ to: '/', statusCode: 307 }) },
})
```

Server-entry redirects are useful for the broad `/main/:path*` rule before routing. Preserve query strings deliberately:

```ts
const url = new URL(request.url)
if (url.pathname === '/main' || url.pathname.startsWith('/main/')) {
  url.pathname = url.pathname.slice('/main'.length) || '/'
  return Response.redirect(url.toString(), 307)
}
```

Place that fragment before `handler.fetch` in the Worker entry below. Do not implement client-only `useEffect` redirects. New `/impressum` behavior needs an actual retained legal-content destination; the old wiki URL will otherwise 404. [Router redirect](https://tanstack.com/router/latest/docs/api/router/redirectFunction), [server entry](https://tanstack.com/start/latest/docs/framework/react/guide/server-entry-point).

Use root `notFoundComponent` for unmatched paths, `throw notFound()` from loaders for missing resources, and explicit `new Response(..., { status: 404 })` from raw APIs. Avoid the deprecated `NotFoundRoute`. [404 handling](https://tanstack.com/router/latest/docs/guide/not-found-errors).

## 8. Server caching and revalidation

Start's documented runtime cache mechanism is ordinary HTTP caching, plus Router's in-memory loader cache. It does **not** document a stable Next-equivalent arbitrary-function cache with `cacheLife`, `cacheTag`, and `revalidateTag`. Experimental static server functions cache build-time results as assets; they are not a fit for live Sanity data with webhook invalidation. No additional Query library is needed for this port just to fetch two pages. [Start ISR](https://tanstack.com/start/latest/docs/framework/react/guide/isr), [static server functions](https://tanstack.com/start/latest/docs/framework/react/guide/static-server-functions), [Router data cache](https://tanstack.com/router/latest/docs/guide/data-loading).

Recommended ownership:

| Data | Owner / policy |
| --- | --- |
| Sanity lab content and LLM context | Server cache adapter around `@sanity/client.fetch`; key includes query, params, dataset, API version/perspective and invalidation version |
| Generated suggestions | Server cache keyed by mode, model/prompt version, and content version; preserve the current 300s/3600s policy if worth implementing |
| Quest world state/cooldown | Authoritative shared store; no HTTP/data-cache copy that hides new generations |
| Client loader data | Router lifecycle; invalidate/reload explicitly where the UI needs new data |
| Streamed chat/completion/contact responses | No-store; no shared cache |

The cache implementation should be an application module, called from `.server.ts` helpers and server-function handlers. Example of the framework hook, with a deliberately **application-defined** cache interface:

```ts
// This interface is a design proposal, not a TanStack API.
interface PortfolioCache {
  getOrLoad<T>(options: {
    key: string
    tags: string[]
    freshSeconds: number
    expireSeconds: number
    load: () => Promise<T>
    bypassRead?: boolean
  }): Promise<T>
  invalidateTags(tags: string[]): Promise<void>
}

// Inside a server-only Sanity service constructed with its cache/client:
// return cache.getOrLoad({
//   key: hashQueryAndParams(query, params, dataset, apiVersion),
//   tags,
//   freshSeconds: 60,  // choose explicitly; this is NOT an asserted Next 'minutes' TTL
//   expireSeconds: 300,
//   load: () => sanityClient.fetch(query, params),
// })
```

For a small Cache API adapter, the useful primitives are:

```ts
// Server-only fragment; a key version/tag epoch must already be part of keyUrl.
async function cachedPublicJson<T>(
  keyUrl: URL,
  ttlSeconds: number,
  load: () => Promise<T>,
  lifetime: { waitUntil(work: Promise<unknown>): void },
): Promise<T> {
  const key = new Request(keyUrl.toString())
  const hit = await caches.default.match(key)
  if (hit) return await hit.json() as T
  const value = await load()
  const stored = Response.json(value, {
    headers: { 'Cache-Control': `public, max-age=${ttlSeconds}` },
  })
  lifetime.waitUntil(caches.default.put(key, stored))
  return value
}
```

This is a simple TTL example, **not** tag invalidation, distributed single-flight, or a full SWR implementation. Use an internal same-origin synthetic URL with a namespace and hashed inputs. Cache only the public CMS/suggestion payload. Cache API contents and `delete` are local to a data center, so a webhook calling `caches.default.delete` once does not invalidate every location. KV/content-version keys or a global purge strategy need the Cloudflare delegate's design. Do not use this cache as the forge's atomic lock or sole durable world storage. [Cloudflare Cache API](https://developers.cloudflare.com/workers/runtime-apis/cache/).

If retaining webhook-driven freshness, port `/api/revalidate` as a Start server route; replace `next-sanity/webhook` with Sanity's standalone signature verification, then call the application cache's invalidation method. Invalidate content-query tags and **LLM/suggestion dependencies** as appropriate. `router.invalidate()` only affects that browser router and cannot invalidate a server cache; the webhook does not push new data into already-open visitors. [Sanity webhook toolkit](https://github.com/sanity-io/webhook-toolkit), [Router invalidation](https://tanstack.com/router/latest/docs/guide/data-mutations).

Explicit refresh currently bypasses generation's cache read; decide deliberately whether to preserve that or write refreshed suggestions back. Don't silently equate a POST refresh with global invalidation. If dropping `/api/revalidate`, accept TTL-based freshness and update the CMS webhook configuration instead of leaving it pointed at a dead endpoint.

## 9. Environment and Cloudflare bindings

In generic Start server code, unprefixed `process.env.X` is supported. In browser code, public Vite variables are `import.meta.env.VITE_X`; Vite statically replaces them at build time. Never expose secrets by renaming them with `VITE_` or by defining all of `process.env` in Vite. For this deployment use generated Cloudflare binding types and `import { env } from 'cloudflare:workers'` in server-only implementation modules. Read configuration inside request callbacks/factories. [Start env guide](https://tanstack.com/start/latest/docs/framework/react/guide/environment-variables), [Cloudflare bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/#importing-env-as-a-global), [Vite env exposure](https://vite.dev/guide/env-and-mode).

```ts
// src/server/ai.server.ts — replaces module-scope process.env client creation
import '@tanstack/react-start/server-only'
import { env } from 'cloudflare:workers'
import OpenAI from 'openai'
import { createOpenAI } from '@ai-sdk/openai'

export function getAIClients() {
  // Env fields come from `wrangler types` + configured vars/secrets.
  if (!env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is required')
  return {
    openai: new OpenAI({ apiKey: env.OPENAI_API_KEY }),
    aiOpenAI: createOpenAI({ apiKey: env.OPENAI_API_KEY }),
  }
}
```

Apply the same factory pattern to Sanity's client. The old `NEXT_PUBLIC_SANITY_PROJECT_ID`, dataset, and API date do not become public automatically under Vite. Since the two UIs get CMS content from the server, they can become ordinary server configuration fields such as `SANITY_PROJECT_ID`, `SANITY_DATASET`, and `SANITY_API_VERSION`. Only introduce a `VITE_` value if a browser actually needs it. `OPENAI_MODEL`, quest model/cooldown fields, Resend/contact fields, and webhook secret stay server-only.

Worker `process.env` availability depends on Node compatibility/runtime configuration; bindings are more explicit and also cover non-string objects like KV/R2/DO namespaces. `import.meta.env.SSR`/`DEV` are build-time flags, not a way to get runtime secrets. Replace the UI's `process.env.NODE_ENV !== 'production'` debug branch with `import.meta.env.DEV`. Prefer the incoming request URL or explicit `SITE_URL` to the existing Vercel hostname fallback helper. [Cloudflare env variables](https://developers.cloudflare.com/workers/configuration/environment-variables/), [Vite flags](https://vite.dev/guide/env-and-mode).

## 10. `after()` replacement and typed execution context

Start is runtime-neutral: a server route does not automatically receive a documented `context.cloudflare.ctx` property. **Define and populate it yourself.** The current Start API accepts request context as `handler.fetch(request, { context })`, with types registered through `@tanstack/react-router`'s `Register.server.requestContext`. [Start request context](https://tanstack.com/start/latest/docs/framework/react/guide/server-entry-point#request-context).

```ts
// src/types/start-context.d.ts — uses generated Worker Env/ExecutionContext types
import '@tanstack/react-router'

declare module '@tanstack/react-router' {
  interface Register {
    server: {
      requestContext: {
        cloudflare: { env: Env; ctx: ExecutionContext }
      }
    }
  }
}
```

```ts
// src/worker.ts — Wrangler `main` points here
import handler from '@tanstack/react-start/server-entry'

export default {
  fetch(request, env, ctx) {
    // Optional legacy redirects can run before delegation here.
    return handler.fetch(request, {
      context: { cloudflare: { env, ctx } },
    })
  },
} satisfies ExportedHandler<Env>
```

The built-in Start handler retains the default streaming/error wrapper. The outer Worker `fetch(request, env, ctx)` signature is different from Start's `fetch(request, options)` signature; passing env as Start's second argument does not populate a typed context. The custom Worker file can also export Durable Objects/Workflows or extra handlers later. Leave `src/server.ts` absent in this variant; don't accidentally make two differently-shaped adapters refer to each other. [Cloudflare custom entrypoints](https://developers.cloudflare.com/workers/framework-guides/web-apps/tanstack-start/#custom-entrypoints), [Start context API](https://tanstack.com/start/latest/docs/framework/react/guide/server-entry-point#request-context).

Then server routes can call `context.cloudflare.ctx.waitUntil(promise)` as shown above. Forward a closure rather than destructuring `ctx.waitUntil`, preserving its receiver. Keep env/ctx in server handler context; never return them from route loaders or `beforeLoad`, which can serialize context into HTML. [Workers context API](https://developers.cloudflare.com/workers/runtime-apis/context/), [Start execution model](https://tanstack.com/start/latest/docs/framework/react/guide/execution-model).

**Material behavior difference:** Worker `waitUntil` provides up to **30 seconds after the response finishes or the client disconnects**, shared by the request's background tasks. This is not a 30-second cap on an actively streaming HTTP request. The current forge can generate for 90 seconds and claims persistence even after disconnect; replacing `after(job.done)` with `ctx.waitUntil(job.done)` alone does not preserve that guarantee. Long-lived generation needs durable coordination/execution, such as the Cloudflare delegate's DO/Workflow/Queue design. Next's exported `maxDuration = 180`/`60` has no meaning in Start and should be removed. [Cloudflare `waitUntil` lifetime](https://developers.cloudflare.com/workers/runtime-apis/context/#waituntil).

Optional `src/start.ts` is for framework middleware. Defining it replaces the default startup configuration, so include the current server-function CSRF middleware if adding one:

```ts
import { createCsrfMiddleware, createStart } from '@tanstack/react-start'

const serverFnCsrf = createCsrfMiddleware({
  filter: (request) => request.handlerType === 'serverFn',
})

export const startInstance = createStart(() => ({
  requestMiddleware: [serverFnCsrf],
}))
```

With no custom `src/start.ts`, Start installs this protection for server functions by default. This does not replace the current endpoint-specific validation/rate limits. [Current server-function configuration](https://tanstack.com/start/latest/docs/framework/react/guide/server-functions#same-origin-requests).

## 11. Compatibility, linting, and remaining checks

### React 19.3 and Three

Start/Router's published peer ranges accept React 19.3.1. This repo's Fiber **9.8.2** explicitly declares React/React DOM `>=19 <19.4`; Drei **10.7.9** declares React `^19` and Fiber `^9.0.0`. Fiber 9.8.0's release notes explicitly added React 19.3 support. Keep the existing versions and one deduplicated React/React DOM pair; no downgrade or Fiber 10 alpha upgrade is required by this migration. Peer compatibility is evidence, not proof that every scene behavior is unchanged. [Start peers](https://registry.npmjs.org/@tanstack/react-start/1.169.4), [Fiber peers](https://registry.npmjs.org/@react-three/fiber/9.8.2), [Drei peers](https://registry.npmjs.org/@react-three/drei/10.7.9), [Fiber 9.8.0 release](https://github.com/pmndrs/react-three-fiber/releases/tag/v9.8.0).

The existing scene uses browser canvas creation and GLTF loaders. Keep browser-only scene imports behind `lazy` + `ClientOnly`; do not try to make them run in the Worker. Keep pure world compilation/schema code separate from scene-module imports so server rendering the HUD does not pull in Drei/DOM code. Vite SSR can expose dependency export/ESM differences; don't add blanket `ssr.noExternal` or dependency-optimization exclusions without reproducing a specific failure. [Vite SSR dependency handling](https://vite.dev/guide/ssr#ssr-externals), [Start client/server execution](https://tanstack.com/start/latest/docs/framework/react/guide/execution-model).

### ESLint replacement

Remove `eslint-config-next` and the Next core-web-vitals/TS presets. Use ESLint flat config with JS/TypeScript, React Hooks, and optionally TanStack Router's recommended rules:

```js
// eslint.config.mjs — example baseline, preserve useful project overrides
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import hooks from 'eslint-plugin-react-hooks'
import router from '@tanstack/eslint-plugin-router'

export default [
  { ignores: ['dist/**', '.wrangler/**', 'src/routeTree.gen.ts', 'worker-configuration.d.ts', 'playwright-report/**', 'test-results/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  hooks.configs.flat.recommended,
  ...router.configs['flat/recommended'],
]
```

Install the named packages explicitly and include configured browser/Node globals for the relevant files (for example through the `globals` package). Retain accessibility linting via `eslint-plugin-jsx-a11y` if desired; replacing Next's preset otherwise loses those checks. Router's create-route-property-order rule may require reordering options in snippets to its preferred type-inference order. The current Router ESLint package is 1.162.0 with ESLint 9 support. [Router ESLint](https://tanstack.com/router/latest/docs/eslint/eslint-plugin-router), [TypeScript ESLint setup](https://typescript-eslint.io/getting-started/), [React Hooks plugin](https://react.dev/reference/eslint-plugin-react-hooks).

### Explicit uncertainties and implementation validation

1. **Not built here:** the combined Vite/Cloudflare/Compiler config and route examples are researched patterns; no migrated app has been installed, typechecked, or deployed by this research task. Verify a clean build and a built Worker response before adopting them.
2. **Newest Babel adapter mismatch:** npm latest 0.3.0 is outside plugin-react 6.1.2's declared optional peer range. Pin 0.2.4 until official compatibility changes or a deliberate tested upgrade.
3. **Background generation is the main platform constraint:** storage, shared locks, current-job following, rate-limit coordination, and disconnect persistence require the Cloudflare delegate's implementation. `waitUntil` alone is insufficient for the existing 90-second guarantee.
4. **No exact Next cache parity assumed:** choose explicit Sanity TTLs and invalidation semantics; don't translate `cacheLife('minutes')` into an invented identical TTL. Decide how suggestions' refresh writes interact with the shared cache.
5. **No production indexing decision inferred:** the snippet preserves `noindex`. Decide when to make the new site root indexable and how to expose legal content.
6. **Testing boundary:** retain Node unit tests of extracted handler bodies, then test real HTTP status/headers/streaming, initial SSR shell, canvas hydration, fonts, portrait, and GLB URLs through the built Worker. Unit tests alone cannot verify bundler boundaries or Cloudflare lifetime.
7. **Do not accidentally keep Next runtime imports:** after the actual port, search the retained dependency closure for `next/`, `next-sanity`, `server-only`, `.next`, `NEXT_PUBLIC_`, Next `metadata`/`viewport` exports, `after`, `connection`, and cache directives; also check copied shared components and test mocks.

## Key implementation decisions to hand back

Use stable Start 1.169.4/Router 1.170.46 on Vite 8.3.5; enable the existing Babel React Compiler through plugin-react 6 + the 0.2.4 Rolldown Babel adapter. Keep SSR and stream the quest arrival shell through a deferred loader promise. Use server functions for page data and raw server routes for the five existing API protocols. Use Fontsource, existing CSS Modules/Tailwind, and Router links. Supply a typed Worker request context for `waitUntil`; hand durable world generation, storage, and shared cache invalidation to the Cloudflare design.
