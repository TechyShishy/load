---
name: flavor-text
description: 'Write and apply a flavor text quip to a Load game card. Short, possibly funny or punny, nostalgia-inducing for network engineers and amusing to the rest. Relates to the card title. Use when adding or reworking any card that needs a flavorText field — called automatically from new-card and rework-card.'
argument-hint: "The templateId or name of the card, e.g. 'action-null-route' or 'AWS Outage'"
---

# Card Flavor Text

Produces one punchy quip and writes it directly into the card's TypeScript class file as `readonly flavorText`.

## When to Use

- Called from the `new-card` skill after the class file is created
- Called from the `rework-card` skill after description changes are applied
- Retroactively adding flavor text to a card that has none

---

## Step 1 — Read the Card

If not already in context, read the card's class file:

```
packages/game-core/src/data/<type>/<ClassName>Card.ts
```

Note the card's `name`, `description`, and `templateId`. The card's name is the primary creative hook — the quip should click from reading just the title.

---

## Step 2 — Generate 3 Candidate Quips

Write three candidates. Each must:

**Length:** Bumper-sticker short — a single punchy thought that fits in two or three short lines when word-wrapped in a monospace font. One tight sentence is ideal. Two very short sentences is the absolute ceiling.

**Relation:** The card's name should appear in or be clearly echoed by the quip. Someone reading only the flavor text and the title together should feel the connection immediately.

**Authenticity:** The joke must land for someone who has actually worked in network operations. It should make them sigh, wince, or snort — not roll their eyes at a Wikipedia-level reference.

**Tone palette — pick whichever fits, mixing is encouraged:**

| Tone | The vibe |
| --- | --- |
| **Old-school ops / BOFH** | Gallows humor: 3 AM reboots, blame-driven postmortems, a LART wielded with wisdom |
| **Protocol nerd** | RFC reverence, TCP windowing grief, BGP flapping, "it's always DNS" as religious doctrine |
| **ISP / telco era** | ISDN ("It Still Does Nothing"), T1 lines, frame relay CIR, the weight of a V.90 handshake |
| **Modern cloud / SRE** | PagerDuty at 3 AM, incident bridges with 40 observers and 0 helpers, "five nines" as a coping mechanism |

**Avoid:**
- Generic internet humor that would appear in a listicle ("404 not found", "sudo make me a sandwich") — only use if the execution is genuinely unexpected
- Jargon that doesn't exist in real network operations
- Multi-clause explanations that read like a description, not a quip
- Jokes that require knowing the game's mechanics to understand

Present all three candidates with a one-line rationale for each. Bold the recommended one.

---

## Step 3 — Select and Apply

Use the recommended candidate unless the user has indicated otherwise.

Insert `readonly flavorText` **immediately after `readonly description`** in the class:

```ts
  readonly description = 'Existing mechanical description.';
  readonly flavorText = 'Your quip goes here.';
```

Use `replace_string_in_file` with the full `description` line as surrounding context to ensure the edit lands in the right place.

**If `description` spans multiple lines** (template literal), include the closing line:

```ts
  readonly description =
    'Long description that wraps to the next line.';
  readonly flavorText = 'Your quip goes here.';
```

---

## Quality Checklist

Before finalizing:

- [ ] The card's name is reflected in the quip (not just tangentially related)
- [ ] Someone who hasn't played the game but has worked in network ops would smile
- [ ] Length fits in two or three short lines — no multi-sentence explanations
- [ ] Tone matches the card's subject matter (e.g., security incident → ops/SRE tone; legacy protocol → ISP/telco era)
- [ ] No clichés unless the angle is genuinely fresh
- [ ] If a pun: groan-worthy in a good way


