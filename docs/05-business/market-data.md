# Reeg: Market Data (sourced evidence)

> The citable backbone for the pitch deck and any external claim. Every figure
> here was gathered and **adversarially re-verified** against a named source with a year.
> Rule: only numbers that survived verification appear here. Product numbers (costs, test
> counts) live in [positioning.md](../00-overview/positioning.md); this file is the
> *market* evidence. When a figure has a caveat, the caveat ships with it.
>
> Positioning derives from [positioning.md](../00-overview/positioning.md):
> **Reeg is infrastructure for portable computing environments.**

---

## 1. The market is large and compounding (TAM + tailwind)

| Figure | Source |
|---|---|
| Agentic AI will be embedded in **~33% of enterprise software applications by 2028**, up from **<1% in 2024**. | Gartner (2025) |
| **At least 15% of day-to-day work decisions** will be made autonomously via agentic AI **by 2028**, up from 0% in 2024. | Gartner (2025) |
| **40% of enterprise applications** will feature task-specific AI agents **by 2026**, up from <5% in 2025. *(Distinct Gartner release: do not conflate with the 33%/2028 figure.)* | Gartner (2025) |
| AI agents market: **$7.84B (2025) → $52.62B (2030)**, **46.3% CAGR**. | MarketsandMarkets (2025) |
| Agentic AI market: **$7.06B (2025) → $93.20B (2032)**, **44.6% CAGR**. *(2032 endpoint: keep the year exact.)* | MarketsandMarkets (2025) |
| AI agents market: **→ $50.31B by 2030**, **45.8% CAGR** (independent estimate; cite separately from M&M, do not average). | Grand View Research (2025) |

**Read:** the category Reeg sits above is real, large, and growing ~45%+ annually by every
independent estimate.

---

## 2. Ephemeral compute is exploding: the loss is happening at scale

The thing Reeg fixes (environments that do real work, then vanish) is being created and
destroyed millions of times a month, and the trend is near-vertical.

| Figure | Source |
|---|---|
| E2B sandbox volume grew from **40,000/month (Mar 2024) to ~15,000,000/month (Mar 2025)**: **~375× in one year**. | E2B CEO Vasek Mlejnsky, Latent Space interview (2025) |
| E2B raised a **$21M Series A** (Insight Partners; $32M total); **88% of the Fortune 100 signed up**; "hundreds of millions of sandbox sessions." | E2B blog (Jul 2025) |
| Modal Labs raised an **$87M Series B** led by Lux Capital at a **$1.1B post-money** valuation ($111M total); runs tens of thousands of concurrent containers. | Modal blog (Sep 2025) |
| Modal **reportedly in talks to raise at ~$2.5B** (>2× its $1.1B in under five months) on ~$50M ARR. *(Reported talks, not a closed round.)* | TechCrunch (Feb 2026) |
| Daytona raised a **$24M Series A** (FirstMark); a 20-person team hit **$1M forward run-rate in <3 months, doubling to $2M ~6 weeks later, and is hardware-constrained by demand.** | Daytona / PR Newswire (Feb 2026) |
| AWS **Firecracker** boots a microVM in **<125ms** with **<5 MiB** overhead: thousands per server (the primitive that makes per-agent sandboxes economical). | AWS Open Source Blog (2018) |
| AWS **Lambda**, every invocation isolated in a Firecracker microVM, runs **>15 trillion requests/month** (~1.7T on Prime Day alone). | AWS re:Invent (2025) |

**Read:** the sandbox layer is venture-funded, racing, and supply-constrained, but **none
of it gives you ownership or proof.** That is the gap Reeg sits in, one layer up. Every one
of these is a place Reeg's "run the work anywhere" runner story plugs into, not competes with.

---

## 3. Runs are long and valuable now, and fragile (keep + crash-survival + reproducibility)

| Figure | Source |
|---|---|
| Frontier agents stay reliable only on short tasks: Claude 3.7 Sonnet's **50%-success task length is ~50 min**; the **80%-reliability horizon is ~5× shorter (~10 min)**. | METR: Kwa, West, Becker et al. (2025) |
| The agent task-completion **time horizon has doubled roughly every 7 months since 2019.** | METR (2025) |
| **74% of research-code (R) files failed to run** without error on a clean environment on first execution, and **56% still failed after automated cleanup.** | Trisovic et al., *Nature Scientific Data* (2022) |
| **>70% of scientists** have failed to reproduce another researcher's experiment; **52%** say there is a significant reproducibility "crisis" (survey of 1,576). | Monya Baker, *Nature* (2016) |

**Read:** agents now do long, valuable runs (worth keeping), and reliability collapses as
tasks lengthen, so a crash that loses the environment is expensive. Reproducing an
environment from scratch fails the majority of the time. Reeg's **byte-identical restore**
and **checkpoint/fork** answer exactly this.

---

## 4. Vendor lock-in is a top enterprise fear (OWN + MOVE)

| Figure | Source |
|---|---|
| **94% of IT leaders are concerned about cloud / end-user-computing vendor lock-in** (just under half "very concerned"; survey of ~600 IT pros, US/UK/Germany). | Parallels (2026) |
| **81% of enterprise leaders are concerned about relying on specific AI vendors** (29% "very concerned"); **nearly 3 in 4 say they'd face disruption if they lost their primary AI vendor.** | Zapier (2026) |

**Read:** "own it, move it off the vendor, no lock-in" is not a crypto talking point: it is
the stated, measured anxiety of the buyer. Reeg makes the environment an object the customer
holds, restorable byte-identically on any host.

---

## 5. Tamper-evident record-keeping is becoming a legal obligation (PROVE + defensibility)

| Figure | Source |
|---|---|
| **Article 12** requires high-risk AI systems to **technically enable automatic event logging over the full lifetime of the system**, covering risk identification, post-market monitoring, and operational monitoring. | EU AI Act: Regulation (EU) 2024/1689, Art. 12 |
| The general application date is **2 August 2026**; Annex III high-risk obligations (incl. Art. 12) apply from then, product-embedded Annex I from 2 August 2027. | EU AI Act, Art. 113 |
| Automatically generated logs must be **retained ≥ 6 months** (a floor, not a ceiling), unless other Union/national or data-protection law requires longer. | EU AI Act, Art. 19 (providers) & 26(6) (deployers) |
| Breaching Art. 12 logging obligations sits in the **second fines tier: up to €15M or 3% of worldwide annual turnover, whichever is higher** (top tier €35M / 7% for Art. 5 prohibited practices). | EU AI Act, Art. 99(4) & 99(3) |

> **Honest caveat (ships with the date).** A provisional **"Digital Omnibus"** agreement
> (reached 6 May 2026) *proposes* deferring Annex III high-risk obligations to **2 December
> 2027** (and Annex I to 2 August 2028). It is **not yet law** (it binds only on adoption
> and publication in the Official Journal), so **2 August 2026 remains the legally active
> deadline** until then. The *obligation itself* (automatic, tamper-evident logging an
> outsider can check) is settled either way; only the clock may move. Frame the thesis on
> the obligation, not the calendar.

**Read:** the part GitHub structurally cannot give you, a record an outsider verifies
without trusting the vendor, is moving from nice-to-have to legal duty, with real fines
attached. That is what makes the position hard to leave once adopted.

---

## 6. The cancellation stat (use as a governance wedge, not a scare)

| Figure | Source |
|---|---|
| **Over 40% of agentic AI projects will be canceled by end of 2027**, on escalating costs, unclear business value, and **inadequate risk controls** (most are early, hype-driven proofs of concept). Only **~130 of thousands of "agentic" vendors are real** ("agent washing"). | Gartner (2025) |

**Read:** weak risk controls are a named reason projects die. Reeg is the control-and-proof
layer that makes an agent program auditable and defensible, the opposite of "agent washing."

---

## Usage rules

- Cite each figure with its source and year inline (e.g. "— Gartner, 2025"). Never strip attribution.
- MarketsandMarkets, Grand View Research, and Gartner are **independent** estimates: present separately; do not average or blend.
- "Reported in talks" (Modal ~$2.5B) is **not** a closed round: keep that wording.
- The EU AI Act deferral is **proposed, not enacted**: never state Dec 2027 as the live date.
- Product/engineering numbers (costs, test counts, package ids) come from
  [positioning.md](../00-overview/positioning.md), never from this file.
