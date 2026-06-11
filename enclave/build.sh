#!/usr/bin/env bash
# Build the Reeg attestation enclave into a Nitro .eif and record its measured PCRs.
#
#   ./enclave/build.sh            # build the .eif + write pcrs.json
#   ./enclave/build.sh --verify   # build twice and assert identical PCRs (reproducibility gate)
#
# Run on the AWS Nitro host (needs docker + nitro-cli). Writes reeg-enclave.eif and pcrs.json here.
set -euo pipefail
cd "$(dirname "$0")"

build_once() {
  # `--locked` requires Cargo.lock; generate it on first run.
  [ -f Cargo.lock ] || cargo generate-lockfile
  sudo systemctl start docker 2>/dev/null || true
  sudo docker build -q -t reeg-enclave:latest . >/dev/null
  sudo nitro-cli build-enclave --docker-uri reeg-enclave:latest \
    --output-file reeg-enclave.eif 2>/dev/null
}

if [ "${1:-}" = "--verify" ]; then
  echo "== build 1 =="; A="$(build_once)"
  P0A="$(printf '%s' "$A" | python3 -c 'import json,sys;print(json.load(sys.stdin)["Measurements"]["PCR0"])')"
  echo "PCR0 #1: $P0A"
  echo "== build 2 =="; B="$(build_once)"
  P0B="$(printf '%s' "$B" | python3 -c 'import json,sys;print(json.load(sys.stdin)["Measurements"]["PCR0"])')"
  echo "PCR0 #2: $P0B"
  [ "$P0A" = "$P0B" ] && echo "REPRODUCIBLE: PCR0 stable across builds" || { echo "NOT REPRODUCIBLE: PCR0 differs"; exit 1; }
  printf '%s' "$A" | python3 -c 'import json,sys;json.dump(json.load(sys.stdin)["Measurements"],open("pcrs.json","w"),indent=2)'
else
  OUT="$(build_once)"
  printf '%s\n' "$OUT"
  printf '%s' "$OUT" | python3 -c 'import json,sys;json.dump(json.load(sys.stdin)["Measurements"],open("pcrs.json","w"),indent=2)'
fi

echo "wrote $(pwd)/pcrs.json:"; cat pcrs.json
