#!/usr/bin/env bash
# Publish the Reeg Move package to the active network and record the package id in
# config/<network>.json. Uses the active sui CLI address/keystore for signing.
#
#   REEG_NETWORK=testnet ./scripts/publish-package.sh
set -euo pipefail

NETWORK="${REEG_NETWORK:-testnet}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG="$ROOT/config/${NETWORK}.json"

echo "Publishing move/ to ${NETWORK} (active address: $(sui client active-address))"
OUT="$(sui client publish "$ROOT/move" --json)"

PKG="$(printf '%s' "$OUT" | node -e "
let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{
  const j=JSON.parse(s);
  if (j.effects?.status?.status !== 'success') { console.error('publish failed:', JSON.stringify(j.effects?.status)); process.exit(1); }
  const p=(j.objectChanges||[]).find(c=>c.type==='published');
  if(!p){console.error('no package id in objectChanges');process.exit(1);}
  process.stdout.write(p.packageId);
})")"

echo "packageId: $PKG"
node -e "
const fs=require('fs'); const f='$CONFIG';
const j=JSON.parse(fs.readFileSync(f,'utf8'));
j.reeg.packageId='$PKG';
fs.writeFileSync(f, JSON.stringify(j,null,2)+'\n');
console.log('updated '+f);
"
