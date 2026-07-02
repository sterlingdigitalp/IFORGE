# 16_CHARACTER_DOSSIER_TEMPLATE.md

Version: 1.0  
Status: Foundation Specification  
Project: Identity Forge (IFORGE)

---

# Purpose

Every historical figure in Identity Forge is represented by a single **Character Dossier**.

The Character Dossier is the definitive source of truth for that character.

It contains every piece of information required to reconstruct, refine, validate, maintain, and export the character into Director Desk.

No downstream system should infer information that could instead be explicitly stored inside the dossier.

The dossier represents the permanent digital identity of the historical figure.

---

# Core Philosophy

A character is more than an image.

A character consists of:

- historical evidence
- identity
- appearance
- personality
- visual language
- emotional language
- production assets
- quality assurance
- version history

The Character Dossier unifies all of these into one permanent package.

---

# Relationship to Director Desk

Identity Forge creates the Character Dossier.

Director Desk consumes the Character Dossier.

Identity Forge owns identity.

Director Desk owns storytelling.

Director Desk should never redefine a character.

---

# Folder Structure

Each character receives its own directory.

Example

```text
characters/

    isaac_newton/

        README.md

        dossier.md

        canonical/

        references/

        reconstruction/

        prompts/

        qa/

        exports/

        metadata/

        expressions/

        turnarounds/

        palettes/

        environments/

        versions/
```

Every character follows the identical structure.

---

# README.md

Human-readable summary.

Contents

- Name
- Era
- Occupation
- Canonical Status
- Current Version
- Last Updated
- Confidence Rating
- Approval Status

---

# dossier.md

Primary character document.

Contains:

Historical Summary

Identity Summary

Visual Summary

Personality Summary

Production Notes

Export Status

Everything else references this document.

---

# References Folder

Contains every source used during reconstruction.

Examples

```text
references/

    portrait_01.jpg

    engraving_02.jpg

    bust_01.jpg

    museum_notes.pdf

    biography_notes.md

    source_registry.json
```

Nothing should be deleted.

---

# Reconstruction Folder

Contains all intermediate work.

Examples

Identity analysis

Historical notes

Color reconstruction

Artifact analysis

Reconstruction reports

Comparison studies

Rejected interpretations

Identity Forge should preserve its reasoning.

---

# Canonical Folder

Contains only approved assets.

Example

```text
canonical/

    portrait.png

    portrait.webp

    portrait.psd

    portrait_notes.md
```

Only production-ready material belongs here.

---

# Expressions Folder

Contains approved facial expressions.

Minimum set

Neutral

Thinking

Curious

Smiling

Determined

Surprised

Concerned

Joyful

Every expression should preserve identity.

---

# Turnarounds Folder

Contains identity reference angles.

Minimum

Front

Three-quarter Left

Three-quarter Right

Profile Left

Profile Right

Back

These become critical for animation.

---

# Color Palette

Contains approved color references.

Include

Skin

Hair

Eyes

Primary Clothing

Secondary Clothing

Accent Colors

Leather

Wood

Metal

Environment

Each entry should contain:

Description

Confidence

Reference source

Notes

---

# Environment Folder

Defines the character's canonical environments.

Examples

Newton

Study

Garden

Laboratory

Observatory

Curie

Laboratory

Office

Research Desk

Leonardo

Workshop

Studio

Notebook Table

Environment should reinforce identity.

---

# Prompt Archive

Every prompt ever used should be preserved.

Structure

```text
prompts/

    v0.1.md

    v0.2.md

    v1.0.md

    refinement_log.md
```

Every prompt records:

Purpose

Changes

Result

Outcome

Lessons Learned

Prompt evolution becomes institutional knowledge.

---

# QA Folder

Contains all evaluations.

Examples

Historical Review

Identity Review

Technical Review

Child Appeal Review

Universe Continuity Review

Final Approval

Rejected Versions

Nothing should be overwritten.

---

# Metadata Folder

Contains machine-readable information.

Suggested files

```text
metadata/

    character.json

    colors.json

    identity.json

    prompts.json

    references.json

    qa.json
```

Future automation depends upon structured metadata.

---

# Character Summary

Every dossier begins with:

Name

Birth

Death

Culture

Profession

Historical Era

Nationality

Primary Discipline

Confidence Rating

Canonical Version

Approval Date

Current Status

---

# Historical Summary

Short biography.

Maximum:

500 words.

Focus on:

Who they were.

Why they mattered.

How they changed history.

This summary supports Director Desk scripting.

---

# Personality Profile

Every character should have a personality specification.

The profile must define a distinct emotional identity,

not a generic admirable temperament.

Examples

Primary Traits

Secondary Traits

Communication Style

Emotional Tendencies

Emotional Signature

Emotional Contrast Against Existing Cast

Strengths

Weaknesses

Core Motivation

Signature Behaviors

This profile guides expression generation.

It also prevents two characters from feeling emotionally interchangeable.

---

# Identity Anchors

Document every immutable characteristic.

Examples

Face shape

Nose

Eyes

Jaw

Hair

Beard

Age

Body Type

Posture

Accessories

Identity Anchors should be easy to reference.

---

# Signature Objects

Every character should have iconic objects.

Examples

Newton

Apple

Prism

Notebook

Curie

Glassware

Notebook

Laboratory equipment

Archimedes

Compass

Levers

Mechanical devices

These reinforce recognition.

---

# Signature Colors

Document canonical colors.

Examples

Primary

Secondary

Accent

Supporting

Background

Every color includes:

Confidence

Reasoning

Evidence

---

# Signature Environments

Document canonical settings.

Examples

Workshop

Study

Laboratory

Library

Observatory

Garden

Ship

Studio

Director Desk uses these for scene planning.

---

# Animation Notes

Future-proof the dossier.

Include:

Movement tendencies

Posture

Gestures

Walking style

Thinking habits

Facial tendencies

Signature emotional gestures

Contrast with similar characters

These assist future animation systems.

---

# Voice Notes

Optional.

Document:

Speech style

Energy

Pacing

Vocabulary

Emotional texture

Emotional signature

Humor

Not intended to imitate historical voices.

Instead,

describe communication personality.

---

# Educational Notes

Summarize:

Major discoveries

Key contributions

Interesting facts

Misconceptions

Story opportunities

This supports educational scripting.

---

# Director Desk Export

Every dossier should produce a standard export package.

Example

```text
exports/

    canonical_bundle.zip

    director_desk.json

    identity_package.json

    prompt_bundle.md

    palette.json

    expression_sheet.png

    turnaround_sheet.png
```

Director Desk imports only approved exports.

---

# Version History

Every significant revision should be recorded.

Example

Version

Date

Summary

Reason

Reviewer

Identity Impact

Nothing should be lost.

---

# Approval History

Every canonical promotion records:

Reviewer

Date

Comments

Confidence

Open Questions

Approval becomes traceable.

---

# Character Lifecycle

Every character moves through the same states.

Research

↓

Evidence Collection

↓

Identity Reconstruction

↓

Artifact Removal

↓

Color Reconstruction

↓

Prompt Generation

↓

Refinement

↓

QA

↓

Canonical

↓

Director Desk

↓

Production

Lifecycle should be visible.

---

# Character Dashboard

Every dossier should expose a quick status page.

Example

Historical Confidence

Identity Confidence

Color Confidence

QA Status

Canonical Version

Director Desk Ready

Export Ready

Outstanding Tasks

This becomes the operational overview.

---

# Success Criteria

The Character Dossier succeeds when:

✓ Every historical decision is documented.

✓ Identity is fully specified.

✓ Director Desk requires no additional interpretation.

✓ Future artists can reproduce the character.

✓ Future AI systems can understand the character.

✓ New evidence can be incorporated without losing history.

✓ The dossier becomes the permanent home of the character.

---

# Relationship to the Identity Forge Bible

The Character Dossier is where every previous specification becomes operational.

Reference Evidence provides the facts.

Historical Reconstruction builds the person.

Color Reconstruction restores life.

Artifact Removal removes the centuries.

Identity Lock preserves recognition.

Prompt Architecture communicates intent.

Refinement improves quality.

QA validates the result.

The Dossier preserves everything.

---

# Final Principle

A canonical portrait is only one image.

A Character Dossier is an entire digital person.

Years from now, the image model may change.

Rendering technology may change.

Animation technology may change.

Director Desk may evolve.

But if the Character Dossier has been constructed correctly, the historical person will remain intact.

The Character Dossier is therefore not simply documentation.

It is the permanent identity record of a remarkable human being entrusted to Identity Forge.

It is the foundation upon which every future story will be built.
