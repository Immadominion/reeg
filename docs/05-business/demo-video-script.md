# Reeg — Demo / Presentation Video Script

> One idea, stated with confidence: **every important thing in computing became portable —
> files, code, containers, data — except environments. Reeg makes environments portable.**
> ~90s product film. Positioning derives from [positioning.md](../00-overview/positioning.md).
> Every claim on screen is measured. The exact commands to film each beat are in
> [demo-runbook.md](demo-runbook.md).

---

## Director's note — the style

Don't open on a sad loss. Open on an **inevitability**. The film makes one argument: every
layer of computing eventually became portable, environments are the last one still trapped,
and Reeg frees them. Quiet confidence — real terminal, real explorer, real costs ticking up.
No buzzwords, no music swell.

The hero shot is still the proof done live (quit Reeg, watch verify survive) — because
*"portable even when its maker is gone"* is the strongest possible proof of portability.
If you must cut, keep beats 1, 3, 4, 6.

---

## The cold open — the lineage *(0:00–0:15)*

One line at a time, each landing with the tool's mark fading in beside it, building a pattern:

- **Files** became portable. → *Dropbox*
- **Code** became portable. → *Git*
- **Containers** became portable. → *Docker*
- **Data** became portable.
- **Environments?** Still trapped.

Then the screen clears to one line: **Reeg makes environments portable.**

- **VO:** "Every important thing in computing eventually became portable. Files. Code.
  Containers. Data. Every layer but one — the place the work actually happens. The
  environment. Until now."

---

## Beat 2 — what an environment is, and why it's trapped *(0:15–0:30)*

- **VO:** "A container made the *blueprint* portable. But the environment your agent
  actually works in — its files, its state, its memory, the work in progress — has never
  left the machine it ran on. It runs for hours, then the session ends and it's gone. You
  can't keep it, move it, hand it to a teammate, or prove what happened inside."
- **On screen:** an agent working live in a terminal; the sandbox window closes; everything
  goes dark. Caption: *"The most valuable environment in computing is the one you can't take with you."*

---

## Beat 3 — Reeg makes it portable *(0:30–0:42)*

- **VO:** "Reeg sits over whatever sandbox you already run and makes the whole environment
  portable. One commit: snapshot the working state, encrypt it on your machine, and anchor a
  record to a Sui object you own."
- **On screen:** `reeg checkpoint`. Pipeline animates — snapshot (BLAKE3) → Seal-encrypt →
  Walrus → anchor on Sui. Cost ticks up: *~0.0099 SUI + ~0.0119 WAL.*

---

## Beat 4 — Move it: portable across machines *(0:42–0:54)*

- **VO:** "Now it travels. Kill it on this machine. Bring it back on another — a different
  host, a different OS — byte-identical."
- **On screen:** Host A terminated. `reeg restore` on Host B. Side-by-side hashes resolve to
  a green **IDENTICAL** across a local engine and a Firecracker microVM.

---

## Beat 5 — Share it: portable to other people *(0:54–1:04)*

- **VO:** "Portable to anyone. Hand a teammate the live environment — not a transcript —
  under a policy you grant and revoke. Fork a good one to run two directions at once."
- **On screen:** grant-access UI; an allowlisted teammate opens the running environment; a
  fork splits the lineage graph into two.

---

## Beat 6 — Prove it: portable trust *(1:04–1:20)* — **the hero shot**

- **VO:** "And the part nothing else can do — the proof is portable too. Anyone can verify
  the entire history from public chain data alone. Watch."
- **On screen:** run `reeg verify <id>`. **Quit the Reeg app entirely, on camera.** It reads
  public Sui only. Output: `Verified: 0x…` and a column of green `ok` checks (provenance-head,
  checkpoint-count, manifest-hash…), exit 0. Caption:
  *"Reeg switched off. Still provable. The truth was never in our hands."*
  *(The "54/54" number is the `@reeg/verify` test-suite count — that's the green-CI montage in
  Beat 7, not the live `reeg verify` output. See [demo-runbook.md](demo-runbook.md) Beat 6.)*

---

## Beat 7 — it's real *(1:20–1:30)*

- **VO:** "Live on Sui mainnet today. Tests green, costs measured, restore verified on a real machine."
- **On screen:** mainnet explorer, pkg `0xfaa6…db241e`; quick green-CI montage (Move 40/40,
  verifier 54/54, Firecracker 8/8 on a real AWS KVM host).

---

## Beat 8 — close *(1:30–1:42)*

- **VO:** "Files. Code. Containers. Data. Now environments. Reeg makes environments portable."
- **On screen:** the lineage list from the open completes — its last row fills in:
  *Environments → Reeg.* Logo. Sub: *"Reeg — infrastructure for portable computing
  environments. Live on Sui mainnet."* **reeg.xyz**

---

## If you only have 30 seconds (social cut)

1. Lineage cold open → *"Environments? Still trapped."* → **"Reeg makes environments portable."** *(0:00–0:10)*
2. `reeg checkpoint` → anchored on Sui. *(0:10–0:16)*
3. **Move** — `reeg restore` on a new host, byte-identical. *(0:16–0:22)*
4. **Prove** — quit Reeg on camera, verify still passes. *(0:22–0:28)*
5. *"Now environments. Reeg."* + *Live on Sui mainnet.* *(0:28–0:30)*

---

## Why this framing wins (note to ourselves)

It's *for* something, not *against* a sandbox. We don't say "we're a better alternative to
[a sandbox vendor]." We say environments are the last layer of computing to become portable,
and we're the ones who freed them — the same shape of inevitability that made Git, Dropbox,
and Docker feel obvious in hindsight. The proof beat (Reeg switched off) is what makes the
portability *total*: the environment outlives even us.
