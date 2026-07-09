# Loop State

Current Character: builder_v_promote_validation
State: approved
Active Prompt: prompts/promoted_batch-validation-chatgpt_round_01.md
Generated Image: generated.png
Canonical Image: canonical.png
Winning Prompt: prompts/winning.json
Next Command: ./iforge next
Last Updated: 2026-07-02 12:29:18

Preferred Workflow: IMPORT -> GENERATE PROMPT -> LAUNCH IMAGE 2 -> WORKER SAVES BATCH -> PROMOTE SELECTED CANDIDATE -> COMPARE -> APPROVE -> CANONICAL
PROMOTE: human selection; elevates one batch exploration into the active generated candidate.
APPROVE: identity lock; permanently saves the active generated candidate as canonical.
Manual Fallback: ./iforge ingest image_path remains available when no batch worker output exists.
