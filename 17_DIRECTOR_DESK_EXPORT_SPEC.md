# 17_DIRECTOR_DESK_EXPORT_SPEC.md

Version: 1.0  
Status: V2 Target — superseded for Phase 1  
Project: Identity Forge (IFORGE)

> **Phase 1 supersession notice.** The live IFORGE → Director Desk interface is
> Director Desk's `CANONICAL_IMAGE_CONTRACT.md`: one canonical image plus a JSON
> sidecar, delivered by HTTP POST to Director Desk's ingestion API, validated on
> arrival. This document remains the V2 package target (manifests, dossiers,
> expressions, turnarounds, checksums); the image-level contract will be embedded
> within it when the package format is implemented. Until then, where the two
> documents differ, the canonical image contract governs.

---

# Purpose

Identity Forge and Director Desk are separate systems with different responsibilities.

Identity Forge creates canonical historical characters.

Director Desk tells stories using those characters.

This document defines the official contract between the two systems.

Every Director Desk production begins with an Identity Forge Export Package.

No character enters Director Desk outside this specification.

---

# Core Philosophy

Identity Forge owns identity.

Director Desk owns storytelling.

Identity Forge determines:

Who the character is.

Director Desk determines:

What the character does.

Neither system should duplicate the other's responsibilities.

This separation allows both applications to evolve independently.

---

# Export Pipeline

```
Historical Research
        │
        ▼
Identity Reconstruction
        │
        ▼
Artifact Removal
        │
        ▼
Canonical Approval
        │
        ▼
Export Package
        │
        ▼
Director Desk Import
        │
        ▼
Production
```

Only Canonical Characters may be exported.

---

# Export Goals

Every export package should be:

Complete

Deterministic

Versioned

Portable

Future-proof

Human-readable

Machine-readable

The exported character should require no additional interpretation.

---

# Package Structure

Each export should produce a single package.

Example

```
isaac_newton_v1.0/

    manifest.json

    character.json

    identity.json

    personality.json

    history.json

    colors.json

    environments.json

    prompts/

    canonical/

    expressions/

    turnarounds/

    references/

    metadata/

    documentation/

```

The structure should remain identical for every character.

---

# Manifest

Every package begins with:

manifest.json

Required fields

Character ID

Character Name

Canonical Version

Export Version

Identity Forge Version

Export Date

Compatibility Version

Checksum

Approval Status

The manifest allows Director Desk to validate compatibility before import.

---

# Character Definition

character.json

Contains:

Name

Birth

Death

Era

Culture

Profession

Nationality

Historical Summary

Identity Summary

Character Status

Canonical Version

Primary Image

The character definition acts as the public profile.

---

# Identity Package

identity.json

Contains immutable identity information.

Examples

Face geometry

Identity anchors

Hair

Eyes

Nose

Jaw

Age

Body type

Posture

Signature features

Director Desk should never modify these values.

---

# Personality Package

personality.json

Contains

Primary Traits

Secondary Traits

Strengths

Weaknesses

Motivations

Communication Style

Energy Level

Curiosity Profile

Emotional Signature

Emotional Contrast Notes

Leadership Style

Humor Style

Decision Style

This package informs dialogue and scene behavior.

It ensures Director Desk preserves personality differences instead of generating one shared heroic tone.

---

# Historical Package

history.json

Contains

Biography

Timeline

Major Discoveries

Historical Events

Important Relationships

Known Locations

Historical Notes

Educational Notes

Director Desk uses this information when generating stories.

---

# Visual Package

Canonical assets.

```
canonical/

    portrait.png

    portrait.webp

    portrait_notes.md
```

Only approved images belong here.

---

# Expression Package

```
expressions/

    neutral.png

    thinking.png

    smiling.png

    determined.png

    surprised.png

    joyful.png

```

Expressions must preserve identity.

Expression sets should be customized to the character's emotional signature.

Generic expression sheets are not sufficient for canonical export.

---

# Turnaround Package

```
turnarounds/

    front.png

    left34.png

    right34.png

    left.png

    right.png

    back.png

```

These assist future animation and scene consistency.

---

# Color Package

colors.json

Contains

Skin

Hair

Eyes

Primary Clothing

Secondary Clothing

Accent Colors

Environment Colors

Material Colors

Every entry includes:

RGB

HEX

Description

Confidence

Historical Notes

---

# Environment Package

environments.json

Contains canonical locations.

Examples

Study

Workshop

Laboratory

Library

Garden

Ship

Observatory

Studio

Each environment includes:

Description

Lighting

Materials

Mood

Historical Confidence

---

# Prompt Archive

```
prompts/

    canonical_prompt.md

    refinement_history.md

    prompt_versions.md

```

Prompt history accompanies the export.

Director Desk may inspect it,

but should never depend upon prompt wording.

---

# Metadata Package

metadata/

Contains

Generation Settings

Identity Confidence

Historical Confidence

Color Confidence

QA Scores

Approval Dates

Version History

Build Information

Metadata enables future auditing.

---

# Documentation Package

```
documentation/

    dossier.md

    qa_report.md

    evidence_summary.md

    approval_notes.md

```

Humans should understand the package without opening JSON files.

---

# Reference Package

References remain attached.

```
references/

    images/

    documents/

    source_registry.json

```

Director Desk should not modify reference evidence.

---

# Import Validation

Before import,

Director Desk validates:

Manifest

Checksum

Version Compatibility

Required Assets

Required Metadata

Identity Package

Canonical Status

If validation fails,

import should stop.

---

# Compatibility

Every export includes:

Identity Forge Version

Export Schema Version

Director Desk Minimum Version

Future Compatibility Notes

This allows both systems to evolve safely.

---

# Versioning

Every export follows semantic versioning.

Examples

1.0.0

1.1.0

1.2.0

2.0.0

Major identity changes require major versions.

Minor documentation updates require minor versions.

---

# Integrity

Every package should include:

Checksum

Package Hash

Creation Timestamp

Approval Timestamp

Reviewer

Identity Hash

This prevents accidental corruption.

---

# Director Desk Responsibilities

Director Desk may:

Generate scenes.

Create storyboards.

Animate expressions.

Compose environments.

Write dialogue.

Generate camera shots.

Create cinematic sequences.

Director Desk may not:

Change identity.

Change personality.

Change historical facts.

Replace canonical portraits.

Modify identity anchors.

Identity changes belong exclusively to Identity Forge.

---

# Identity Lock During Production

Director Desk should continuously preserve:

Face geometry

Hair

Eyes

Jaw

Body proportions

Color palette

Personality

Signature accessories

Historical clothing

Identity must survive every production.

---

# Future Extensions

The export specification should remain extensible.

Potential future additions:

Voice profiles

Animation rigs

3D meshes

Facial blend shapes

Lip-sync references

Physics assets

Interactive dialogue models

AR/VR assets

Educational lesson packages

The export format should grow without breaking compatibility.

---

# Common Failure Modes

Export has failed when:

Required files are missing.

Identity information is incomplete.

Version information is absent.

Canonical approval is missing.

Assets are inconsistent.

Metadata contradicts documentation.

Director Desk must infer identity.

Identity Forge should export certainty,

not ambiguity.

---

# Export Checklist

Before exporting ask:

✓ Is the character Canonical?

✓ Has QA passed?

✓ Are all required assets present?

✓ Are metadata files complete?

✓ Is documentation current?

✓ Is version information correct?

✓ Is the package portable?

✓ Can Director Desk import without manual edits?

If any answer is no,

export should not proceed.

---

# Success Criteria

The Director Desk Export Specification succeeds when:

✓ Every canonical character imports successfully.

✓ Director Desk requires no manual reconstruction.

✓ Identity remains immutable.

✓ Historical information remains intact.

✓ Production begins immediately after import.

✓ Future versions remain compatible.

✓ Every exported package becomes a permanent archival record.

---

# Relationship to Identity Forge

This specification completes the Identity Forge pipeline.

Reference Evidence discovers the person.

Historical Reconstruction rebuilds them.

Color Reconstruction restores them.

Artifact Removal removes centuries of noise.

Identity Lock protects recognition.

Prompt Architecture communicates artistic intent.

Refinement improves quality.

QA certifies the result.

The Character Dossier preserves the character.

The Director Desk Export Specification delivers that character into production.

Nothing else should be required.

---

# Final Principle

Identity Forge exists to create extraordinary historical characters.

Director Desk exists to tell extraordinary stories with them.

The Export Specification is the bridge between those two worlds.

It should be invisible.

Reliable.

Deterministic.

Future-proof.

When it succeeds, the storyteller never thinks about files, metadata, or schemas.

They simply choose a remarkable person and begin creating.

That seamless transition is the ultimate purpose of the Director Desk Export Specification.
