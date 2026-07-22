# HANDOFF — Identity Forge (IFORGE)

Written 2026-07-11 for session resume. Fully self-contained; a fresh session should
start here. Each line tagged VERIFIED (checked against repo/build on 2026-07-11) or
ASSUMED (carried from prior-session context).

## CONTEXT (30 seconds)

- IFORGE produces canonical identity images for 100+ Pixar-style historical figures.
  Each canonical is the image input for image+prompt→image generation in the separate
  Director Desk app (`/Users/sterlingdigital/directordesk`), which builds ~200 images
  per figure for storybook-style educational videos. ASSUMED (owner statement).
- The live interchange spec is `/Users/sterlingdigital/directordesk/CANONICAL_IMAGE_CONTRACT.md`
  (exists, 5,176 bytes). IFORGE's `17_DIRECTOR_DESK_EXPORT_SPEC.md` is bannered as V2/superseded. VERIFIED.
- Working mode last session: `/codex-first` — orchestrator specs and reviews, Codex CLI
  (gpt-5.6-sol per `~/.codex/config.toml`) implements. ASSUMED (workflow preference).
- Real production has not started: `data/characters/` holds curie, einstein, newton,
  tesla as prompt skeletons with placeholder SVGs; einstein's `canonical/canonical.svg`
  is a legacy placeholder approval (cannot recur — gates now block it). VERIFIED.

## 1. DATE & BRANCH

- Date: 2026-07-11. Branch: `main`, tracking `origin/main`
  (github.com/sterlingdigitalp/IFORGE), 0 unpushed commits. VERIFIED.
- `git status -sb` at write time: clean except this HANDOFF.md and CLAUDE.md
  (created by the handoff itself, deliberately left uncommitted for owner review). VERIFIED.

## 2. NOT-YET-DEPLOYED CHANGES

- No deploy pipeline exists; "running" = whatever `next dev` / `./iforge` the operator
  starts, so all pushed commits are live on next launch. VERIFIED.
- All work is committed and pushed. Recent commits (git log): VERIFIED
  - `e7ae962` DD face pre-flight + immutable sha256 canonicals + canonical_image.v1 sidecar
  - `6b44ac7` canonical-image validation enforced at app approve, CLI approve, worker save
  - `7f43a31` doc 17 bannered as V2 target (edit authored by the Director Desk session)
  - `81638ab` batch pipeline buildout (worker, promote/approve loop, API routes)
- Uncommitted: only HANDOFF.md + CLAUDE.md (this handoff). Reason: owner may not want
  handoff files in git history — commit or ignore at will. VERIFIED.
- Operational note: face pre-flight activates only when env `DIRECTORDESK_URL` points at
  a running Director Desk (`lib/characters.ts:220`, `scripts/validate-canonical.mjs:46`);
  unset ⇒ approvals proceed on format checks with a recorded skip. VERIFIED.

## 3. FEATURE / UPDATE BACKLOG (ranked)

1. **Export to Director Desk (item 5 of the contract plan).** POST canonical image (+
   sidecar) to `{DIRECTORDESK_URL}/api/characters` as multipart, `action=ingest_character`,
   per the contract. Completes the produce→deliver round-trip. No `export` command exists
   in `iforge` today. Touches: `/Users/sterlingdigital/IFORGE/iforge`, possibly a small
   app route. VERIFIED (grep: no export in iforge).
2. **Migrate generation off ChatGPT web automation to the OpenAI Images API.** Worker
   drives chatgpt.com via Playwright with a persistent logged-in profile
   (`scripts/chatgpt-batch-worker.mjs:409`) — ToS/account-ban exposure, brittle selectors,
   and silent model drift that threatens cross-cast visual consistency. Touches:
   `scripts/chatgpt-batch-worker.mjs` (replacement), `.iforge/chatgpt-profile` retirement. VERIFIED.
3. **Universe style block with its own version hash.** Extract the shared look from docs
   02/13/14 into one versioned prompt block (`U-<hash>`, same sha256 mechanism as the
   `P-` prompt lineage) and stamp it into approvals, making "same visual world" checkable.
   Nothing implemented. Touches: `lib/characters.ts`, `prompts/`, doc distillation. ASSUMED (agreed design).
4. **Unify the split character stores.** App reads/writes `data/characters/`; the CLI and
   PRODUCTION_BOARD.md use `characters/`; promote writes where the UI never reads; duplicate
   byte-identical promote routes at `app/api/character/[id]/promote` and
   `app/api/characters/[id]/promote`. Pick `data/characters/` as authoritative. VERIFIED (both trees + both routes exist).
5. **Defect sweep (audit findings, all still present).** VERIFIED spot-checks:
   unvalidated `[id]` reaching `fs.rm(recursive)` in `lib/characters.ts` (writeCharacterImage);
   PATCH on unknown id returns 500 (no try/catch in `app/api/characters/[id]/route.ts`);
   unquoted heredocs in `iforge` (e.g. line 207 `EOF_STATE`) — name containing `$(…)`
   executes; non-atomic `character.json` read-modify-write races; no origin/CSRF check on
   mutation routes.
6. **Worker retry cap + failure isolation.** No `maxAttempts` anywhere in the worker;
   failed rounds requeue forever in `--watch`, and one round's failure aborts the rest of
   the run. Touches: `scripts/chatgpt-batch-worker.mjs` (moot if #2 replaces it). VERIFIED.
7. **Banner docs 09 and 12 (and 16) as V2 shelf-ware.** They still read "Status: Foundation
   Specification" and prescribe scoring/refinement regimes the lean workflow explicitly
   abandoned; doc 17 already has the supersession banner as the template. VERIFIED.
8. **Wire the candidate queue.** `TOP Fifty.xlsx` / `TOP Thirty.xlsx` exist at repo root but
   the app's character order is a hardcoded `DEFAULT_QUEUE` in `lib/characters.ts`. VERIFIED files exist.
9. **Flip face pre-flight advisories to blocking** once enough house-style canonicals exist
   to set thresholds (metrics accumulate in each `approval.json` automatically). Empirical
   basis from DD: face-count is reliable (already blocking); det_score is not trustworthy on
   stylized content. ASSUMED (agreed policy).
10. **Clean the production board.** The only "approved" entry (`builder_v_promote_validation`)
    is a pipeline self-test, not a character; remove once a real character approves. VERIFIED (PRODUCTION_BOARD.md).

## 4. OPEN DECISIONS (owner)

1. **Generation backend**: approve migration to the OpenAI Images API (backlog #2)? Prior
   session recommendation: yes. Yes/no. ASSUMED.
2. **Sidecar `license` field text**: every sidecar currently emits
   "TODO: usage rights not yet designated". What usage-rights language? VERIFIED (string in `lib/characters.ts` and `iforge`).
3. **Per-character identity anchors before generating**: contract makes headwear/facial hair
   part of the identity signal — e.g., Newton with or without the wig. Decide per character
   at import time. ASSUMED (contract implication).
4. **Advisory→blocking threshold**: after how many approved canonicals do bbox/yaw/det_score
   warnings become blocking (backlog #9)? ASSUMED.

## 5. RESUME HERE

Open `/Users/sterlingdigital/IFORGE`, run `/codex-first`, and implement backlog #1: freeze a
spec for an `export` command (`./iforge export [slug]` and/or an app action) that POSTs the
approved canonical image + its `.canonical.json` sidecar to
`{DIRECTORDESK_URL}/api/characters` (multipart, `action=ingest_character`) per
`/Users/sterlingdigital/directordesk/CANONICAL_IMAGE_CONTRACT.md`, then verify live against a
running Director Desk. It is decision-free and completes the produce→deliver loop; decisions
in section 4 can be answered in parallel.
