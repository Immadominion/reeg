# Reeg — Pitch Deck

> Copy for a ~15-slide deck. Short, concrete, data-backed. One idea per slide, ≤3 bullets.
> Positioning derives from [positioning.md](../00-overview/positioning.md).
> Every market figure is sourced in [market-data.md](market-data.md); every product number is measured.
> Tone: plain and confident. No hype words.

---

### Slide 1 — Title

**Reeg is infrastructure for portable computing environments.**

- We started with AI agents — the fastest-growing source of ephemeral work.
- The underlying system can preserve and move any environment.
- Live on Sui mainnet today.

---

### Slide 2 — The loss

**An agent runs for hours. Then the place it happened is gone.**

- Not the chat log — the environment, the actual working state.
- It was a row in someone else's database, deleted on their schedule.
- You couldn't keep the run, hand over the live workspace, or prove what happened inside.

---

### Slide 3 — This is happening at scale

**Ephemeral environments are being spun up and destroyed millions of times a month — and accelerating.**

- One sandbox vendor went from **40K → ~15M sandboxes/month in a single year — ~375×** (E2B CEO, Latent Space, 2025).
- AWS Lambda — every call isolated in a Firecracker microVM — runs **>15 trillion requests/month** (AWS re:Invent, 2025).
- Each one does real work, then vanishes. The loss isn't niche; it's the substrate of modern software.

---

### Slide 4 — One missing piece

**Keep it, share it, prove it. Three requests, one answer: you never owned the environment.**

- GitHub helped with code — but Git history can be rewritten.
- Vendor dashboards helped — until a row changed or the vendor shut down.
- The environment itself was never yours to hold.

---

### Slide 5 — What Reeg is

**The layer over your sandbox — not the sandbox.**

- You run the work: local engine, OCI container, Firecracker microVM, or someone else's cloud.
- At each commit: snapshot the working state, encrypt client-side, store as your own Walrus blob.
- Anchor a hash-chained record to a Sui object only you control.

---

### Slide 6 — OWN

**An object you hold, not a row you rent.**

- Every environment is a Sui object you own + your own Walrus data.
- Only the owner mutates it; no vendor can change, lock, or delete it.
- **94% of IT leaders worry about vendor lock-in** (Parallels, 2026). This is the answer.

---

### Slide 7 — SHARE + MOVE

**Hand over the live workspace. Bring it back anywhere, identical.**

- Seal-encrypted checkpoints with an on-chain grant/revoke policy; fork a known-good state.
- Restore byte-identically across hosts **and** runtime tiers (verified).
- Reproducing an environment from scratch fails most of the time — **74% of research-code files won't even run on a clean box** (Trisovic et al., *Nature*, 2022). Reeg makes restore exact.

---

### Slide 8 — PROVE

**A history no one can rewrite — checkable with Reeg switched off.**

- Every checkpoint anchors an append-only record on Sui (`blob_id` + `manifest_hash`).
- Verify the full lineage offline from public Sui + Walrus data alone — no Reeg in the trust path.
- GitHub history can be rewritten; this cannot.

---

### Slide 9 — Isolation tiers

**Pick your isolation. The proof is the same.**

- Local engine → OCI container → Firecracker microVM + jailer → Nautilus TEE attestation.
- Firecracker gives KVM kernel-boundary isolation; the VMM runs under jailer with dropped privileges.
- Nautilus signs the manifest hash in a reproducible Nitro enclave — proves *which code* ran.

---

### Slide 10 — Shipped, measured, green

**Not a demo. A real product, live today.**

- Live on Sui mainnet: pkg `0xfaa6…db241e`. **~0.0099 SUI + ~0.0119 WAL** per create + encrypted checkpoint.
- CI green: Move **40/40**, offline verifier **54/54**, chain **21/21**, crypto cross-language **8/8**.
- Real AWS KVM (c8i.2xlarge): Firecracker **8/8**, OCI **3/3**; Phase M hardening **19/19**. Reproducible enclave: identical PCRs across cache-cleared rebuilds.

---

### Slide 11 — Market

**A large category, compounding ~45%+ a year.**

- Agentic AI in **~33% of enterprise software by 2028, up from <1% in 2024** (Gartner, 2025).
- AI agents market: **$7.84B (2025) → $52.62B (2030), 46.3% CAGR** (MarketsandMarkets, 2025).
- Agents are the wedge; the buyer is every team running ephemeral environments worth keeping.

---

### Slide 12 — Why now

**Adoption pulls it in; regulation makes it hard to leave.**

- **EU AI Act Article 12** requires high-risk AI to keep automatic, lifetime, tamper-evident logs — applying from **2 Aug 2026** (a proposed *Digital Omnibus* deferral to Dec 2027 is pending, not yet law).
- Breach sits in the **€15M / 3%-of-turnover** fines tier (Art. 99(4)). Tamper-evident provenance becomes a compliance asset — the part GitHub can't give you.
- **81% of enterprises worry about reliance on a single AI vendor**; ~3 in 4 would be disrupted if they lost it (Zapier, 2026).

---

### Slide 13 — Where we sit

**The sandbox layer is funded and racing. None of it gives you ownership or proof.**

- E2B: **$21M Series A**, 88% of the Fortune 100. Modal: **$1.1B** post-money, reportedly raising at **~$2.5B**. Daytona: **$24M**, hardware-constrained by demand (sources: market-data.md).
- They run the compute. Reeg is the layer *above* all of them — own, share, move, prove — and plugs into each, not against it.
- **Gartner: >40% of agentic projects will be canceled by 2027** on cost, unclear value, and **weak risk controls.** Reeg is the control-and-proof layer.

---

### Slide 14 — The category

**We started with AI agents. We're building for every environment.**

- The layer never cared what made the environment — agent, CI job, eval harness, or a person at a keyboard.
- Own / share / move / prove holds for anything you run.
- Reeg is infrastructure for portable computing environments. Agents are the wedge; any environment is the ceiling.

---

### Slide 15 — Close

**Reeg is Dropbox for AI agent environments.**

- Live on Sui mainnet. No account needed to open and verify a shared environment.
- Try it, or verify a shared run yourself — with Reeg switched off.
- **reeg.xyz**

---

## Presenter notes

- **Lead with the loss (Slide 2), not the architecture.** Slides 2–4 are the hook; don't open with Sui/Walrus/Seal. The stack earns trust *after* the problem lands.
- **The pivot is Slide 8 (PROVE).** This is the line a sandbox vendor structurally cannot copy. 60-second cut: Slides 1 → 2 → 8 → 10.
- **Slide 3 earns the breadth.** When the room thinks "great, but it's just agents," the 375× and 15-trillion numbers show the loss is the substrate of modern software, not a corner case.
- **Slide 10 is the credibility anchor** for a skeptical room — all measured, on mainnet, today. Have the explorer link and a CI screenshot ready.
- **Slide 13 disarms "aren't E2B/Modal/Daytona your competitors?"** — they're the compute; we're the layer above, and they're customers/partners, not rivals.
- **Honesty on dates (Slide 12):** state 2 Aug 2026 as the active legal date and name the proposed Dec 2027 deferral as *not yet law*. The thesis rides on the *obligation*, not the calendar — say so if pressed. Full sourcing in [market-data.md](market-data.md).
- **One product caveat, if asked:** the mainnet Seal key-server for the *decrypt* step is a provider-availability dependency, not our code. Anchoring, ownership, lineage, and offline verification all work today.
- **Never blend market estimates.** Gartner, MarketsandMarkets, and Grand View Research are independent — cite separately.
