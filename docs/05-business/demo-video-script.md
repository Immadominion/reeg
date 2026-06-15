# Reeg — Demo / Presentation Video Script

> A ~90-second product film. Positioning derives from
> [positioning.md](../00-overview/positioning.md). Every claim on screen is measured.

---

## Director's note — the style

Most demo videos are a feature montage: cut, cut, cut, logo. Don't do that.

**Follow one environment through its whole life, in one unbroken through-line.** One agent
run is born, does real work, the sandbox dies — and then Reeg gives it back: owned, moved,
shared, proven. No "here are our features" cards. The viewer watches a single thing they
care about survive something that should have killed it.

- **The hero shot is the proof, done live.** On camera, quit the Reeg app entirely, then
  run the offline verifier against public chain data and watch it pass. That single
  uncut moment — *Reeg switched off, still verifiable* — is the whole pitch. Build the
  film toward it.
- **Tone:** quiet confidence. Real terminal, real mainnet explorer, real costs ticking up.
  No stock music swell, no buzzwords on screen. Let the green checkmarks do the talking.
- **Text on screen is sparse:** short captions, the exact numbers, nothing else.
- **Length:** 75–95s. If you must cut, keep beats 1, 3, 6, 7, 9.

---

## The script

**Beat 1 — Origin: we kept watching this happen** *(0:00–0:12)*
- **VO:** "We kept watching the same thing happen. An agent would run for hours, get somewhere real — and then the session closed. Not the log. The environment. Gone."
- **On screen:** Quick cut montage — agent terminals, CI pipelines, eval harnesses — each going dark one by one. Final frame holds on a blank screen. Text fades up: *"The environment is gone. The work lived here."*

**Beat 2 — Reframe: you didn't own it** *(0:12–0:22)*
- **VO:** "It was never yours. A row in someone else's database, on a server you'd never see, deleted on their schedule."
- **On screen:** Diagram — three different environments (agent, CI job, dev workspace) inside a vendor box labeled *"their server, their rules."* A lock icon flips to a trash icon.

**Beat 3 — The layer** *(0:20–0:32)*
- **VO:** "Reeg sits over whatever sandbox you already run. You keep running the agent. Reeg just waits at the commit boundary."
- **On screen:** Same agent, now with a thin Reeg layer drawn *above* the sandbox. Label: *"Not the sandbox — the layer over it."* Runner options flash: local, OCI, Firecracker, third-party cloud.

**Beat 4 — Commit = own** *(0:32–0:44)*
- **VO:** "At each commit, Reeg snapshots the working state, encrypts it on your machine, and anchors a record to a Sui object only you control."
- **On screen:** Console: `reeg commit`. Pipeline animates — snapshot to BLAKE3 hash, Seal-encrypt, Walrus upload, Sui anchor. Cost ticks up: *~0.0099 SUI + ~0.0119 WAL.*

**Beat 5 — Move: restore anywhere** *(0:44–0:55)*
- **VO:** "Kill it on this machine. Bring it back on another. Byte-identical, across hosts and across runtime tiers."
- **On screen:** Host A terminated. `reeg restore` on Host B (different OS). Side-by-side hash diff resolves to a green *"IDENTICAL"* across a local engine and a Firecracker microVM.

**Beat 6 — Share: the live thing** *(0:55–1:05)*
- **VO:** "Hand a teammate the live workspace under a policy you grant and revoke. Not a transcript — the real environment. Fork a good checkpoint to try two directions."
- **On screen:** Grant-access UI; an allowlisted teammate opens the running workspace. A fork branches the lineage graph into two.

**Beat 7 — Prove: Reeg switched off** *(1:05–1:20)* — **the hero shot**
- **VO:** "Now the part GitHub can't give you. Anyone verifies the full history offline, from public chain data alone — and we close Reeg entirely."
- **On screen:** Open the `@reeg/verify` CLI. **Quit the Reeg app on camera.** Run verify against public Sui + Walrus. Output: *full chain valid, 54/54.* Caption: *"GitHub history can be rewritten. This can't."*

**Beat 8 — It's real** *(1:20–1:30)*
- **VO:** "This is live on Sui mainnet today. Tests green, costs measured, restore verified on a real KVM host."
- **On screen:** Mainnet explorer: pkg `0xfaa6…db241e`. Quick montage of green CI: Move 40/40, verifier 54/54, Firecracker 8/8 on c8i.2xlarge.

**Beat 9 — Close** *(1:32–1:42)*
- **VO:** "We started with AI agents because that's where ephemeral work is exploding fastest. But the underlying system can preserve and move any environment. Reeg is Dropbox for AI agent environments."
- **On screen:** Logo + line: *"Reeg is Dropbox for AI agent environments."* Sub: *"Infrastructure for portable computing environments — live on Sui mainnet."* **reeg.xyz**

---

## If you only have 30 seconds (social cut)

1. Loss — sandbox goes dark, *"The environment is gone."* (0:00–0:06)
2. The layer — `reeg commit`, anchored to Sui. (0:06–0:14)
3. **Prove** — quit Reeg on camera, verify passes. *"GitHub history can be rewritten. This can't."* (0:14–0:26)
4. Logo + *"Reeg is Dropbox for AI agent environments. Live on Sui mainnet."* (0:26–0:30)
