# AGENTS.md

This file gives coding agents an accurate working map for this repository.
It complements [CLAUDE.md](CLAUDE.md): CLAUDE.md is the architecture map, this is the ground rules.

## What This Repo Is

`sceneself` is an **AI scene photo album generator** — one selfie + one sentence ("travel-day on a yacht in Capri", "samurai in autumn") produces a cohesive 6-photo set in 4:5 portrait, magazine-style.

It is built on top of a production-oriented Next.js SaaS template, so the foundation is already in place:

- Better Auth email/password + optional Google OAuth
- Credit-based billing with three Creem subscription tiers (one-time packs **retired**)
- A **redemption code system** (admin batches + partner API + user redeem)
- Admin screens for users, subscriptions, credits, redemption batches, partner API keys
- Marketing site, blog, integrated Fumadocs docs site, legal pages
- `next-intl` localization for English and Chinese
- Resend email + R2 storage + Creem webhooks + cron jobs

The **product is the Scene generation pipeline** in `lib/scene/` and `/create`, driven by OpenRouter (Gemini Nano Banana 2 + Gemini Flash Lite).

> The legacy SaaS-template `/demo` pages (chat / image / video) and the Volcano Engine integration **have been removed**. Do not reintroduce them.

Optimize changes for two goals at the same time:

1. **Protect the Scene pipeline.** It is the product.
2. **Keep auth, credits, billing, subscriptions, and redemption codes internally consistent.** These are the consistency-sensitive systems.

## Ground Rules

- **Verify facts at answer-time, not from memory.** When the user asks about anything external (third-party platform pricing/limits/policies — Vercel, Cloudflare, Resend, Creem, OpenRouter, Neon, GitHub, etc. — or framework/library version-specific behavior — Next.js, Drizzle, Better Auth, etc., or model IDs/context windows/pricing), use WebSearch/WebFetch to look up current docs and cite the URL. Don't answer from training-time recall. Local code facts (this repo) get verified with Read/Grep/Bash, same principle.
- Use `pnpm`. `package.json` declares `pnpm@10` as the package manager.
- Prefer accurate docs over aspirational docs. If the code and docs disagree, fix one of them.
- Do not reintroduce remote demo asset dependencies that the app serves locally (`public/starter` / `.asset-sources/starter-demo`).
- Do not reintroduce the legacy `/demo` chat/image/video pages or the Volcano Engine integration — they were intentionally removed.
- Treat billing, credits, subscriptions, auth, and redemption codes as consistency-sensitive systems. Avoid "UI-only" updates that leave DB state drifting.
- The Scene pipeline can run with `SCENE_DEV_FALLBACK=true` (placeholder images, no API key). Don't ship this to prod.

## Stack Snapshot

- Framework: Next.js 16.2.2 App Router
- React: 19
- Language: TypeScript with strict mode
- Styling: Tailwind CSS v3 + Framer Motion
- Auth: Better Auth 1.5 + Drizzle adapter
- Database: PostgreSQL + Drizzle ORM 0.44
- Payments: Creem
- **AI provider**: OpenRouter only — Gemini 3.1 Flash Image Preview (Nano Banana 2) for images, Gemini 3.1 Flash Lite Preview for text + vision
- Email: Resend
- Storage: Cloudflare R2 (S3 compatible)
- Testing: Vitest 4 + Testing Library + jsdom
- Docs: Fumadocs

## High-Level Repo Map

### App routes

- `app/[locale]/(marketing)`:
  landing, pricing, contact, blog, privacy, terms, cookies, refund
- `app/[locale]/(auth)`:
  login, signup, forgot password, reset password
- `app/[locale]/(protected)`:
  dashboard, profile, settings, credits
- `app/[locale]/(admin)`:
  admin pages — `users`, `credits`, `subscriptions`, `codes` (+ `[batchId]`), `api-keys`
- `app/[locale]/create`:
  **★ the Scene generation product UI**
- `app/[locale]/docs`:
  the Fumadocs docs site
- `app/[locale]/check-email`, `verify-email`:
  email verification flow

### API routes

- `app/api/auth/*`:
  Better Auth catch-all + `forgot-password`, `reset-password`, `verify-email`, `verify-reset-token`, `resend-verification`
- **`app/api/scene/*` (★ Scene pipeline)**:
  `plan` (ScenePlan generation), `clarify` (intent-rewriter + moderation + clarifying questions), `upload` (selfie upload), `jobs` / `jobs/[id]` (generation job CRUD + polling)
- `app/api/payments/creem/*`:
  `checkout`, `webhook`, `redirect-placeholder`
- **`app/api/redeem`**: user-facing redemption code claim
- **`app/api/partner/codes`**: partner self-serve code batch generation (Bearer API key)
- `app/api/admin/*`:
  user credits, user subscription, code batches, partner API keys
- `app/api/user/*`:
  `profile`, `credits/history`, `admin-status`
- `app/api/upload/{image,simple}`:
  R2 image upload + demo upload
- `app/api/newsletter/{subscribe,unsubscribe}`
- `app/api/contact`
- `app/api/cron/{subscription-grants,cleanup-selfies}`

### Core library modules

- `lib/auth.ts`: Better Auth config + 300-credit signup bonus hook
- `lib/auth/session.ts`: session/user resolution from headers
- `lib/auth/admin.ts`: admin authorization helpers
- `lib/auth/google-auth.ts`: optional Google OAuth provider toggle
- `lib/db/schema.ts`: source of truth for tables
- `lib/credits.ts`: credit reads, deductions, refunds
- `lib/credit-compensation.ts`: refund-on-failure helper for paid AI actions
- `lib/payments/creem.ts`: checkout + webhook helpers + signature verification
- `lib/billing/subscription.ts`: cycle grant logic
- `lib/billing/subscription-status.ts`: subscription state enums
- `lib/redemption/*`: redemption codes + partner API keys
- `lib/r2-storage.ts`: storage mirroring with graceful fallbacks
- **`lib/scene/*` (★ Scene engine)**: see dedicated section below
- `lib/openrouter/*`: AI provider wrapper (chat, image, config, types)
- `lib/email.ts`: Resend templates + resilient send
- `lib/image/heic.ts`: HEIC → JPEG (iOS selfies)
- `lib/landing/showcase-sets.ts`: homepage showcase data
- `lib/docs-*.ts`: Fumadocs metadata + page tree
- `lib/blog-manifest.generated.ts`: **generated, do not edit by hand**

### Scene engine (`lib/scene/`)

This is the product. Treat it carefully.

- `types.ts`: domain types — `JobStatus`, `FrameStatus`, `ScenePlan`, `ShotSpec`, `SceneContinuity`, `AnchorObject`, storyline types, etc.
- `orchestrator.ts`: **three-gate state machine** (likeness + realism + set coherence), candidate retries, dropped-frame rescue, salvage, optional reference chaining, face-swap fallback
- `scene-plan.ts`: plan validation, occlusion detection, prompt assembly
- `prompts.ts`: every LLM prompt template
- `pricing.ts`: `SHOTS_PER_SET = 6`, `CREDITS_PER_PHOTO = 50`, undelivered-frame refund formula
- `repository.ts`: DAL for `generation_job` / `generation_frame`
- `config.ts`: all knobs (model IDs, thresholds, provider switches) — every value env-overridable
- `services/scene-planner.ts`: ScenePlan generation (LLM)
- `services/story-line.ts`: storyline generation
- `services/intent-rewriter.ts`: safe-rewrite ("proof_to_editorial", etc.)
- `services/prompt-moderation.ts`: content moderation (`local` | `llm` | `creem`)
- `services/translation.ts`: zh prompt → en prompt for image gen
- `services/image-gen.ts`: OpenRouter image generation
- `services/image-inline.ts`: URL ↔ base64
- `services/face-check.ts`: face detection + quality
- `services/identity-check.ts`: selfie vs generated identity (`vlm` | `volcano_face`)
- `services/quality-check.ts`: per-frame quality (likeness + realism)
- `services/set-coherence-check.ts`: outfit / style / coherence_type / dup-composition checks
- `services/face-swap.ts`: face-swap fallback **stub** (currently returns null —接通后能再救一批 dropped 帧)

### Config and content

- `constants/billing.ts`: plan keys (`weekly` / `monthly` / `yearly`), prices, Creem product IDs, grant schedule. `PackKey = never` — **one-time packs are retired**.
- `constants/website.ts`: shared app/docs name and public URL config
- `constants/scene-storylines.ts`: storyline presets (tone options, etc.)
- `messages/en.json`, `messages/zh.json`: user-facing translations
- `messages/seo.en.json`, `messages/seo.zh.json`: SEO translations
- `app/[locale]/(marketing)/blog/*/*.mdx`: blog content
- `content/docs/**/*.mdx`: source content for the built-in Fumadocs docs site
- `lib/blog-manifest.generated.ts`: **generated, do not edit**
- `public/fumadocs-style.css`: **generated stylesheet synced from `fumadocs-ui`, do not edit**
- `public/starter`: committed local demo assets used by marketing and demo pages
- `.asset-sources/starter-demo`: source stills used to generate the local demo videos

## Daily Commands

```bash
pnpm dev               # scripts/run-dev.mjs (syncs fumadocs CSS, picks bundler)
pnpm dev:webpack       # safe fallback when Turbopack is heavy
pnpm dev:turbopack     # force Turbopack
pnpm lint              # eslint .
pnpm test              # vitest run
pnpm test:watch        # vitest watch mode
pnpm test:coverage     # coverage report
pnpm build             # check-forbidden-words → generate:blog-manifest → next build
pnpm db:generate
pnpm db:migrate
pnpm db:push
pnpm db:studio
pnpm admin:setup       # tsx scripts/setup-admin.ts
pnpm test-user:setup   # tsx scripts/setup-test-user.ts
pnpm generate:blog-manifest    # runs in build, also call manually after blog edits
pnpm sync:fumadocs-style       # runs in predev/prebuild
pnpm check:forbidden           # runs in build, can be run standalone
```

Notes:

- `pnpm dev` runs `scripts/run-dev.mjs`, which launches Next dev with a cleaned environment and syncs the Fumadocs stylesheet first. It does not regenerate the blog manifest.
- `pnpm build` runs `check-forbidden-words` → `generate:blog-manifest` → `next build`. A forbidden-word hit **fails the build**.
- If you add, rename, or remove blog posts, regenerate the blog manifest before committing.

## Environment Variables

Use `.env.example` as the source of truth for required names.

The important groups:

- Database: `DATABASE_URL`
- Auth: `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`
- Optional Google auth: `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`
- **Scene pipeline (OpenRouter)**: `OPENROUTER_API_KEY`, `OPENROUTER_API_URL`, `OPENROUTER_IMAGE_MODEL`, `OPENROUTER_TEXT_MODEL`, `OPENROUTER_VISION_MODEL`, `OPENROUTER_IMAGE_SIZE`
- **Scene tuning**: `QUALITY_MIN`, `SET_QUALITY_MIN`, `IDENTITY_THRESHOLD`, `SALVAGE_QUALITY_MIN`, `SCENE_MAX_CANDIDATES`, `SCENE_RESCUE_ATTEMPTS`, `SCENE_REFERENCE_CHAINING`, `SCENE_IDENTITY_OVERRIDE_QUALITY`, `SCENE_IDENTITY_STRICT`, `SCENE_IMAGE_SIZE`, `SCENE_DEV_FALLBACK`, `SELFIE_RETENTION_HOURS`
- **Scene providers**: `PROMPT_MODERATION_PROVIDER` (`local` | `llm` | `creem`)
- Payments: `CREEM_API_KEY`, `CREEM_WEBHOOK_SECRET`, `CREEM_API_BASE`, `CREEM_CHECKOUT_PATH`, `CREEM_SIMULATE`, `CREEM_WEEKLY_PRICE_ID`, `CREEM_MONTHLY_PRICE_ID`, `CREEM_YEARLY_PRICE_ID`
- Email: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_AUDIENCE_ID`
- App URL: `NEXT_PUBLIC_APP_URL`
- Cron auth: `CRON_SECRET` or `CRON_JOBS_USERNAME` + `CRON_JOBS_PASSWORD`
- Storage: `STORAGE_*`
- Analytics: `NEXT_PUBLIC_POSTHOG_*`, `NEXT_PUBLIC_GOOGLE_ANALYTICS_ID`, `NEXT_PUBLIC_CLARITY_PROJECT_ID`
- Feature flags: `NEXT_PUBLIC_ENABLE_CHAT`, `NEXT_PUBLIC_MAINTENANCE_MODE`

## Core Product Invariants

### 1. Auth and signup

- Better Auth is configured in [`lib/auth.ts`](lib/auth.ts).
- New signups receive a **300 credit registration bonus** in the auth hook.
- If you change signup behavior, preserve the registration bonus flow unless the product decision explicitly changes it.
- `requireEmailVerification: false` — users can sign in immediately. Email verification is enforced **at save/export of a Scene set**, not at login.
- Google OAuth is optional. It is enabled only when both `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` are present.
- Login / signup forms must stay in sync: if Google is disabled server-side, the Google button should not render.

### 2. Credits and ledger integrity

- `user.credits` is the fast balance.
- `credit_ledger` is the audit trail.
- Any credit mutation should update both, ideally in one transaction.
- **Scene generation**: pre-charges `creditsForSet(shotCount)` (default `6 × 50 = 300`); on completion refunds `refundForUndelivered(delivered, shotCount)` for any frame not delivered. See [`lib/scene/pricing.ts`](lib/scene/pricing.ts). Don't bypass either side of that pair.
- **Failure compensation pattern**: [`lib/credit-compensation.ts`](lib/credit-compensation.ts) was originally used by demo routes to refund credits on provider failure. If you add a new paid AI route, sit it on the same pattern — pre-deduct → register a compensation handle → release on success / refund on failure.

### 3. Billing and subscriptions

- Plan keys come from [`constants/billing.ts`](constants/billing.ts). The active set is `weekly` / `monthly` / `yearly`. **Never invent new plan keys.**
- `PackKey = never`, `oneTimePacks = {}` — **one-time packs are retired**. Do not add new ones without product approval; the type system will fight you.
- All three plans are `grantSchedule.mode: "per_cycle"`. The `installments` mode in the type union is reserved for future use; don't assume it's wired up.
- Creem webhook processing lives in [`app/api/payments/creem/webhook/route.ts`](app/api/payments/creem/webhook/route.ts). Preserve:
  - HMAC signature verification
  - Idempotency via `providerPaymentId` unique constraint
  - Updates to: `user.planKey`, `payment`, `subscription`, `credit_ledger`, `subscription_credit_schedule`
- The admin subscription mutation endpoint is intentionally simple right now and only updates `user.planKey`. Do not assume that is sufficient for a real subscription migration.

### 4. Scene generation (★)

- Entry: `/create` page → `/api/scene/clarify` → `/api/scene/plan` → `/api/scene/upload` → `/api/scene/jobs` → poll `/api/scene/jobs/[id]`
- Persistence: `generation_job` + `generation_frame` (jsonb columns `scene_plan`, `shot_spec`, `identity_ref`)
- Anonymous users can start a job (`userId` is nullable); they're prompted to sign up before seeing results.
- **Three-gate model**: likeness (`QualityCheck`) → realism (no deformity/plastic-skin, quality ≥ threshold) → identity (same person, with quality-override for vision-LLM misjudgment) → set coherence (outfit/style/coherence_type).
- **Don't skip salvage / rescue / face-swap stub call** — they're the three layers that protect the 6/6 delivery contract for paid users. The face-swap path currently no-ops (returns null), but the call site must remain so future face-swap integration plugs in without rewiring the orchestrator.
- **Reference chaining** (`SCENE_REFERENCE_CHAINING=true`, default on): first frame runs serially as a visual anchor; subsequent frames run in parallel with it as a reference. This is the main mechanism for outfit/anchor color consistency. Turning it off is a deliberate speed trade.
- **Anchor objects** (helicopter, Ferrari, etc.): when the prompt mentions a specific owned object, `ScenePlan.continuity.anchor_object` must be filled with verbatim name + specific appearance (color, model, tail number). Without it, every frame imagines its own version and the set is visibly inconsistent.
- **Selfie privacy**: `selfie_url` + `identity_ref` are short-lived. The `/api/cron/cleanup-selfies` job deletes them after `SELFIE_RETENTION_HOURS` (default 24). Do not extend retention without a privacy review.
- **Watermark**: subscribers get unwatermarked output; free (registration-bonus-only) users get watermarked. See [`lib/scene/pricing.ts`](lib/scene/pricing.ts) `watermarkFor`.

### 5. Storage mirroring

- Scene-generated images are mirrored to R2 via [`lib/r2-storage.ts`](lib/r2-storage.ts).
- If R2 is not configured, the code falls back to the provider URL rather than hard-failing — preserve that fallback.

### 6. Redemption codes (★)

- `redemption_code` codes are 12 characters, uppercase, alphabet excludes `0/O/1/I/L`. DB stores uppercase; the `/api/redeem` endpoint should accept any case and normalize. One code = one use.
- Per-batch tracking via `batchId`. Channel and createdBy are bookkeeping.
- `expiresAt` field exists but is not currently enforced. Don't add expiry logic without a UX spec — the column should remain inert until then.
- "New users only" restriction is not implemented.
- `partner_api_key`:
  - **DB stores `sha256(plaintext)` only.** Plaintext is returned exactly once at creation. If you regenerate, the old key is dead.
  - `keyPrefix` (first 8 chars) is for human identification, not auth.
  - Each key has a `dailyLimit`. `codesToday` resets daily based on `todayResetsAt`.
  - Deactivation is soft (`deactivated: true`), never hard delete — preserves audit trail.

### 7. Upload and storage behavior

- User uploads enter through `app/api/upload/image/route.ts`.
- Scene self-uploads enter through `app/api/scene/upload/route.ts`.
- Provider-generated media mirroring uses [`lib/r2-storage.ts`](lib/r2-storage.ts).
- If storage is not configured:
  - upload route may return a `data:` URL for testing
  - provider result mirroring may return the original provider URL
- Be careful when changing this behavior — demos and tests rely on graceful fallbacks. Don't add a hard "fail if storage missing" guard.

### 8. i18n

- Locales are defined in [`i18n.config.ts`](i18n.config.ts).
- Locale routing is handled by [`proxy.ts`](proxy.ts).
- Translation loading is in [`lib/i18n.ts`](lib/i18n.ts).
- The app URL strategy is `as-needed`, so default-locale routes use `/docs`, `/pricing`, etc. rather than `/en/...`.
- **When changing user-facing copy, update both English and Chinese** unless the task explicitly says otherwise.
- If you change SEO copy, update `messages/seo.en.json` and `messages/seo.zh.json` too.

### 9. Docs site

- The product ships an integrated docs site at `/docs` and `/zh/docs`.
- Docs content lives in `content/docs/**/*.mdx`.
- Docs routing and rendering live in `app/[locale]/docs/*`.
- [`lib/source.ts`](lib/source.ts) reads from generated `.source/*` output created by `fumadocs-mdx`.
- `public/fumadocs-style.css` is generated. Do not hand-edit it; update the sync script or upstream dependency instead.

## Current Known Gotchas

- Some API routes still emit dynamic server usage warnings during `pnpm build`, especially:
  - `/api/auth/verify-email`
  - `/api/auth/verify-reset-token`
  - `/api/newsletter/unsubscribe`
  - `/api/user/admin-status`
  - `/api/user/credits/history`
- If you touch routes that read `request.url`, `headers`, cookies, or auth state, consider explicitly marking them dynamic.
- `app/api/upload/simple/route.ts` is demo-oriented and **not** the main production upload path.
- Demo assets are intentionally localized into `public/starter`. Do not switch them back to remote runtime URLs.
- Fumadocs ships Tailwind v4-oriented CSS, so the repo deliberately syncs that stylesheet into `public/` and loads it via `<link>` to avoid Tailwind v3/PostCSS conflicts.
- Turbopack can still feel heavy on some macOS setups. Prefer `pnpm dev:webpack` if local dev becomes sluggish.
- `PROMPT_MODERATION_PROVIDER`: the code default is `llm` (OpenRouter Gemini semantic moderation — recommended). `local` is English-only regex keywords and misses Chinese, variants, and synonyms — **don't ship with `local`**, Creem merchant review will reject "no content filter mechanism". `creem` is a placeholder for Creem's own moderation API which hasn't been released — picking it currently fail-closes every prompt.
- `SCENE_DEV_FALLBACK=true` returns placeholder images when there's no OpenRouter key. Disable in production.
- **Vision-LLM identity false negatives are real.** `SCENE_IDENTITY_OVERRIDE_QUALITY` (default 4) lets a frame pass when quality is high but `same_person=false` (likely misjudgment). Turning `SCENE_IDENTITY_STRICT=true` removes that override and will measurably increase dropped frames.
- The 6/6 delivery contract for paid users depends on **salvage + rescue** + (once integrated) **face-swap fallback**. Don't quietly disable any layer. The face-swap stub returning null is the current intentional state — the orchestrator still calls it so future integration is drop-in.

## Testing Expectations

Run the smallest useful set, but do verify your changes:

- `pnpm lint`:
  run for any UI, route, config, or translation change
- `pnpm test`:
  run for logic changes in billing, auth, credits, email, sessions, Scene engine, redemption, or utilities
- `pnpm build`:
  run when touching routing, middleware, auth, next config, env-sensitive code, or server routes (catches forbidden-word hits and the dynamic-usage warnings)

Current test coverage is concentrated in:

- `tests/components/*`
- `tests/constants/*`
- `tests/lib/*` (including `tests/lib/scene/*` for the Scene engine)

If you change billing, email, auth, credits, redemption, or Scene logic, add or update tests in `tests/lib`.

## Contributor Advice By Area

### Marketing and docs

- Keep README, CLAUDE.md, AGENTS.md, and .env.example aligned with the actual code.
- Use real repo paths in docs. Do not reference missing files or imaginary folders.
- If you update product positioning, double-check marketing copy in both locales **and** SEO files.

### Admin features

- Treat admin mutations as high-risk.
- Changing a user balance is not the same as changing the ledger.
- Changing a plan label is not the same as changing a subscription state.
- The bulk code-batch endpoints can issue large credit liabilities — don't silently uncap dailyLimit or remove sha256-only storage for partner keys.

### Billing

- Never invent plan keys.
- Never grant credits outside the ledger path unless you are intentionally repairing historical data.
- Preserve webhook idempotency.
- If a new plan tier is added, update: `constants/billing.ts`, all `messages/*.json` pricing copy, Creem dashboard, and corresponding `CREEM_*_PRICE_ID` env var.

### Scene engine

- Read [`lib/scene/config.ts`](lib/scene/config.ts) before changing any threshold — the inline comments explain the trade-offs.
- Don't add new providers to `imageModel` / `textModel` / `visionModel` without updating all three together. They are wired together for a reason.
- Don't bypass `IntentRewriter` to "speed up" the flow — it's a content-safety layer, not a UX detail.
- If you add a new failure mode, extend `FailReason` in [`lib/scene/types.ts`](lib/scene/types.ts) rather than shoehorning a string.
- When changing `ScenePlan` shape, remember the `jsonb` columns store live data — migrations should consider in-flight jobs.

### Redemption codes

- Don't change the alphabet without backfilling `redemption_code` rows. Mixed-charset codes will fail validation.
- Don't shorten the 12-char length without recomputing collision risk for current batch sizes.
- Don't ever return partner API key plaintext after creation. The sha256-only invariant is the auth model.

### Generated content and assets

- Blog MDX is source content.
- `lib/blog-manifest.generated.ts` is derived output.
- `public/starter` contains committed local demo assets.
- `public/fumadocs-style.css` is generated from `fumadocs-ui` — modify the sync script, not the file.
- `.asset-sources/starter-demo` contains source stills for the committed local demo videos.

## Preferred Change Style

- Make the smallest change that preserves product truth.
- Favor explicit invariants over convenience.
- If a route has environment-dependent fallbacks, document that behavior in code comments when you change it.
- If you discover a mismatch between UI copy, README, and code, fix the mismatch rather than leaving "TODO" drift behind.
- For Scene engine work, prefer a new env-overridable knob in [`lib/scene/config.ts`](lib/scene/config.ts) over hardcoding a magic number.

## Before You Finish

Before wrapping a task, check:

1. Did you keep credits, billing, subscription state, and redemption ledgers internally consistent?
2. Did you update both locales (and SEO files) if user-facing copy changed?
3. Did you avoid reintroducing external runtime demo assets?
4. Did you run the right validation commands for the area you touched (`pnpm lint` / `pnpm test` / `pnpm build`)?
5. Did you leave generated files and docs in sync with the codebase?
6. Did you preserve the three-gate + salvage + rescue contract in the Scene engine, if you touched it?
7. Did you respect the "OpenRouter only" boundary and not bring back legacy `/demo` or Volcano integrations?
