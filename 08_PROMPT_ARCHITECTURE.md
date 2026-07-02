# 08_PROMPT_ARCHITECTURE.md

Version: 1.0  
Status: Foundation Specification  
Project: Identity Forge (IFORGE)

---

# Purpose

Identity Forge does not rely on one enormous prompt.

Instead, every image is generated from a structured collection of prompt components.

Each component has a single responsibility.

This modular architecture makes prompts:

- understandable
- reusable
- maintainable
- testable
- versionable
- automatically improvable

A prompt is not creative writing.

It is an engineering specification for artistic intent.

---

# Core Philosophy

The image model should never decide who the historical person is.

Identity Forge determines identity.

The image model renders it.

Therefore prompts should describe decisions that have already been made rather than asking the model to invent them.

The prompt should communicate certainty—not uncertainty.

Identity Forge reconstructs.

The model visualizes.

---

# Prompt Architecture Overview

Every generation is assembled from modular prompt blocks.

```
Reference Package
        │
        ▼
Identity Block
        │
        ▼
Historical Block
        │
        ▼
Visual Style Block
        │
        ▼
Lighting Block
        │
        ▼
Materials Block
        │
        ▼
Environment Block
        │
        ▼
Expression Block
        │
        ▼
Composition Block
        │
        ▼
Negative Block
        │
        ▼
Generation Prompt
```

No single block should attempt to solve every problem.

Each block has one responsibility.

---

# Prompt Assembly Philosophy

The prompt should read as though an experienced film director, production designer, historical consultant, cinematographer, and character designer collaborated before the first image was generated.

Every sentence should exist for a reason.

Nothing should be decorative.

---

# Block 1 — Identity Block

The Identity Block is the most important component.

Its purpose is to describe the historical person.

It answers:

Who is this?

Examples include:

- name
- age
- facial structure
- beard
- hairstyle
- body type
- ethnicity
- expression tendencies
- emotional signature
- signature facial characteristics
- identity anchors

Example

> Isaac Newton, approximately sixty years old, narrow face, high forehead, gray-white shoulder-length hair, thoughtful brown eyes, reserved expression, distinctive jawline preserved from historical references.

The Identity Block should never contain artistic style.

Identity comes first.

---

# Block 2 — Historical Block

This block defines historical authenticity.

Examples include:

- century
- location
- culture
- clothing
- historical accessories
- documented objects
- professional environment

Example

> Late seventeenth-century English natural philosopher wearing historically accurate academic robes within a scholarly study containing manuscripts, scientific instruments, prism experiments, and books.

Historical context should support identity.

Not overwhelm it.

---

# Block 3 — Visual Style Block

This defines the Identity Forge Universe.

This block should remain remarkably consistent across every historical figure.

It describes the shared artistic language.

Examples

- cinematic animated realism
- expressive but believable proportions
- emotionally authentic and accessible to children
- premium feature-film quality
- tactile materials
- stylized realism
- emotionally rich storytelling atmosphere

The style belongs to the universe.

Not to the individual.

---

# Block 4 — Lighting Block

Lighting defines emotional tone.

Describe:

- key light
- rim light
- fill
- atmosphere
- volumetric effects
- color temperature
- time of day

Examples

Soft cinematic window light.

Warm volumetric illumination.

Natural bounce lighting.

Gentle rim highlighting.

Readable facial illumination.

Lighting should reinforce storytelling.

Never distract from identity.

---

# Block 5 — Materials Block

Materials communicate realism.

Specify the physical qualities of:

Skin

Hair

Fabric

Leather

Wood

Glass

Metal

Stone

Paper

Examples

Soft woven wool.

Natural linen.

Weathered oak.

Brass instruments.

Subsurface skin scattering.

Fine individual hair strands.

Materials should feel touchable.

---

# Block 6 — Environment Block

Environment reinforces narrative.

It answers:

Where is this person?

Examples

Newton

Library

Laboratory

Garden

Observatory

Archimedes

Workshop

Harbor

Engineering space

Marie Curie

Laboratory

Research desk

Scientific workspace

Environment should support story.

Never become clutter.

---

# Block 7 — Expression Block

The canonical portrait should communicate personality.

It should identify the character's emotional signature before describing the expression.

Examples

Newton

Quiet intensity.

Archimedes

Joyful obsession.

Hypatia

Calm wisdom.

Tesla

Restless imagination.

Curie

Patient courage.

Ada Lovelace

Elegant vision.

Einstein

Wonder-filled delight.

Leonardo

Playful curiosity.

Ibn al-Haytham

Disciplined observation.

These are examples of emotional specificity,

not permanent assignments.

Examples

Curious.

Focused.

Quiet confidence.

Thoughtful.

Intellectual intensity.

Determined.

Expressions should remain subtle.

Identity Forge avoids exaggerated cartoon emotions during canonical generation.

It also avoids using the same pleasant expression across the cast.

---

# Block 8 — Composition Block

Composition determines visual readability.

Specify:

Camera distance.

Camera angle.

Lens language.

Depth of field.

Pose.

Silhouette.

Eye direction.

Examples

Three-quarter portrait.

Waist-up composition.

Face dominant.

Strong eye readability.

Soft background separation.

The face is always the primary subject.

---

# Block 9 — Negative Block

The Negative Block defines what Identity Forge rejects.

Examples include:

engraving lines

cross-hatching

brush strokes

canvas texture

sepia

paper grain

museum lighting

plastic skin

generic cartoon style

anime proportions

modern clothing

uncanny realism

distorted anatomy

text

watermarks

AI artifacts

extra limbs

incorrect hands

The Negative Block protects consistency.

---

# Reference Images

Prompt text is never the only source of truth.

Reference imagery carries enormous weight.

Identity Forge should support multiple reference images simultaneously.

Examples

Oil painting.

Bust.

Engraving.

Coin.

Historical reconstruction.

Museum illustration.

Each reference contributes evidence.

Not artistic style.

---

# Prompt Weighting

Every block has different priority.

Highest priority

Identity

Historical accuracy

Identity anchors

Medium priority

Environment

Lighting

Composition

Lower priority

Minor stylistic flourishes

Decorative language

Identity should never lose to style.

---

# Prompt Reuse

The architecture intentionally separates:

Reusable Universe Blocks

from

Character-Specific Blocks.

Examples

The Visual Style Block may remain identical for every historical figure.

The Identity Block changes every time.

This dramatically improves consistency across the cast.

---

# Prompt Versioning

Every prompt should be version controlled.

Example

Newton

v1.0

↓

v1.1

↓

v1.2

Each revision records:

What changed.

Why it changed.

Whether identity improved.

Whether child appeal improved.

Whether historical accuracy improved.

Prompt evolution becomes measurable.

---

# Prompt Evaluation

Every generated image should be evaluated against the originating prompt.

Questions include:

Did identity survive?

Did the environment match?

Did lighting follow specification?

Did materials render correctly?

Did artifact removal succeed?

Did the model hallucinate details?

The prompt is judged by its output.

---

# Common Failure Modes

Prompt architecture has failed when:

One paragraph attempts to solve every problem.

Identity becomes buried beneath artistic language.

Historical facts become optional.

Prompt blocks contradict one another.

Negative guidance is missing.

Lighting varies wildly between characters.

Environment overwhelms identity.

Every prompt becomes completely different.

The architecture exists specifically to prevent these failures.

---

# Future Prompt Automation

Identity Forge is designed so prompts can eventually be assembled automatically.

Inputs

↓

Character Dossier

↓

Identity Block

↓

Historical Block

↓

Universe Style Block

↓

Scene Requirements

↓

Prompt Builder

↓

Generation

The human should no longer write enormous prompts manually.

The system should compose them from structured knowledge.

---

# Success Criteria

The Prompt Architecture succeeds when:

✓ Prompt construction becomes repeatable.

✓ Identity remains the highest priority.

✓ Historical accuracy remains explicit.

✓ Every character belongs to the same universe.

✓ Prompt maintenance becomes simple.

✓ Refinement becomes measurable.

✓ Prompt quality improves over time.

---

# Final Principle

Identity Forge does not rely on prompt engineering.

It relies on **knowledge engineering**.

Prompts are simply the language used to communicate decisions that have already been made through historical research, identity reconstruction, artistic direction, and production standards.

The prompt should never invent the character.

It should faithfully describe the character that Identity Forge has already discovered.
