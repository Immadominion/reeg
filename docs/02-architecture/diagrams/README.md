# Architecture diagrams

Each diagram is kept as **three files** with the same stem:

| File | Role | Commit it? |
| --- | --- | --- |
| `*.json` | **Source of truth**: the diagram definition (`reeg-diagram/1.0`). Edit this. | ✅ yes |
| `*.svg` | Rendered vector (crisp, small). Good for the docs site / high-DPI. | ✅ yes |
| `*.png` | Rendered raster. Used in the README and Markdown because GitHub renders it reliably everywhere. | ✅ yes |

**Keep the JSON.** It's what the images are generated from, so edits are reviewable in a
diff and the images can be regenerated deterministically. Don't hand-edit the SVG/PNG.
Change the JSON and re-render.

The diagrams:

- `system-context`: the high-level picture (you → Reeg → Sui / Walrus / Seal). Used in the
  README and at the top of [system-architecture.md](../system-architecture.md).
- `component-architecture`: components and how they connect (§2 of system-architecture.md).
- `snapshot-restore-sequence`: the capture → encrypt → store → anchor → restore sequence (§2.1).
- `verification-flow`: how an auditor verifies a run offline, Reeg switched off (§3).

Regenerate after editing a `*.json` with the project's diagram renderer (see
`scripts/`), which emits the matching `*.svg` and `*.png`.
