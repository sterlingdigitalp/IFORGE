# Identity Forge Phase 1 Batch Workflow

Builder V owns the loop glue.

The production path is now batch-first:

```text
IMPORT
-> GENERATE PROMPT
-> LAUNCH IMAGE 2
-> WORKER SAVES BATCH
-> PROMOTE SELECTED CANDIDATE
-> COMPARE
-> APPROVE
-> CANONICAL
```

## Production Architecture

```text
Worker
-> Batch Output
-> PROMOTE
-> generated.png
-> COMPARE
-> APPROVE
-> canonical.png
```

Image 2 explores.

The worker collects.

The operator chooses.

PROMOTE is the human decision that elevates one exploration into the active generated candidate.

APPROVE permanently locks that candidate as canonical.

## State Machine

```text
imported
-> prompt_generated
-> launched
-> generated
-> review
-> approved
```

`generated` is the transient state created when PROMOTE installs the chosen batch output as the active candidate.

`review` is where comparison and approval happen.

## Commands

All interaction goes through the switchboard:

```bash
./iforge import "Isaac Newton" /path/to/reference.jpg
./iforge generate
./iforge launch
./iforge promote /path/to/batch/output.png
./iforge approve
./iforge next
```

Manual fallback remains available:

```bash
./iforge ingest /path/to/generated.png
```

Do not manually copy batch files into character folders.

## Command Responsibilities

`./iforge import "Name" reference_image`

Creates the character folder, copies the reference image, sets state to `imported`, and makes the character current.

`./iforge generate`

Creates a numbered prompt version in `prompts/`, refreshes `prompt.md` as the operator copy, then sets state to `prompt_generated`.

`./iforge launch`

Creates `LAUNCH.md`, copies the prompt to clipboard when available, and sets state to `launched`.

`./iforge promote batch_output_path`

Calls Builder A's promote endpoint, promotes the selected batch candidate to the active generated image, preserves prompt lineage and batch metadata, moves through `generated`, and lands in `review`.

Promotion writes the active candidate and lineage files:

```text
generated.png
generated.json
prompts/promoted_<batch>_<round>.md
```

`./iforge ingest image_path`

Manual fallback only. Copies a one-off generated image into the character folder, links it to the active prompt version, creates `COMPARE.md`, moves through `generated`, and lands in `review`.

`./iforge approve`

Saves the reviewed active candidate as `canonical.png`, saves the prompt as the winning prompt, writes `APPROVAL.md`, and sets state to `approved`.

Required approval artifacts:

```text
canonical.png
prompts/winning.json
```

`./iforge next`

Clears the current character and resets the switchboard to import state.

## Prompt Memory Rule

Every approved character carries the exact prompt that generated the promoted candidate.

A canonical character is incomplete unless both files exist:

```text
canonical.png
prompts/winning.json
```

PROMOTE preserves batch prompt hash and metadata.

APPROVE copies that promoted prompt lineage into the canonical record.

## Production Rule

Maximum five iterations.

Approve.

Move forward.

Do not chase perfection.

No analytics.

No rankings.

No model training.
