# Welcome to my portfolio repository 👋

[![wakatime](https://wakatime.com/badge/user/0723bbca-bed4-44e0-90be-413a9eff4dfb/project/65246076-b67c-47e7-ac2e-8600ea23a1e7.svg?style=for-the-badge)](https://wakatime.com/badge/user/0723bbca-bed4-44e0-90be-413a9eff4dfb/project/65246076-b67c-47e7-ac2e-8600ea23a1e7)

Welcome to my portfolio repository. I created this project to further strengthen my
knowledge in React's upcoming RSC pattern and to work more with the technology. Working
with the automatic caching and revalidation function of Next.js was a priority for me as I
wanted to test out how the technology behaves when having to calculate content which takes
at least a few seconds.

I also opted to use a CMS called [Sanity](https://www.sanity.io/). I wanted to see how the
caching and revalidation can be combined with third party CMS.

This neat idea formed in my head, where I would feed some of my personal information to a
LLM and then not only make it answer questions about me but also come up with questions
about me. So that's what I implemented: A portfolio where you can ask anything about me,
and a LLM will answer your questions (granted, I provided the desired information ofc.)

The time I've spent on the visuals of the terminal is too much though 🙈. Nevertheless, I
hope you enjoy visiting my site!

## Technology

Technologies used in this project:

- [Next.js](https://nextjs.org/)
- [React](https://react.dev/)
- [Sanity CMS](https://www.sanity.io/)
- [OpenAI](https://www.npmjs.com/package/openai)
- [Some cool typewriter lib](https://www.npmjs.com/package/react-type-animation)
- [Tailwind CSS](https://tailwindcss.com/)
- [shadcn/ui](https://ui.shadcn.com)

## Local development

Use Node 24 LTS (see `.node-version`) and the pinned pnpm version in `package.json`. The
dependencies require at least Node 22.12.

```sh
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env # Skip this if your existing .env is configured.
pnpm dev
```

Sanity supplies the introduction, wiki, talks, and context used to answer questions.
`/studio` embeds the Sanity Studio; its existing project login and permissions apply. The
public site reads published documents only. Keep the Sanity API date pinned unless
intentionally changing query semantics.

## Architecture after the upgrade

- Next.js 16 App Router, React 19, stable React Compiler, and Turbopack.
- Cache Components cache CMS reads by document type. The signed Sanity webhook at
  `/api/revalidate` expires matching tags immediately. Introduction sequences are cached
  for five hours; generated question suggestions are cached by mode for five minutes. The
  explicit “reload them” action requests fresh suggestions through POST.
- AI SDK 7 uses the OpenAI Responses API for streaming and schema-validated suggestions.
  `OPENAI_MODEL` remains configurable; this upgrade preserves the configured model rather
  than changing answer quality or cost implicitly. The OpenAI SDK handles moderation.
- Each question sends CMS context and that question only. Previous answers remain in an
  in-memory React context across site navigation, and disappear on a full reload. They are
  never sent as conversation history. Responses use `store: false`.
- The terminal uses `useCompletion` with a plain-text stream, cancellation, and explicit
  browser autocomplete suppression. Provider failures are surfaced as stream errors.
- Homepage sentences are fetched in a Server Component and passed into the animation.
  React Query and Jotai are no longer needed.
- Tailwind 4 uses CSS theme definitions in `src/app/globals.css`, preserving the original
  palette, borders, panel geometry, responsive container, and class-based dark mode. Some
  classes that did nothing in v3 become valid in v4: do not reintroduce `mt-15` or `w-100`
  on the file panels.

TypeScript 6.0.3 and ESLint 9.39.5 are intentionally the newest versions supported by
Next's current lint dependencies. Other direct runtime dependencies use current stable
releases, pinned with the lockfile. pnpm's release-age window is disabled to allow the
explicitly requested newest releases, including packages published on the upgrade date.
Narrow overrides keep Sanity’s pinned CLI dependencies patched and its external-store shim
compatible with React 19; `pnpm audit` and `pnpm peers check` are clean.

## Verification

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
pnpm format:check
```

API unit tests mock the external services. Browser tests mock inference and suggestion
requests, and cover terminal submission, incremental text, errors, transcript isolation,
focus recovery, and panel geometry at mobile and desktop widths in both themes. They use
real published Sanity content, so configured CMS access is required. `test:e2e` starts a
localhost-only dev server on port 3100 if one is not already running.

A production build does not generate AI suggestions. Opening the homepage or calling
`/api/suggestions` on a real local server can generate them; submitting a question calls
moderation and inference. Those requests use the configured OpenAI account.

Migration references:
[Next.js 16](https://nextjs.org/docs/app/guides/upgrading/version-16),
[AI SDK 7](https://ai-sdk.dev/docs/migration-guides/migration-guide-7-0),
[Tailwind 4](https://tailwindcss.com/docs/upgrade-guide), and
[OpenAI Responses](https://developers.openai.com/api/docs/guides/migrate-to-responses).
