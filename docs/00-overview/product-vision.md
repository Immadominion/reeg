# Product Vision

## The one line

**Reeg is the computer your AI agents live in: one you own, and can share.**

Spin up a real environment for an agent (files, packages, commands, memory), let it
work, then snapshot it, hand it to a teammate, fork it, or move it to another
machine. Because the environment lives on Sui and Walrus, it is genuinely yours, and
anyone you choose can verify exactly what the agent did. The short promise:
**own it, share it, fork it, move it, prove it.**

## The problem, in plain language

AI agents are starting to do real work. They write code, move money, file tickets,
change records, and act on behalf of people and companies. The environment where all
that happens (the agent's actual computer) is rented from a vendor and gone the
moment the session ends. You cannot hand it to a teammate as-is, you cannot fork a
good run to try two directions, you cannot move it off that vendor, and you cannot
let an outside party confirm what really happened. The agent did the work, but the
workspace it did the work in was never yours to keep, share, or stand behind.

That is fine when an agent summarizes an email. It starts to hurt the moment the
work is worth keeping: a long coding run you want to continue tomorrow, an
environment a colleague needs to pick up, a result a client wants to check, a setup
you want to reuse a hundred times.

## What Reeg does

Reeg runs your agents in real, snapshot-able environments, the same core experience
you get from a sandbox like Daytona, E2B, or Blackbox: spin one up, run commands and
write files, checkpoint it, restore it, resume where you left off. We do that part.

What makes Reeg different is what the environment *is*. It is not a row in a vendor's
database, it is an object you own on Sui backed by your own content-addressed data on
Walrus. That one change unlocks three things a centralized box cannot give you:

1. **Own it.** The environment is held as data you control, gated by an object you
   own. No vendor can silently change it, lock you out, or delete it.

2. **Share and fork it.** Hand a whole live environment to a teammate, fork a good
   checkpoint to try two directions, or pass an agent's computer to a client exactly
   as it was. Not a transcript, the actual workspace.

3. **Move it, and prove it.** Kill it on one host, bring it back on another, exactly
   as it was. And because it lives on Sui, proof comes for free: anyone you choose
   can verify what the agent did without trusting Reeg at all.

The short version of the promise: **own it, share it, fork it, move it, prove it.**

## Who it is for

- **Teams running agents that touch money, code, or customers.** They need to prove
  what an agent did when something goes wrong or is disputed.
- **Companies under audit or regulation.** They need an independent, durable record
  of automated decisions, not a vendor's internal log.
- **Builders of agent platforms.** They want a standard, ownable format for agent
  environments and run history that they do not have to invent themselves.

## The honest tradeoff

We are not trying to be the fastest sandbox. A centralized box that lives in one
datacenter will always have lower latency than data coordinated across Sui and
Walrus. We took that trade on purpose. If you want a throwaway scratch environment
for thirty seconds of work, a centralized box is the right tool. If you want an
environment worth owning, sharing, reusing, or standing behind, that is Reeg. We do
everything the centralized box does; we add the parts it structurally cannot.

## What Reeg is not

- Not a memory API. Memory is one part of the environment, not the product.
- Not "decentralized because crypto." Nobody should switch for decentralization.
  They switch because they can finally own, share, and prove the environment, which
  a centralized vendor cannot offer no matter how fast it is.

## Why now

Agents are being handed real authority faster every month, and the work they do is
starting to be worth keeping and sharing rather than throwing away. At the same time,
accountability rules for automated systems are arriving (for example, the EU AI
Act's record-keeping obligations for high-risk AI systems enter into force in
August 2026), which turns the proof Reeg already gives you for free into something a
class of buyers will be required to have. The ownership and sharing win earns the
adoption; the proof makes it defensible.

## How we win

A centralized vendor can copy any feature we ship except one: it cannot let you own
the environment. Ownership is what makes sharing, forking, portability, and
independent proof possible, and all four fall out of one design choice (the
environment is an object you hold on Sui plus your data on Walrus) that a vendor in a
single datacenter cannot match. We do what the fast boxes do, on top of the one thing
they cannot.

## The built-on-Sui story (one paragraph)

Reeg is built on the Sui stack because the pieces line up exactly with what the
product needs. Walrus stores the environment as content-addressed data you own. A
Sui object acts as the kernel: it holds ownership, permissions, and the verification
anchor, and it is programmable, so forking, granting, and revoking access are
on-chain operations. Seal encrypts the environment on your machine before it leaves,
with access controlled by rules you write. Nautilus is the later upgrade path for
proving the execution itself, not just the environment. See
[../02-architecture/sui-tech-reference.md](../02-architecture/sui-tech-reference.md)
for the verified details.
</content>
