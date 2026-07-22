# Loop State

Current Character: none
State: import
Active Prompt: none
Generated Image: none
Canonical Image: none
Winning Prompt: none
Next Command: ./iforge import "Name" reference_image
Last Updated: 2026-07-22 17:03:21

Preferred Workflow: IMPORT -> GENERATE PROMPT -> LAUNCH IMAGE 2 -> WORKER SAVES BATCH -> PROMOTE SELECTED CANDIDATE -> COMPARE -> APPROVE -> CANONICAL
PROMOTE: human selection; elevates one batch exploration into the active generated candidate.
APPROVE: identity lock; permanently saves the active generated candidate as canonical.
Manual Fallback: ./iforge ingest image_path remains available when no batch worker output exists.
