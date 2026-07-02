# Identity Forge Phase 1 Workflow

Builder V owns the production workflow.

The job is to remove friction between:

Reference Image

↓

Canonical Character

---

## Production Path

Reference

↓

Prompt

↓

Generate

↓

Critique

↓

Iterate

↓

Approve

↓

Next Character

---

## Production Board

Only five states exist:

Research

↓

Ready

↓

Generating

↓

Review

↓

Approved

Nothing else.

---

## Builder Handoffs

Builder A provides the reference handoff:

- reference image
- figure name
- strongest identity notes
- historical caution notes

Builder V turns that handoff into a production folder, validates the reference, generates the prompt, opens the browser, and maintains status.

Builder C reviews generated images:

- identity preserved
- style belongs to Identity Forge
- emotional signature reads clearly
- artifacts removed
- approve or request one focused iteration

Builder V records the result and moves the character forward.

---

## Command Flow

Create the character folder:

```bash
./iforge new "Isaac Newton" /path/to/reference.jpg
```

Validate the reference:

```bash
./iforge validate isaac_newton
```

Generate the prompt:

```bash
./iforge prompt isaac_newton
```

Launch ChatGPT / browser helper:

```bash
./iforge launch isaac_newton
```

Record a generated image:

```bash
./iforge generated isaac_newton /path/to/generated.png
```

Approve the canonical image:

```bash
./iforge approve isaac_newton /path/to/final.png
```

Update status manually if needed:

```bash
./iforge status isaac_newton Review
```

Regenerate the board:

```bash
./iforge board
```

---

## Folder Created Per Character

The bootstrap creates only what Phase 1 needs:

```text
characters/character_slug/
    STATUS.md
    REFERENCE.md
    REVIEW.md
    APPROVAL.md
    prompt.md
    references/
    generated/
    approved/
```

No databases.

No automation engines.

No future architecture.

---

## Iteration Rule

Maximum five iterations.

If the image is historically faithful, visually cohesive, emotionally clear, and production-ready, approve it.

Do not chase perfection.

Move forward.

---

## Success Standard

A new historical figure should take less than five minutes to set up before image generation begins.

The workflow should feel like operating a small animation studio.
