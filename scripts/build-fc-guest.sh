#!/usr/bin/env bash
# Build the Firecracker guest artifacts the microVM tier (phase M) needs, on the Reeg AWS host.
# Run AFTER aws-host-bootstrap.sh, from the repo root:
#   cd ~/reeg && bash scripts/build-fc-guest.sh && source ~/.reeg-fc.env
#
# Produces (under $OUT, default /var/lib/reeg), matching engine/crates/runtime/src/firecracker.rs:
#   vmlinux       -> REEG_FC_KERNEL   a Firecracker CI guest kernel (vsock + ext4 + serial)
#   rootfs.ext4   -> REEG_FC_ROOTFS   ext4 image with /sbin/reeg-engine + a /sbin/init that
#                                     execs `reeg-engine guest-agent --port 52` (FC sets no init=)
#   rootfs/       -> REEG_OCI_ROOTFS  extracted Alpine root for the OCI (runc) tier test
# and writes ~/.reeg-fc.env exporting all of the above + FIRECRACKER_BIN.
#
# The rootfs is assembled ROOTLESS via `mke2fs -d` (no loop-mount, no sudo for the image).
# The guest binary is built static-musl so it runs in a minimal Alpine guest with no glibc.
#
# Tunables (env): OUT, ALPINE_VER, ALPINE_PATCH, FC_KERNEL_CHANNEL, IMG_SIZE_MB, REPO.
set -euo pipefail

REPO="${REPO:-$(cd "$(dirname "$0")/.." && pwd)}"
OUT="${OUT:-/var/lib/reeg}"
ALPINE_VER="${ALPINE_VER:-3.21}"
ALPINE_PATCH="${ALPINE_PATCH:-3.21.3}"
FC_KERNEL_CHANNEL="${FC_KERNEL_CHANNEL:-v1.13}"   # firecracker-ci kernel channel on spec.ccfc.min
IMG_SIZE_MB="${IMG_SIZE_MB:-512}"
ARCH="$(uname -m)"
TARGET="x86_64-unknown-linux-musl"
say() { printf '\n=== %s ===\n' "$*"; }

[ "$ARCH" = "x86_64" ] || { echo "this script assumes x86_64 (got $ARCH)"; exit 1; }
command -v mke2fs >/dev/null || { echo "mke2fs missing — run aws-host-bootstrap.sh first"; exit 1; }
command -v firecracker >/dev/null || { echo "firecracker missing — run aws-host-bootstrap.sh first"; exit 1; }
# shellcheck disable=SC1090
. "$HOME/.cargo/env" 2>/dev/null || true

sudo mkdir -p "$OUT"
sudo chown "$USER":"$USER" "$OUT"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# ---------------------------------------------------------------------------------------------
say "1. Guest kernel (Firecracker CI vmlinux: vsock + ext4 + serial)"
# Pick the latest vmlinux in the channel from the public bucket; the CI kernels are built with
# exactly the configs Firecracker needs. No multi-hour kernel compile.
if [ -s "$OUT/vmlinux" ]; then
  echo "vmlinux already present at $OUT/vmlinux ($(stat -c%s "$OUT/vmlinux") bytes) — skipping"
else
  base="https://s3.amazonaws.com/spec.ccfc.min/firecracker-ci/${FC_KERNEL_CHANNEL}/${ARCH}"
  echo "listing $base ..."
  # Match exactly vmlinux-X.Y.Z (three numeric parts) so the .config and -no-acpi sidecars are
  # excluded; sort -V and take the newest.
  key="$(curl -fsSL "https://s3.amazonaws.com/spec.ccfc.min/?list-type=2&prefix=firecracker-ci/${FC_KERNEL_CHANNEL}/${ARCH}/vmlinux-" \
        | grep -oE "firecracker-ci/${FC_KERNEL_CHANNEL}/${ARCH}/vmlinux-[0-9]+\.[0-9]+\.[0-9]+" \
        | sort -u | sort -V | tail -1 || true)"
  if [ -n "$key" ]; then
    url="https://s3.amazonaws.com/spec.ccfc.min/${key}"
  else
    # Fallback: a pinned known-good file name in this channel.
    url="${base}/vmlinux-6.1.141"
    echo "bucket listing failed; falling back to pinned $url"
  fi
  echo "downloading $url"
  curl -fsSL -o "$OUT/vmlinux" "$url"
  echo "vmlinux: $(stat -c%s "$OUT/vmlinux") bytes"
fi

# ---------------------------------------------------------------------------------------------
say "2. Build reeg-engine (static musl) for the guest"
# guest-agent is compiled on Linux with no feature flag. The musl target is static by default, so it
# needs no libc in-guest (do NOT force +crt-static globally — that breaks proc-macro builds on the
# gnu fallback). Add the musl target to whatever toolchain the repo pins via rust-toolchain.toml; the
# bootstrap's `rustup target add` only touched the default toolchain, not the pinned one.
( cd "$REPO" && rustup target add "$TARGET" ) || rustup target add "$TARGET" || true
if cargo build --manifest-path "$REPO/engine/Cargo.toml" -p reeg-engine --release --target "$TARGET"; then
  ENGINE_BIN="$REPO/engine/target/${TARGET}/release/reeg-engine"
else
  echo "musl-static build failed; falling back to native glibc build."
  echo "  (the rootfs base will then need a matching glibc — see runbook's musl-fallback note.)"
  cargo build --manifest-path "$REPO/engine/Cargo.toml" -p reeg-engine --release
  ENGINE_BIN="$REPO/engine/target/release/reeg-engine"
fi
file "$ENGINE_BIN" || true
echo "engine: $ENGINE_BIN"

# ---------------------------------------------------------------------------------------------
say "3. Alpine minirootfs (guest userland for FC + OCI tiers)"
ROOTDIR="$WORK/rootfs"
mkdir -p "$ROOTDIR"
mr="alpine-minirootfs-${ALPINE_PATCH}-${ARCH}.tar.gz"
mr_url="https://dl-cdn.alpinelinux.org/alpine/v${ALPINE_VER}/releases/${ARCH}/${mr}"
echo "downloading $mr_url"
curl -fsSL -o "$WORK/$mr" "$mr_url"
tar -xzf "$WORK/$mr" -C "$ROOTDIR"

# Place the guest engine binary.
install -D -m0755 "$ENGINE_BIN" "$ROOTDIR/sbin/reeg-engine"
mkdir -p "$ROOTDIR/work"

# Firecracker passes "console=ttyS0 reboot=k panic=1 pci=off" with NO init=, so the kernel execs
# /sbin/init. Make it a tiny script that mounts the pseudo-filesystems and becomes the agent.
# Alpine ships /sbin/init as a symlink to read-only busybox; remove it first so we write a fresh
# regular file instead of following the symlink onto busybox (EACCES).
rm -f "$ROOTDIR/sbin/init"
cat > "$ROOTDIR/sbin/init" <<'INIT'
#!/bin/sh
/bin/busybox mount -t proc     proc /proc     2>/dev/null
/bin/busybox mount -t sysfs    sys  /sys      2>/dev/null
/bin/busybox mount -t devtmpfs dev  /dev      2>/dev/null
# /work is a per-session tmpfs: the rootfs is mounted read-only (boot arg `ro`), so this is the
# only writable surface, and each VM's writes are RAM-resident and vanish with the VM (no
# cross-tenant bleed via the shared rootfs image). Fail hard if it cannot be mounted — a silent
# failure would leave the agent unable to write /work in confusing ways.
/bin/busybox mount -t tmpfs tmpfs /work || { echo "reeg guest init: FATAL tmpfs /work mount failed" >&2; exit 1; }
echo "reeg guest init: starting guest-agent on vsock port 52"
exec /sbin/reeg-engine guest-agent --port 52
INIT
chmod 0755 "$ROOTDIR/sbin/init"

# ---------------------------------------------------------------------------------------------
say "4. ext4 image for the FC tier (rootless via mke2fs -d)"
rm -f "$OUT/rootfs.ext4"
# -d populates the fs from a directory with no loop-mount; devtmpfs at boot provides /dev nodes.
mke2fs -F -q -t ext4 -L reeg-rootfs -d "$ROOTDIR" "$OUT/rootfs.ext4" "${IMG_SIZE_MB}M"
echo "rootfs.ext4: $(stat -c%s "$OUT/rootfs.ext4") bytes"

# ---------------------------------------------------------------------------------------------
say "5. Extracted root for the OCI tier"
rm -rf "$OUT/rootfs"
cp -a "$ROOTDIR" "$OUT/rootfs"
echo "oci rootfs: $OUT/rootfs ($(find "$OUT/rootfs" -maxdepth 1 | wc -l) top-level entries)"

# ---------------------------------------------------------------------------------------------
say "6. Env file"
cat > "$HOME/.reeg-fc.env" <<ENV
# Source this before running the phase-M / OCI tiers:  source ~/.reeg-fc.env
export REEG_FC_KERNEL="$OUT/vmlinux"
export REEG_FC_ROOTFS="$OUT/rootfs.ext4"
export REEG_OCI_ROOTFS="$OUT/rootfs"
export FIRECRACKER_BIN="$(command -v firecracker)"
ENV
cat "$HOME/.reeg-fc.env"

say "DONE"
echo "Next:"
echo "  source ~/.reeg-fc.env"
echo "  cd $REPO/engine"
echo "  cargo test -p reeg-runtime --features firecracker --test firecracker_session -- --test-threads=1"
echo "  cargo test -p reeg-runtime --features oci         --test oci_session         -- --test-threads=1"
