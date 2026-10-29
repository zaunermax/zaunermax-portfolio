# Cloudflare Workers migration research

Verified 2026-10-29. Scope: research only; no application source, dependencies, DNS, secrets, Workers, or other Cloudflare resources were changed. CLI discovery/docs/schema calls used `CLOUDFLARE_ACCOUNT_ID=6894de59445d940fd8982eb1159d2836`; all search queries were anonymous. The active zone, absent `beta` record, and Paid entitlement are supplied context, not independently audited account state.

## Recommendation

Use TanStack Start's **Vite integration with the stable `@cloudflare/vite-plugin` and Wrangler configuration/deployment**. Run `pnpm dev` as `vite dev`, so server code executes in workerd with local bindings. Use **one SQLite-backed `QuestForge` Durable Object named `global-v1`** for the one shared world, lock/cooldown, durable event replay, and history. A separate small `QuestLimits` DO can provide strict hourly/daily counters. Keep Resend and the existing OpenAI providers. A KV cache is sufficient for minute-scale public Sanity data if eventually consistent webhook invalidation is acceptable.

The decisive recent change: **DO `this.ctx.waitUntil(runPromise)` now prevents idle eviction for up to 15 minutes**, including after all clients disconnect, for compatibility dates from **2026-10-01**. This makes a 90–180 second generation practical without a separate queue/workflow. This is different from an ordinary Worker's 30-second post-disconnect extension. Persist state and retain a watchdog alarm; keepalive is not a crash/restart guarantee. [October 1 change](https://developers.cloudflare.com/changelog/post/2026-10-01-pending-io-keep-alive/), [DO state API](https://developers.cloudflare.com/durable-objects/api/state/).

## Repository implications

Inspected `world/store.ts`, `world/forge.ts`, `api/lab/quest/world/route.ts`, `server/rate-limit.ts`, `chat/mailer.ts`, `api/lab/quest/chat/route.ts`, `lib/sanity-client.ts`, plus generation, OpenAI initialization, CMS callers, and the revalidation webhook.

- The file `WorldStore` serializes only within one process. Its `updateState(callback)` is an adapter interface, **not a directly serializable DO RPC interface**. Execute that callback inside the DO, or expose domain operations such as `begin`, `complete`, `fail`, and `getWorldState` over RPC. Do not send functions to a DO stub.
- The forge's `globalThis` registry must move inside the DO. Every caller must resolve the same DO name. Swapping only the storage adapter leaves multi-instance follow/replay broken.
- Keep the current NDJSON wire contract: start/brief/done/error, busy 409, cooldown 429, ordinary state JSON when nothing is running. Persist final worlds only after validation/moderation, as today.
- Move `next/server`'s `after()`/`connection()` and `next/cache` behavior to Workers/Start equivalents. `maxDuration = 180` is Next/platform configuration; it does not configure Workers.
- Fix completion fencing during migration: current `completeGeneration()` saves the world *before* checking whether the lock ID still matches. An expired run must not overwrite a newer world. Check ownership and commit world/history/cooldown/lock release atomically inside the DO.
- Installed application versions are `ai@7.0.154`, `@ai-sdk/openai@4.0.103`, and `openai@7.45.0`. No Workers execution of this migrated app was performed; SDK compatibility below is documented support plus source inspection, not a tested migration.
- Workers has an ephemeral virtual filesystem; `nodejs_compat` does not make `.data/quest` durable. Use bindings in local development too. [Filesystem behavior](https://developers.cloudflare.com/changelog/post/2025-08-15-nodejs-fs/).

## 1. Build, entrypoint, CLI, and configuration

Cloudflare's current TanStack guide explicitly uses `cloudflare({ viteEnvironment: { name: 'ssr' } })`, `tanstackStart()`, React's Vite plugin, and Wrangler. The default `main` is `@tanstack/react-start/server-entry`; use `src/server.ts` when exporting DO classes. Remove a competing deployment adapter such as Nitro. [TanStack deployment guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/tanstack-start/).

Read-only npm registry checks today returned stable `@cloudflare/vite-plugin@1.66.0` (peer Wrangler `^4.154.0`, Vite 6/7/8), `wrangler@4.156.0`, and a separate plugin beta tag `2.0.0-beta.v.8`. Pin a compatible set with the TanStack delegate's chosen Vite version. These observations are time-specific.

```ts
// Proposed vite.config.ts, not applied
import { defineConfig } from 'vite';
import { cloudflare } from '@cloudflare/vite-plugin';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    tanstackStart(),
    react(),
  ],
  server: { watch: { ignored: ['**/.wrangler/**'] } },
});
```

The watch exclusion is inexpensive protection on this Linux host: a reported persistence/HMR loop was closed upstream, but can affect older plugin combinations. It is not a requirement to use a separate Worker for same-Worker DOs. [Upstream issue/fix reference](https://github.com/cloudflare/workers-sdk/issues/15550).

```jsonc
// Proposed wrangler.jsonc. Placeholders require real values before deployment.
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "zaunermax-portfolio-beta",
  "account_id": "6894de59445d940fd8982eb1159d2836",
  "main": "src/server.ts",
  "compatibility_date": "2026-10-29",
  "compatibility_flags": ["nodejs_compat"],
  "upload_source_maps": true,
  "workers_dev": false,
  "preview_urls": false,
  "routes": [
    { "pattern": "beta.zaunermax.at", "custom_domain": true }
  ],
  "assets": {
    "binding": "ASSETS",
    "not_found_handling": "none",
    "run_worker_first": ["/api/*"]
  },
  "durable_objects": {
    "bindings": [
      { "name": "QUEST_FORGE", "class_name": "QuestForge" },
      { "name": "QUEST_LIMITS", "class_name": "QuestLimits" }
    ]
  },
  "migrations": [
    { "tag": "v1", "new_sqlite_classes": ["QuestForge", "QuestLimits"] }
  ],
  "kv_namespaces": [
    { "binding": "CMS_CACHE", "id": "<PROVISIONED_NAMESPACE_ID>" }
  ],
  "vars": {
    "SITE_URL": "https://beta.zaunermax.at",
    "QUEST_WORLD_COOLDOWN_MINUTES": "60",
    "OPENAI_MODEL": "<EXISTING_CONFIGURED_CHAT_MODEL>",
    "SANITY_PROJECT_ID": "<EXISTING_PROJECT_ID>",
    "SANITY_DATASET": "<EXISTING_DATASET>",
    "SANITY_API_VERSION": "2023-07-28",
    "CONTACT_FROM_EMAIL": "<EXISTING_VERIFIED_SENDER>",
    "CONTACT_TO_EMAIL": "<EXISTING_RECIPIENT>"
  },
  "secrets": {
    "required": ["OPENAI_API_KEY", "RESEND_API_KEY", "SANITY_REVALIDATE_SECRET"]
  },
  "observability": {
    "enabled": true,
    "traces": { "enabled": true, "head_sampling_rate": 1 }
  },
  "limits": { "cpu_ms": 30000 }
}
```

`assets.directory` is intentionally omitted: the Vite plugin populates it in the generated deployment configuration with the client output. Keep `not_found_handling: 'none'` for SSR; an SPA `index.html` fallback can swallow navigations/API routes. Existing assets are served first, unmatched paths invoke Start, and the API prefix is explicitly Worker-first. An `ASSETS` binding is optional unless application code needs it. Inspect generated output to confirm framework routing before deployment. [Vite assets](https://developers.cloudflare.com/workers/vite-plugin/reference/static-assets/), [asset binding/routing](https://developers.cloudflare.com/workers/static-assets/binding/).

Keep `public/lab/quest/*.glb` as static assets. The three files total roughly 2.7 MiB (largest about 1.9 MiB), far below the per-file 25 MiB limit. No R2 bucket is needed for these source-controlled files. [Workers limits](https://developers.cloudflare.com/workers/platform/limits/).

Suggested scripts: `dev: vite dev`, `build: vite build`, `preview: vite preview`, `cf-typegen: wrangler types`, `typecheck: wrangler types && tsc --noEmit`, `deploy: pnpm build && wrangler deploy`. Vite builds generate a deployment config, and Wrangler discovers it through `.wrangler/deploy/config.json`; avoid forcing `--config wrangler.jsonc` at deploy time if that bypasses generated output. [Generated configuration](https://developers.cloudflare.com/workers/wrangler/configuration/#generated-wrangler-configuration).

### How `cf` differs

Do **not** run `cf deploy/dev/build/init` over this Wrangler setup. Current `cf` uses `cloudflare.config.ts`, the Vite plugin 2 beta, and `.cloudflare/output/v0`; its automatic configuration can ignore a Wrangler file and change the project. Resource/API discovery through `cf` remains fine. The documented stable TanStack path above is the recommendation for this migration, specifically answering the requested Wrangler setup. [cf vs Wrangler](https://developers.cloudflare.com/cf/wrangler/), [cf project execution](https://developers.cloudflare.com/cf/projects/), [automatic setup warning](https://developers.cloudflare.com/cf/get-started/first-worker/).

If the owner explicitly chooses the newer **cf-native** path instead, adopt its configuration format consistently and validate TanStack + DO custom entry behavior on plugin 2 beta. Use `cf deploy`, `cf workers types` (`.cloudflare/types/index.d.ts`), and `cf deploy --secrets-file <private-file>` there. Do not maintain both deployment configurations. End-to-end TanStack compatibility of that beta path is **not verified here**. `cf` authentication is separate from Wrangler authentication; being signed in to `cf` does not establish Wrangler credentials. [cf installation/authentication](https://developers.cloudflare.com/cf/get-started/), [command comparison](https://developers.cloudflare.com/cf/wrangler/reference/).

Run `pnpm exec wrangler types` before type checking and after binding/date/flag changes. Its default `worker-configuration.d.ts` contains binding and date-specific runtime types. Include it and `node` in the server TypeScript configuration; retain the framework's `vite/client` typing where needed. Do not hand-edit the generated `Env`. [Generated types](https://developers.cloudflare.com/workers/languages/typescript/).

## 2. Local development parity

Yes: Vite + the Cloudflare plugin runs server code in **workerd**, with local Miniflare implementations of DO/KV/D1/R2 bindings. Their state persists under **`.wrangler/state`** by default. `cloudflare({ persistState: { path: '...' } })` changes the location; `false` disables persistence. Keep bindings local (no `remote: true`) and use the same binding calls and DO classes as production. Local data starts empty and is separate from production. [Plugin runtime](https://developers.cloudflare.com/changelog/post/2025-04-08-vite-plugin/), [local data persistence](https://developers.cloudflare.com/workers/local-development/local-data/), [plugin API](https://developers.cloudflare.com/workers/vite-plugin/reference/api/).

Local secrets belong in ignored `.dev.vars` **or** `.env` beside the Wrangler config. `.dev.vars` takes precedence and suppresses `.env` loading. With `secrets.required`, only declared secret keys are loaded from these files/process env; put other application settings in `vars` or explicit development configuration. In particular, arbitrary `QUEST_*`, `SITE_URL`, or old `NEXT_PUBLIC_*` settings in an existing `.env.local` must not silently be assumed to arrive in workerd. [Local secret handling](https://developers.cloudflare.com/workers/configuration/secrets/).

HMR can reset DO memory and interrupt live streams/runs. Persist jobs/events/locks, reconnect by job ID/sequence, and treat editing during generation as a restart test. Same-worker DO classes work when exported by the configured Worker entry; a separate DO Worker is optional isolation, not a prerequisite. Restart the dev server if an alarm stops firing after hot reload; Cloudflare documents that alarm caveat for Wrangler, so specifically verify the selected Vite plugin version too. [Custom exports](https://developers.cloudflare.com/workers/framework-guides/web-apps/tanstack-start/#custom-entrypoints), [alarm/HMR caveat](https://developers.cloudflare.com/durable-objects/platform/known-issues/#alarms-in-local-development).

There is no documented general Vite-plugin 30/60-second streaming cap. Verify a delayed 180-second stream with `curl -N` directly against Vite; reverse proxies, tunnels, browser aborts, HMR, and SDK timeouts can impose their own behavior. This research did not launch a server or test long local streams. Local CPU behavior is not proof of production budget compliance.

## 3. Forge: one global Durable Object

One DO is appropriate because this application has **one global coordination atom**: only one visitor worldwide may regenerate the shared office. Do not route unrelated static traffic through it. The singleton adds a geographic hop to world reads and is eventually a throughput bottleneck, but is a reasonable initial design for this portfolio.

Use a stable object name, e.g. `env.QUEST_FORGE.getByName('global-v1')`. Store:

- singleton state: current world ID, success/failure times, lease ID/deadline;
- jobs: ID, seed, start time, status, deadline, final/error metadata;
- events: `(job_id, seq, json)` for replay and reconnect;
- worlds: immutable IDs and JSON, with generation details in history.

### Lifetime and limits

With the proposed date, DO pending I/O, outbound fetches, and promises passed to `ctx.waitUntil` prevent idle eviction for up to 15 minutes **per pending operation**. Waiting on the OpenAI stream is not charged as active CPU, but DO duration billing continues. When nothing keeps it active, hibernation/eviction can discard memory. The old 70–140-second idle-eviction warning is not a reason to reject this design under the current compatibility behavior. [Current DO lifecycle](https://developers.cloudflare.com/durable-objects/concepts/durable-object-lifecycle/).

DO default CPU allowance is 30 seconds, configurable up to 300,000 ms; that is active CPU, not the model's wall time. DO HTTP/RPC has no hard wall-clock limit while connected; alarm handlers have a 15-minute wall-clock limit. A 90–180 second mostly-awaiting operation fits those envelopes. Do not hold `blockConcurrencyWhile()` across generation; it blocks followers and has its own timeout. Use it only for bounded initialization when needed. [DO limits](https://developers.cloudflare.com/durable-objects/platform/limits/), [invocation wall limits](https://developers.cloudflare.com/workflows/reference/limits/), [concurrency API](https://developers.cloudflare.com/durable-objects/api/state/#blockconcurrencywhile).

`ctx.waitUntil` in the DO is sufficient for disconnect survival within this budget. A **watchdog alarm** is recommended for recovery: persist the job/lease before starting; schedule an alarm for the lease deadline; on expiry mark the unfinished job failed, append an error event, release its lease, and apply failure backoff. Do not automatically restart a paid OpenAI call: the existing generator deliberately has `maxRetries: 0` to avoid duplicate spend. Crashes/deployments can still interrupt the call, and an in-progress OpenAI stream cannot be reconstructed just by replaying saved brief events. [Alarms and retries](https://developers.cloudflare.com/durable-objects/api/alarms/), [replacement/code-update behavior](https://developers.cloudflare.com/durable-objects/platform/known-issues/).

Alternative: have `start()` persist a pending job and schedule an immediate alarm, then **await the complete generator inside `alarm()`**. That makes the execution event independent of a browser from the outset. Alarm delivery is at least once, so implement terminal-state checks and an explicit no-duplicate-generation recovery policy; do not blindly restart `running` jobs on alarm retries. The direct `waitUntil` runner plus watchdog is simpler for the current one-attempt semantics.

### Custom Worker entry and route forwarding

```ts
// Proposed src/server.ts
import handler from '@tanstack/react-start/server-entry';
export { QuestForge } from './server/quest-forge';
export { QuestLimits } from './server/quest-limits';

export default { fetch: handler.fetch } satisfies ExportedHandler<Env>;
```

The Start server route can retain the existing public endpoint and forward its validated request:

```ts
// Inside a server-only Start route handler
import { env } from 'cloudflare:workers';

async function forwardWorldRequest(request: Request): Promise<Response> {
  // Perform origin checks here; enforce the actual atomic budget/lease in the DO.
  const ip = request.headers.get('CF-Connecting-IP') ?? 'local-dev';
  const headers = new Headers(request.headers);
  headers.set('X-Quest-Client-Key', ip); // overwrite any user-supplied value
  const response = await env.QUEST_FORGE.getByName('global-v1').fetch(
    new Request(request, { headers }),
  );
  return response; // pass body through; never await .text()/.json() on NDJSON
}
```

A DO `fetch()` returning an ordinary streamed `Response` is supported and is convenient for the existing HTTP/NDJSON contract; RPC is also suitable for structured state/limit calls. No WebSocket is required. Stream cancellation propagates to the DO: its subscriber `cancel()` must detach that subscriber **without aborting generation**. [DO stream example](https://developers.cloudflare.com/durable-objects/examples/readable-stream/).

### Lifecycle sketch (integration helpers deliberately named, not drop-in code)

The following shows ordering, fencing, and lifetime; helpers represent repo-specific schema, sanitization, generation events, and SQL mappings that an implementation must supply.

```ts
import { DurableObject } from 'cloudflare:workers';

// Job, ForgeEvent, StoredWorld and helper implementations omitted in this sketch.
export class QuestForge extends DurableObject<Env> {
  // Subscribers are ephemeral; jobs/events/worlds are durable.
  private subscribers = new Map<string, Set<ReadableStreamDefaultController<Uint8Array>>>();

  async start(clientKey: string) {
    const claim = this.ctx.storage.transactionSync(() => {
      // Reap expired lease, then check busy/cooldown, then per-IP budget.
      // claimJob inserts job + lease + start event synchronously with SQL.
      // Use the same 3/hour policy and Retry-After semantics as today's route.
      return this.claimJob(clientKey);
    });
    if (claim.status !== 'started') return claim;

    // Persist watchdog before acknowledging. Only one alarm exists per DO.
    await this.ctx.storage.setAlarm(claim.job.deadline);
    await this.ctx.storage.sync();
    this.ctx.waitUntil(this.run(claim.job));
    return claim;
  }

  private async run(job: Job) {
    try {
      // Wrap the complete generation + moderation in a total wall deadline.
      // Do NOT pass a browser request.signal to this operation.
      const result = await this.generateAndEmit(job, async event => {
        if (!this.ownsLease(job.id)) throw new Error('Superseded job');
        this.appendEvent(job.id, event); // SQL insert with increasing seq
        await this.ctx.storage.sync();
        this.fanOut(job.id, event); // enqueue only; never wait on every slow client
      });

      const done = this.ctx.storage.transactionSync(() => {
        if (!this.ownsLease(job.id)) return null; // fence BEFORE writing current
        // Atomic: insert immutable history, update current, finish job,
        // set cooldown from job.startedAt, clear owned lease, append done.
        return this.commitSuccess(job, result);
      });
      await this.ctx.storage.sync();
      if (done) this.fanOut(job.id, done);
    } catch (error) {
      const failed = this.ctx.storage.transactionSync(() =>
        this.failIfStillOwner(job.id, error),
      );
      await this.ctx.storage.sync();
      if (failed) this.fanOut(job.id, failed);
    } finally {
      this.closeSubscribers(job.id);
      // The watchdog can safely fire later and see a terminal job.
      // Avoid deleting a newer job's alarm after an intervening await.
    }
  }

  async alarm() {
    // Check persisted deadline and lease ownership. If still running and expired:
    // atomically append error + release lock + apply 2-minute failure backoff.
    // If the alarm is early, reschedule to the persisted deadline.
    this.reapExpiredJob();
  }
}
```

Use `transactionSync()` for SQL multi-row state transitions, with no network awaits inside. SQLite-backed storage supports both synchronous SQL and a KV API; SQL avoids the callback-across-RPC problem and fits events/history. Explicit `storage.sync()` above makes persist-before-publish ordering visible. [SQLite storage and transactions](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/).

Keep the existing **3-minute lock** only if the whole job has a comfortably shorter deadline (e.g. 150 seconds including moderation/retries/cleanup). If the requirement is a full 180-second execution allowance, use a longer lease (e.g. 240 seconds) and watchdog. Preserve the existing successful cooldown's start-time basis and two-minute failure backoff. Enforce lease ID fencing at every final transition; an old failure must not mutate a newer job either.

For replay/follow, synchronously read events and register the subscriber without an intervening `await`, so a live event cannot slip between replay and subscription. Return a stream with `Content-Type: application/x-ndjson; charset=utf-8`, `Cache-Control: no-store, no-transform`. Add monotonically increasing sequence IDs for optional resume. A canceled follower only removes its controller. On `enqueue()` failure detach it; cap subscribers and queue bytes/`desiredSize`, dropping slow readers so they can reconnect. Persist and broadcast only bounded brief snapshots (the current generator deduplicates these), not an unbounded token log. Close on `done/error`; keep recent terminal events long enough for reconnect, prune old events separately from world history. These are application design recommendations.

### Alternatives

| Primitive | Assessment for this forge |
| --- | --- |
| DO + durable storage + `waitUntil` + watchdog | Recommended: one place for serialization, replay, live followers, and world commit. Smallest change matching today's contract. |
| Workflows + DO event broker | Better if generation becomes multi-step/retryable and must survive restarts. Steps persist completion and can retry; the interrupted OpenAI call itself may still repeat and cost money. Adds a broker for followers and idempotent event handling. [Workflow rules](https://developers.cloudflare.com/workflows/build/rules-of-workflows/) |
| Queue consumer + DO broker | Durable job delivery with a 15-minute consumer wall limit; delivery/retries require idempotent paid-call policy. Still needs DO storage/fan-out/lock. Unnecessary extra infrastructure initially. [Queue limits](https://developers.cloudflare.com/queues/platform/limits/) |
| KV + ordinary Worker `waitUntil` | Wrong for atomic global locking, and Worker post-response/disconnect lifetime is only 30 seconds. KV is eventually consistent. |
| D1 alone | Good durable tables, but does not execute the job, own the subscriber streams, or keep computation alive. Can complement a runner, not replace one. |

## 4. Current world and history storage

**Start with DO SQLite for both**, committing current/history/state together. Fresh uncached reads go through the same object, so `done` followed by a page read sees the committed world. Keep `Cache-Control: no-store` on world state and on any HTML that embeds the live world; do not prerender that data. The stored world is small JSON, not the GLBs. SQLite DO storage is strongly consistent and supports 10 GB per object, with a 2 MB key/value or SQL row limit. Measure world/event payloads before choosing a storage representation. [DO storage](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/), [DO limits](https://developers.cloudflare.com/durable-objects/platform/limits/).

| Store | Current world | Append-only history |
| --- | --- | --- |
| DO SQLite | Best initial choice: same transaction as cooldown/lease/job. | Best initial choice: simple, query by ID, no extra binding. |
| D1 | Valid if separate relational queries/admin reporting are needed; adds a second state boundary. | Useful if history becomes query/reporting-heavy. With read replicas, use the primary or appropriate session/bookmark for freshness. [D1 replication](https://developers.cloudflare.com/d1/best-practices/read-replication/) |
| KV | Avoid: writes, updates, and negative lookups can remain stale in other locations. | Acceptable for immutable IDs when delayed visibility is fine, but no advantage here. [KV consistency](https://developers.cloudflare.com/kv/concepts/how-kv-works/) |
| R2 | Strongly consistent through bindings, but publishing a current pointer plus forge state would cross services. | Good later for large immutable JSON/artifacts or archival export; retain the authoritative current pointer/job state in DO. [R2 consistency](https://developers.cloudflare.com/r2/reference/consistency/) |

If archiving to R2 later, use immutable IDs and an idempotent outbox/retry marker. A DO transaction and an R2 write cannot be committed as one distributed transaction. No D1/R2 resource is needed for the initial recommended design.

## 5. Rate limiting and client IP

The Workers `ratelimits` binding supports only **10-second or 60-second periods**. Counters are **approximate and separate by Cloudflare location**, so a constant key does not create an exact global daily cap. It cannot implement the existing 3/hour visitor limit, 20/10-minute chat limit, or 1,500/day global budget. It is optional burst protection, not quota accounting. [Rate Limiting API](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).

Recommended simple policy:

- Forge: keep its per-IP counter inside `QuestForge`, checked in the same synchronous claim transaction after busy/cooldown checks. This preserves the current rule that busy/cooldown attempts do not consume visitor budget.
- Chat/contact: one `QuestLimits` object with per-route/IP and global keys; check and increment all relevant counters in one SQL transaction. Keep it short; it does not proxy the AI stream. Change `rateLimit()` callers to `await` the binding.
- Preserve **first-use fixed windows**, as today's implementation uses, unless deliberately changing to UTC calendar days. “Come back tomorrow” currently means up to 24 hours from the first use, not a midnight reset.
- Return the reset-derived `retryAfterSeconds`. Expire/prune old IP counter rows, e.g. periodically during checks; no per-IP DO lifecycle machinery is needed at this scale.

```ts
// Sketch of the SQL transition inside QuestLimits; schema and RPC wrapper omitted.
// counter(key TEXT PRIMARY KEY, count INTEGER NOT NULL, reset_at INTEGER NOT NULL)
function take(limits: { key: string; max: number; windowMs: number }[], now: number) {
  return ctx.storage.transactionSync(() => {
    const rows = limits.map(limit => ({
      ...limit,
      current: sql.exec<{ count: number; reset_at: number }>(
        'SELECT count, reset_at FROM counter WHERE key = ?', limit.key,
      ).toArray()[0],
    }));
    const blocked = rows.filter(x => x.current && x.current.reset_at > now && x.current.count >= x.max);
    if (blocked.length) return {
      ok: false,
      retryAfterSeconds: Math.ceil(Math.max(...blocked.map(x => x.current!.reset_at - now)) / 1000),
    };
    for (const x of rows) {
      const active = x.current && x.current.reset_at > now;
      sql.exec('INSERT OR REPLACE INTO counter(key, count, reset_at) VALUES (?, ?, ?)',
        x.key, active ? x.current!.count + 1 : 1,
        active ? x.current!.reset_at : now + x.windowMs);
    }
    return { ok: true };
  });
}
```

Use **`CF-Connecting-IP`** at the public Worker boundary, overriding a client-supplied internal forwarded key. Do not trust the current first `X-Forwarded-For` value for quota identity on Workers. A local-only fallback is needed because local requests may lack Cloudflare headers. IP remains best-effort identity (NAT/VPN users can share a budget). [Request header reference](https://developers.cloudflare.com/fundamentals/reference/http-headers/#cf-connecting-ip).

Optional burst binding, if wanted, with an account-unique numeric namespace string:

```jsonc
"ratelimits": [{
  "name": "QUEST_BURST",
  "namespace_id": "<UNUSED_POSITIVE_INTEGER_AS_STRING>",
  "simple": { "limit": 30, "period": 60 }
}]
```

## 6. OpenAI, AI SDK, and streaming limits

Keep direct outbound HTTPS fetches to OpenAI. The OpenAI Node SDK explicitly lists Workers as supported. Local source inspection confirms the installed SDK recognizes `Cloudflare-Workers`, and `@ai-sdk/openai` accepts/provides a fetch implementation. No proxy or Workers AI model migration is required. `nodejs_compat` helps transitive Node dependencies; it does not change provider model/API compatibility. [OpenAI supported runtimes](https://github.com/openai/openai-node#requirements).

Construct clients without starting I/O at module scope; perform calls inside handlers/DO methods. Prefer explicit runtime keys, e.g. `new OpenAI({ apiKey: env.OPENAI_API_KEY })` and `createOpenAI({ apiKey: env.OPENAI_API_KEY })`. Keep those imports server-only. Do not add Node-only `undici` agents/polyfills. [Workers fetch/request context](https://developers.cloudflare.com/workers/runtime-apis/fetch/).

Paid currently allows **10,000 subrequests per invocation by default**, **6 simultaneous outgoing connections**, 128 MB memory, and no enforced response body size cap. A moderation call, a model stream, and occasional CMS read are comfortably inside these limits. Waiting for network I/O does not consume active CPU. No HTTP wall-clock cap prevents a connected browser from receiving a 60–180 second stream; preserve streaming rather than buffering. Ordinary Worker background work has only 30 seconds after response completion/disconnect. [Workers limits](https://developers.cloudflare.com/workers/platform/limits/).

Specific migration checks:

- Keep chat's `abortSignal: request.signal`: that session may stop when its visitor leaves. **Do not reuse it for the shared forge**.
- Add an overall forge abort budget that includes moderation, SDK retry delays, cleanup and result persistence. Current generation has a 90-second timeout, moderation has 15 seconds and one retry; a generation-only timeout is not a total deadline.
- Keep `createUIMessageStreamResponse`/NDJSON bodies unconsumed. Ensure response middleware does not buffer/compress them until completion. Optional NDJSON-compatible heartbeats can help intermediaries, but must respect the existing parser's event contract.
- Expect streaming errors after headers: emit the public terminal error event and leave the last valid world intact.
- **Unverified:** exact AI SDK 7 structured partial outputs + Responses moderation + Start middleware behavior on the selected workerd/plugin bundle. Run paid-call smoke tests only when separately authorized; no such calls were made here. I found no primary documentation establishing a blanket incompatibility for this package combination.

## 7. Sanity caching and webhook invalidation

Replace `next-sanity`'s Next-specific wrapper with **`@sanity/client`** (already installed), retain pinned API version/published perspective, and keep origin fetches at `useCdn: false` if webhook freshness matters. These changes follow the current repository configuration; do not cache secret/draft data under public keys.

For a simple distributed minute cache, choose **KV with `expirationTtl: 300`**, caching the whole GROQ result under a deterministic key containing project/dataset/API version/perspective/query/normalized params and the relevant tag-generation tokens. The client currently has tags `general`, `talk`, `event`, `wiki-page`, and `llm-content`; a tag-generation token avoids listing all slug-specific keys during a webhook. On a verified webhook write a new random token for its tag. Old result keys naturally expire. Concurrent invalidations use random tokens, avoiding a lossy read/increment operation; a request using an old token can fill only that old generation.

KV invalidation is **eventually consistent**, including cached missing tokens, so this is not identical to Next's immediate tag invalidation. Do not add an isolate-local value cache on top if prompt invalidation matters. With a five-minute result TTL, delayed token visibility still permits stale reads; choose explicit freshness expectations. [KV consistency](https://developers.cloudflare.com/kv/concepts/how-kv-works/).

```ts
// Sketch; stableJson canonicalizes object keys; sha256 returns a hex digest.
async function cachedSanity<T>(query: string, params: object, tags: string[]): Promise<T> {
  const versions = await Promise.all(tags.map(async tag =>
    [tag, await env.CMS_CACHE.get(`epoch:${tag}`) ?? 'initial']));
  const key = 'groq:' + await sha256(stableJson({
    project: env.SANITY_PROJECT_ID, dataset: env.SANITY_DATASET,
    apiVersion: env.SANITY_API_VERSION, perspective: 'published', query, params, versions,
  }));
  const hit = await env.CMS_CACHE.get(key);
  if (hit !== null) return JSON.parse(hit) as T;
  const value = await sanityClient.fetch<T>(query, params);
  // Awaiting is simplest; an attached waitUntil is also fine for this short write.
  await env.CMS_CACHE.put(key, JSON.stringify(value), { expirationTtl: 300 })
    .catch(error => console.warn('CMS cache fill failed', error));
  return value;
}

// After signature verification and an allow-list check on body._type:
await env.CMS_CACHE.put(`epoch:${body._type}`, crypto.randomUUID());
```

KV allows only one write per second to the same key. Concurrent cold cache fills should be best-effort (return the fetched CMS result even if the cache write fails, as above). Rapid successive webhook writes to the same tag can also return 429: return a retriable webhook error or coalesce invalidations through a DO, rather than falsely acknowledging a failed invalidation. [KV write limits](https://developers.cloudflare.com/kv/api/write-key-value-pairs/).

Verify the webhook against the **raw body** using a framework-independent Sanity verifier (`@sanity/webhook`), rather than carrying `next-sanity/webhook`'s NextRequest adapter. Keep the existing shared secret and reject invalid signatures. The existing `parseBody()` also defaults to a three-second delay for Content Lake consistency: preserve an equivalent verified-webhook delay or another freshness strategy before rotating the tag token, or the first new-generation fill may cache an old origin result. No `revalidatePath` equivalent is needed if Start SSR reads this cache and HTML is not independently cached/prerendered. [Sanity verification and consistency delay](https://www.sanity.io/docs/nextjs/validating-sanity-webhooks-nextjs).

**Cache API alternative:** `caches.default.match/put` with a synthetic GET key and `Cache-Control: max-age=300` avoids a KV namespace, but content is per data center and `cache.delete()` only purges the current location. A webhook doing only `cache.delete` is not global invalidation. A global purge API/token or a shared generation mechanism adds moving parts. Therefore KV is simpler here. [Cache API scope/purging](https://developers.cloudflare.com/workers/runtime-apis/cache/).

If the requirement is truly immediate global CMS invalidation, use one dedicated `CmsCache` DO with persisted TTL entries and tag generation (invalidate and read through that same object), accepting its network hop. That is the stronger alternative; KV should not be described as providing immediate revalidation.

## 8. Email

Keep the existing **Resend REST fetch**, 10-second timeout, and sanitized plain-text payload. Workers supports this integration directly. The local filesystem outbox must change: use a local binding-backed outbox or an explicit development console sink; do not claim an email was delivered just because it reached an ephemeral virtual file. Prefer a persisted local DO outbox if inspectability is needed. [Resend on Workers](https://developers.cloudflare.com/workers/tutorials/send-emails-with-resend/).

Cloudflare **Email Sending** is a real transactional sending service (currently beta), available on Workers Paid, with native `send_email` bindings and REST/SMTP options; it is not limited to inbound forwarding. It requires sender/domain onboarding and is optional future consolidation, not necessary for this migration. Do not change email DNS as part of the app port. [Email Service](https://developers.cloudflare.com/email-service/), [sending binding](https://developers.cloudflare.com/email-service/api/send-emails/workers-api/).

## 9. Attach only beta.zaunermax.at

Use the single exact-host `routes` entry in the proposed config, with `custom_domain: true` and **no wildcard/path suffix**. When the eventual authorized deployment runs, Wrangler attaches the Worker, creates the hostname's managed DNS record, and Cloudflare issues/manages its certificate. Current docs describe an automatically issued Advanced Certificate without a separate Advanced Certificate Manager subscription. The zone must be active and the hostname cannot have an existing CNAME; supplied context meets those conditions. [Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/).

Concrete eventual sequence, **not executed**:

1. Verify account selection and inspect the exact hostname's DNS state read-only; retain an apex/record snapshot for comparison.
2. Build and inspect generated Worker config: the only domain must be `beta.zaunermax.at`, Worker name `zaunermax-portfolio-beta`, account as above, and required bindings/secrets present.
3. Run the authorized Wrangler deployment (first-deploy secret handling below).
4. Wait for hostname certificate activation, verify HTTPS/SSR/API/static files, then compare DNS state. No manual placeholder `A`/CNAME record is necessary for a Custom Domain.

Exact-host domain matching means this attaches only `beta.zaunermax.at`; it does **not** replace the apex's Vercel record or other hostnames. This is the documented routing consequence, not a claim that a deployment was performed or its resulting DNS diff checked. Do not add `zaunermax.at`, `*.zaunermax.at`, an apex route, or a preview wildcard.

The equivalent API is `PUT /accounts/{account_id}/workers/domains` with `hostname`, `service`, and zone identification. `cf cli search` did not return a reliable Worker-domain command in beta.21 during this research; do not guess a command or claim it is unsupported. The config + Wrangler route above is sufficient and keeps the domain under the deployment source of truth. [Attach domain API](https://developers.cloudflare.com/api/resources/workers/subresources/domains/methods/update/).

Set `workers_dev` and `preview_urls` explicitly. The sketch disables both because beta has its own hostname; temporarily enabling `workers_dev: true` can provide a deployment URL. Version/preview URLs are separate controls and are not access control. Preview deployments require a deliberate binding/data-isolation policy so previews do not trigger the same paid forge or overwrite its world. [Preview URL configuration](https://developers.cloudflare.com/workers/previews/custom-domains/#enable-workersdev-preview-urls).

## 10. Secrets and runtime env

Use encrypted secrets for `OPENAI_API_KEY`, `RESEND_API_KEY`, `SANITY_REVALIDATE_SECRET`, plus any Sanity read token if one is actually needed. Models, public Sanity identifiers, sender/recipient configuration, cooldown, and site URL are ordinary `vars`. Never use `VITE_*` for a secret. The old `NEXT_PUBLIC_*` naming is a Next convention, not a Workers runtime delivery mechanism.

Eventual commands, **not executed**:

```sh
export CLOUDFLARE_ACCOUNT_ID=6894de59445d940fd8982eb1159d2836
pnpm exec wrangler whoami
pnpm exec wrangler secret put OPENAI_API_KEY
pnpm exec wrangler secret put RESEND_API_KEY
pnpm exec wrangler secret put SANITY_REVALIDATE_SECRET
# First deploy can upload all required secrets alongside code from a private file:
pnpm build
pnpm exec wrangler deploy --secrets-file /private/path/worker-secrets.env
```

The secret-put commands prompt securely; do not place values on a command line. `secret bulk <file>` is another option. `secret put/bulk` creates/deploys a new Worker version, so it is a real mutation, not setup to execute during research. `--secrets-file` on deployment solves required-secret bootstrapping when no existing deployed secrets exist. [Wrangler deploy/secrets commands](https://developers.cloudflare.com/workers/wrangler/commands/workers/).

`secrets.required` validates deployment and drives type generation. It also filters local dotenv keys; include *all* runtime secrets you intend to load. Add `QUEST_WORLD_MODEL`/`QUEST_CHAT_MODEL` to `vars` or explicit development config if overriding the current defaults. A dev outbox mode can deliberately leave the email secret absent, but local tooling will warn if it remains required. [Required secrets behavior](https://developers.cloudflare.com/changelog/post/2026-03-24-secrets-config-property/).

Prefer **`import { env } from 'cloudflare:workers'`** in server-only modules; it exposes resources and secrets. Within a DO use `this.env`. With the proposed date, **`process.env` also contains text/JSON environment bindings and secrets**: population is default from 2025-04-01 with Node compatibility. It does not expose DO/KV objects. Thus existing `process.env.OPENAI_API_KEY` need not be rewritten merely to work, but explicit binding access is clearer. Do not copy/replace the whole `process.env` object. `NODE_ENV` is statically replaced by tooling; use a separate explicit application setting for an outbox mode. [Process/env behavior](https://developers.cloudflare.com/workers/runtime-apis/nodejs/process/).

Node compatibility itself became default for dates from **2026-08-04**. Retaining `compatibility_flags: ['nodejs_compat']` is valid and agrees with the TanStack guide, but is redundant at this date. [Compatibility flags](https://developers.cloudflare.com/workers/configuration/compatibility-flags/#nodejs-compatibility).

For cf-native projects, docs currently recommend `cf deploy --secrets-file <file>` or `npx wrangler secret put <KEY> --name <WORKER>` for a single secret; `cf` cannot stream tail logs or replace that interactive single-secret flow yet. CLI discovery also exposed the separate low-level `cf workers secrets bulk` API; its schema patches a named script's secret map. Neither is a reason to mix `cf deploy` into the Wrangler project. [cf reference](https://developers.cloudflare.com/cf/wrangler/reference/).

## 11. Observability

Enable `observability.enabled: true` for persisted invocation/console/error logs. Traces currently require their own `observability.traces.enabled: true`; the sample enables both. For initial beta traffic, 100% sampling is reasonable; adjust after observing volume. Log job ID, state transition, model, latency, usage, and failure category; avoid logging contact payloads, raw chat history, API keys, and every token. [Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/), [Traces](https://developers.cloudflare.com/workers/observability/traces/).

Use `pnpm exec wrangler tail zaunermax-portfolio-beta` when authorized to connect live logging. Local `console` output is available during Vite dev. Attaching a tail may cause a DO code/runtime update according to known-issues documentation; do not assume it is invisible to an active job. The watcher/stream should be closed when finished. [DO operational caveats](https://developers.cloudflare.com/durable-objects/platform/known-issues/).

## 12. Paid-plan choices and validation still needed

- Keep `limits.cpu_ms: 30000` initially. Raising to e.g. 60,000 or the allowed 300,000 is available if measured computation needs it; it does **not** buy longer network wait/streaming wall time. Validate server-side world compilation and SSR CPU on real payloads. Paid includes CPU and request allowances, with overages; it is not unlimited free execution. [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/).
- Paid removes the Free daily request cap and supports the larger subrequest allowance. Static assets avoid invoking the Worker when served directly. Do not globally set `run_worker_first: true` without a functional need.
- DO active duration is billed while a forge or ordinary HTTP follower stream keeps it in memory. This workload is infrequent and brief; WebSocket hibernation would add complexity with little immediate benefit. [DO pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/).
- A Paid DO has 10 GB per SQLite object and point-in-time recovery support; use a real backup/export procedure for important history. Do not rename the binding/class/object name casually, since these determine storage identity.
- No resources were provisioned to establish entitlements, quotas, TLS readiness, SDK correctness, or beta CLI interoperability. These remain implementation/deployment checks, not verified outcomes.

Focused acceptance checks for the implementer:

1. Two concurrent starts produce one OpenAI run; other clients get 409 or follow the same job across different Worker instances.
2. Disconnect every client; after >90 seconds reconnect and observe persisted completion or explicit failure, not a silently abandoned lock.
3. Replay/follow has no event gap, and slow/canceled readers do not stall generation. The old world stays current until final validation/moderation passes.
4. An expired/stale lease cannot publish a world or clear a newer run. A restart/HMR/deploy produces a recoverable persisted job and eventual watchdog failure rather than duplicate paid generation.
5. Local `pnpm dev` uses persisted local DO/KV bindings and survives restart; no `.data` dependency remains. Verify a 180-second local stream and the same deployed stream when authorized.
6. Daily and hourly budgets stay correct under concurrency; test reset boundaries and Retry-After. Verify CMS webhook signature handling and document KV invalidation delay.
7. Inspect deploy output and DNS diff: only the beta hostname attaches; apex remains on Vercel. Test SSR deep links, API JSON/NDJSON, assets, secrets, and logs.

These are future validation criteria. This research did not make paid OpenAI requests, start a dev server, write secrets, or deploy anything.
