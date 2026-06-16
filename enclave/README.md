# Reeg attestation enclave (Nautilus tier)

A tiny AWS Nitro enclave that **attests** Reeg checkpoints: it does **not** run the agent. The agent
keeps running in the Firecracker microVM (so portability and offline verification are preserved);
this enclave is a *measured signer*. At boot it derives an ed25519 key from NSM entropy and obtains a
Nitro attestation document that embeds that public key, rooting the key in the enclave's measurements
(PCRs). Then, over vsock, it signs the **frozen preimage**

```
REEG_NAUTILUS_ATTEST_V1 ++ machine_id(32) ++ seq(u64 LE, 8) ++ manifest_hash
```

byte-for-byte identical to `move/sources/attestation.move` and `@reeg/crypto`'s `attestationPreimage`.
The enclave reconstructs that preimage itself, so it only ever signs well-formed Reeg attestations.

## vsock protocol (length-prefixed JSON, 8-byte big-endian length)

| request | response |
|---|---|
| `{"type":"health"}` | `{"ok":true}` |
| `{"type":"attestation"}` | `{"document_hex":…,"public_key_hex":…}` |
| `{"type":"sign","machine_id":hex,"seq":N,"manifest_hash":hex}` | `{"signature_hex":…,"public_key_hex":…}` |

## Build (on the AWS Nitro host, needs docker + nitro-cli)

```sh
./enclave/build.sh            # -> reeg-enclave.eif + pcrs.json
./enclave/build.sh --verify   # build twice and assert identical PCRs (reproducibility gate)
```

**Reproducible.** Two cache-cleared rebuilds produce identical PCRs. This is achieved with: a musl
static build, `Cargo.lock` + `--locked`, `codegen-units=1` + `strip` + `panic="abort"`,
`SOURCE_DATE_EPOCH=0`, `--remap-path-prefix` (strip embedded build/cargo paths), and a pinned binary
mtime (so the enclave filesystem, and thus PCR0, does not vary with build time). The committed
`pcrs.json` is the canonical build's measurements; for cross-host bit-reproducibility also pin the
base image by digest (replace the `rust:1.90-alpine3.22` tag with `…@sha256:<digest>`).

Current reproducible measurements (`pcrs.json`, SHA-384):

```
PCR0 29de7a1472d80f09eea63a895c91312601e73cd7b3261a9a23531267b074c6c29e804b4e9441127719c7c45e023aee78
```

## Run

```sh
sudo nitro-cli run-enclave --eif-path reeg-enclave.eif --cpu-count 2 --memory 512 --enclave-cid 16
# add --debug-mode for console output, but note: debug enclaves report ALL-ZERO PCRs (the verifier
# flags this). Run WITHOUT --debug-mode for real measurements that match pcrs.json.
```

## On-chain flow

1. **register_enclave**: a PTB calls `0x2::nitro_attestation::load_nitro_attestation` to verify the
   document on chain, then `reeg::attestation::register_enclave` pins the PCRs + ed25519 key into a
   shared `EnclaveConfig`. (`@reeg/chain` `buildRegisterEnclave`.)
2. **register_attested_command**: the enclave signs the checkpoint preimage; the chain
   `ed25519_verify`s it against the `EnclaveConfig` key and emits `CommandAttested`.
   (`@reeg/chain` `buildRegisterAttestedCommand`.)
3. **verify offline**: `@reeg/verify` `verifyAttestation(client, packageId, machineId, {expectedPcrs})`
   confirms the event's key matches the config, ties the manifest hash to the checkpoint, and matches
   the config's PCRs to `pcrs.json`. Additive: a Machine with no attestation verifies unchanged.

End-to-end live (`test/live/attestation.ts`), verified offline 4/4 against the reproducible `pcrs.json`:

| network | package (attestation.move) | EnclaveConfig |
|---|---|---|
| testnet | `0x8f2faf0b…ca1d2` | `0x40543c5a…eaf1` |
| mainnet | `0xfaa6b4af…241e` | `0xd36ec57e…181d` |
