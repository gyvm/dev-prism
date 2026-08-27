# Design

## Direction

The Explore UI is GitHub Inspired, not GitHub Themed. It should feel native to
GitHub data and pull request workflows without copying GitHub's exact palette.
Favor crisp dashboard readability, restrained color, and stable dense layouts.

## Palette

Use semantic tokens in the Explore stylesheet rather than scattering raw colors.

| Token | Value | Use |
|---|---:|---|
| `--bg-default` | `#f7f9fc` | Page background |
| `--bg-muted` | `#eef3f8` | Muted surfaces and rails |
| `--panel` | `#ffffff` | Section and card surfaces |
| `--panel-subtle` | `#f5f8fb` | Subtle surface variation |
| `--fg-default` | `#202733` | Primary text |
| `--fg-muted` | `#586574` | Secondary text |
| `--fg-subtle` | `#728091` | Tertiary text |
| `--border-default` | `#d6dee8` | Section borders |
| `--border-muted` | `#e2e8f0` | Internal borders |
| `--accent-cyan` | `#0891b2` | Primary Explore accent |
| `--accent-blue` | `#2563eb` | Links and GitHub-adjacent actions |
| `--success` | `#1f8f5f` | Positive or merged states |
| `--attention` | `#b7791f` | Waiting or attention states |
| `--danger` | `#c2413a` | Fixing or failure states |

## Rules

- Do not use purple in Explore UI. Use cyan, blue, green, amber, and red for
  states and roles.
- Keep the page closer to a GitHub analysis tool than a bright SaaS dashboard.
  Use the pale blue background sparingly and avoid large decorative blue areas.
- Prefer borders, spacing, and typography over heavy shadows. Shadows should
  only separate major sections from the page background.
- DORA metric cards should stay white, use a slim accent border, and keep their
  values highly legible.

## Explore UI Workflow

When changing the static Explore UI, rebuild the dashboard before
judging the design:

```bash
npm run web:build
```

Then inspect the generated HTML and capture a browser screenshot. The visual
check is required for PR Timeline, Review Correlation, and DORA styling changes.
