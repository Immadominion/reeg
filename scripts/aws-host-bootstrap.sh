#!/usr/bin/env bash
# Bootstrap the Reeg AWS dev host (Amazon Linux 2023) into a Firecracker + OCI test bench.
#
# Run this ON the host, after `scripts/aws-dev-host.sh up && verify` reports KVM-OK:
#   scp -i ~/.ssh/reeg-dev scripts/*.sh ec2-user@<ip>:           # or rsync the repo
#   ssh reeg-host 'bash ~/aws-host-bootstrap.sh'
#
# It is idempotent: re-running only fills in what's missing. It installs the toolchain the
# Linux-gated tiers need (Rust + musl target, firecracker, runc, e2fsprogs, tar), confirms
# /dev/kvm is usable, then prints a readiness summary. It does NOT build the guest kernel or
# rootfs — that's build-fc-guest.sh, run next.
#
# Tunables (env): FIRECRACKER_VERSION (pinned), REPO_DIR (~/reeg), RUST_MIN (1.95).
set -euo pipefail

FIRECRACKER_VERSION="${FIRECRACKER_VERSION:-v1.13.1}"
REPO_DIR="${REPO_DIR:-$HOME/reeg}"
ARCH="$(uname -m)"   # x86_64 on c8i
BIN_DIR="/usr/local/bin"

say()  { printf '\n=== %s ===\n' "$*"; }
have() { command -v "$1" >/dev/null 2>&1; }
sudo_install() { sudo dnf install -y "$@" >/dev/null; }

say "0. Sanity: OS + KVM"
. /etc/os-release 2>/dev/null || true
echo "os: ${PRETTY_NAME:-unknown}  arch: $ARCH"
if [ -e /dev/kvm ]; then
  ls -l /dev/kvm
  if [ -r /dev/kvm ] && [ -w /dev/kvm ]; then
    echo "KVM-OK (/dev/kvm is read-write for $USER)"
  else
    echo "KVM present but NOT read-write for $USER. Granting via ACL..."
    sudo setfacl -m "u:${USER}:rw" /dev/kvm || sudo usermod -aG kvm "$USER" || true
    [ -r /dev/kvm ] && [ -w /dev/kvm ] && echo "KVM-OK now" \
      || echo "WARNING: still not rw — re-login or check nested virt; FC tests will SKIP silently."
  fi
else
  echo "ERROR: /dev/kvm missing. Instance was not launched with NestedVirtualization=enabled." >&2
  echo "Re-launch with scripts/aws-dev-host.sh (it sets --cpu-options NestedVirtualization=enabled)." >&2
  exit 1
fi

say "1. Base packages (dnf)"
# git/gcc/make: build deps. e2fsprogs: mke2fs for the rootfs image. e2tools: e2cp/e2mkdir to
# write into an ext4 image without loop-mounting (root). tar/cpio/util-linux: rootfs assembly.
sudo_install git gcc gcc-c++ make tar cpio util-linux e2fsprogs curl-minimal || \
  sudo_install git gcc gcc-c++ make tar cpio util-linux e2fsprogs
have e2cp || sudo_install e2tools || echo "note: e2tools not in repos; build-fc-guest.sh will loop-mount instead"
# musl C toolchain is best-effort: blake3's SIMD compiles via the system cc and links fine into
# a musl-static binary on same-arch, so this is usually optional. Install if available.
sudo_install musl-gcc 2>/dev/null || sudo_install musl-tools 2>/dev/null || \
  echo "note: musl-gcc not in repos (fine — same-arch static build usually works without it)"

say "2. runc (OCI tier)"
if have runc; then
  echo "runc present: $(runc --version | head -1)"
else
  sudo_install runc || {
    # Fallback: pull the static runc release directly.
    RUNC_VER="v1.2.6"
    echo "dnf has no runc; fetching $RUNC_VER static binary"
    sudo curl -fsSL -o "$BIN_DIR/runc" \
      "https://github.com/opencontainers/runc/releases/download/${RUNC_VER}/runc.amd64"
    sudo chmod +x "$BIN_DIR/runc"
  }
  echo "runc: $(runc --version | head -1)"
fi

say "3. firecracker $FIRECRACKER_VERSION"
if have firecracker && firecracker --version 2>/dev/null | grep -q "${FIRECRACKER_VERSION#v}"; then
  echo "firecracker present: $(firecracker --version | head -1)"
else
  case "$ARCH" in
    x86_64)  fc_arch="x86_64" ;;
    aarch64) fc_arch="aarch64" ;;
    *) echo "unsupported arch $ARCH" >&2; exit 1 ;;
  esac
  tmp="$(mktemp -d)"
  url="https://github.com/firecracker-microvm/firecracker/releases/download/${FIRECRACKER_VERSION}/firecracker-${FIRECRACKER_VERSION}-${fc_arch}.tgz"
  echo "downloading $url"
  curl -fsSL -o "$tmp/fc.tgz" "$url"
  tar -xzf "$tmp/fc.tgz" -C "$tmp"
  # Archive lays out release-<ver>-<arch>/{firecracker,jailer}-<ver>-<arch> (+ .debug companions).
  # Select the exact binaries, excluding the *.debug symbol files (else install sees 2 sources).
  fc_bin="$(find "$tmp" -type f -name "firecracker-${FIRECRACKER_VERSION}-${fc_arch}" ! -name '*.debug' | head -1)"
  jl_bin="$(find "$tmp" -type f -name "jailer-${FIRECRACKER_VERSION}-${fc_arch}"      ! -name '*.debug' | head -1)"
  [ -n "$fc_bin" ] || { echo "firecracker binary not found in archive" >&2; exit 1; }
  sudo install -m0755 "$fc_bin" "$BIN_DIR/firecracker"
  [ -n "$jl_bin" ] && sudo install -m0755 "$jl_bin" "$BIN_DIR/jailer" || true
  rm -rf "$tmp"
  echo "firecracker: $(firecracker --version | head -1)"
  have jailer && echo "jailer: $(jailer --version 2>&1 | head -1)" || echo "jailer: (not installed; only needed for hardening #14)"
fi

say "4. Rust toolchain (>= ${RUST_MIN:-1.95}, edition 2024) + musl target"
if ! have rustup; then
  echo "installing rustup (stable)"
  curl -fsSL https://sh.rustup.rs | sh -s -- -y --default-toolchain stable --profile minimal
fi
# shellcheck disable=SC1090
. "$HOME/.cargo/env"
rustup toolchain install stable >/dev/null 2>&1 || true
rustup default stable >/dev/null 2>&1 || true
rustup target add x86_64-unknown-linux-musl >/dev/null 2>&1 || true
echo "rustc: $(rustc --version)   cargo: $(cargo --version)"
echo "targets: $(rustup target list --installed | tr '\n' ' ')"

say "5. Repo"
if [ -d "$REPO_DIR/.git" ]; then
  echo "repo present at $REPO_DIR ($(git -C "$REPO_DIR" rev-parse --short HEAD 2>/dev/null || echo '?'))"
else
  echo "NOTE: repo not found at $REPO_DIR."
  echo "  rsync it from your Mac:  rsync -az --exclude target --exclude node_modules ./ reeg-host:reeg/"
  echo "  or git clone <remote> $REPO_DIR"
fi

say "READINESS SUMMARY"
printf '  %-14s %s\n' "kvm:"        "$([ -r /dev/kvm ] && [ -w /dev/kvm ] && echo OK || echo NOT-RW)"
printf '  %-14s %s\n' "firecracker:" "$(firecracker --version 2>/dev/null | head -1 || echo MISSING)"
printf '  %-14s %s\n' "runc:"        "$(runc --version 2>/dev/null | head -1 || echo MISSING)"
printf '  %-14s %s\n' "rustc:"       "$(rustc --version 2>/dev/null || echo MISSING)"
printf '  %-14s %s\n' "musl target:" "$(rustup target list --installed 2>/dev/null | grep -q musl && echo OK || echo MISSING)"
printf '  %-14s %s\n' "mke2fs:"      "$(have mke2fs && echo OK || echo MISSING)"
printf '  %-14s %s\n' "repo:"        "$([ -d "$REPO_DIR/.git" ] && echo "$REPO_DIR" || echo MISSING)"
echo
echo "Next: build the guest kernel + rootfs ->  bash scripts/build-fc-guest.sh   (from $REPO_DIR)"
