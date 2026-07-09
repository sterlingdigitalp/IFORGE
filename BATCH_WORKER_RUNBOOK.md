# ChatGPT Batch Worker Runbook

## Purpose

Validate the existing unattended ChatGPT worker against the production loop before adding any new automation.

The production loop remains:

```text
IMPORT -> GENERATE -> COMPARE -> APPROVE
```

The batch worker only creates saved candidates. The operator chooses one with `./iforge promote`, then canon still goes through `./iforge approve`.

## Existing Worker

Command:

```bash
npm run worker:chatgpt -- --character newton
```

Worker file:

```text
scripts/chatgpt-batch-worker.mjs
```

Default ChatGPT profile:

```text
.iforge/chatgpt-profile
```

Default data root:

```text
data/characters
```

## Validation Batch

Current staged validation batch:

```text
data/characters/newton/batches/batch-validation-chatgpt/schedule.json
```

Reference uploads:

```text
data/characters/newton/batches/batch-validation-chatgpt/references/reference_01.png
data/characters/newton/batches/batch-validation-chatgpt/references/reference_02.png
```

Expected saved output:

```text
data/characters/newton/batches/batch-validation-chatgpt/generated/round_01.png
data/characters/newton/batches/batch-validation-chatgpt/generated/round_01.prompt.md
data/characters/newton/batches/batch-validation-chatgpt/generated/round_01.json
```

The schedule has one due prompt round. The worker supports up to six rounds from the app scheduler.

## Sign-In Bootstrap

The worker uses an isolated persistent Chrome profile. It does not automatically reuse the user's normal Chrome login.

If the profile is not signed into ChatGPT, open the same profile, sign in, close the browser, then rerun the worker:

```bash
open -na "Google Chrome" --args --user-data-dir="/Users/sterlingdigital/IFORGE/.iforge/chatgpt-profile" "https://chatgpt.com/"
```

Do not use `--dry-run` for production validation.

## Run

After signing in:

```bash
npm run worker:chatgpt -- --character newton
```

Failed rounds are still eligible for rerun when their `plannedAt` time is due, so the current failed validation round can be rerun without editing the schedule.

## Success Checks

The batch worker is valid only when all of these are true:

- `schedule.json` round status becomes `saved`.
- `generated/round_01.png` exists and is a real image.
- `generated/round_01.prompt.md` exists.
- `generated/round_01.json` exists.
- The metadata source is `chatgpt-web`, not `dry-run`.

## Promote To Canon

Only after a real saved image exists, promote the selected batch candidate through Builder A and then approve:

```bash
./iforge import "Isaac Newton Batch Validation" data/characters/newton/batches/batch-validation-chatgpt/references/reference_01.png
./iforge generate isaac_newton_batch_validation
./iforge launch isaac_newton_batch_validation
./iforge promote data/characters/newton/batches/batch-validation-chatgpt/generated/round_01.png isaac_newton_batch_validation
./iforge approve isaac_newton_batch_validation
```

Approval is complete only when both files exist:

```text
characters/isaac_newton_batch_validation/canonical.png
characters/isaac_newton_batch_validation/prompts/winning.json
```

## Boundaries

- No analytics.
- No rankings.
- No model training.
- No database.
- No orchestration framework.
- No new automation until the first real batch succeeds.
