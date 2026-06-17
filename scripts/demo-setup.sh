# Reeg demo setup — SOURCE this once before filming (do NOT execute it):
#
#     cd <your reeg clone>
#     export REEG_OPERATOR=0x<your address>      # owner; key in your Sui keystore, funded SUI+WAL
#     export REEG_GRANTEE=0x<teammate address>   # who you'll share with
#     export DEMO_SRC="/path/to/project/you/snapshot"   # optional; omit for a tiny sample
#     source scripts/demo-setup.sh
#
# ON CAMERA you then type only short commands:
#     reeg create
#     export M=0x<id it printed>
#     seed $M
#     reeg checkpoint $M --epochs 1
#     reeg verify $M
#   (teammate, on their machine:)  reeg restore $M --dest ./restored

REEG_DIR="${REEG_DIR:-$PWD}"

# --- connection fix: force fresh HTTP connections (avoids "read ECONNRESET" from stale
#     keep-alive sockets mid-checkpoint). Regenerate the preload with this machine's undici path. ---
UNDICI=$(find "$REEG_DIR/node_modules/.pnpm" -path "*/node_modules/undici/index.js" 2>/dev/null | head -1)
if [ -n "$UNDICI" ]; then
  cat > "$REEG_DIR/scripts/fresh-conn.mjs" <<EOF
import { setGlobalDispatcher, Agent } from '$UNDICI';
setGlobalDispatcher(new Agent({ keepAliveTimeout: 10, keepAliveMaxTimeout: 10, connections: 128 }));
EOF
fi

# `reeg` as a bare command, with the connection fix preloaded
alias reeg="NODE_OPTIONS='--import file://$REEG_DIR/scripts/fresh-conn.mjs' node $REEG_DIR/packages/cli/dist/index.js"

# environment — testnet, the ORIGINAL v1 package (Seal needs it), and an RPC set explicitly
# (some public RPCs reset on getNormalizedMoveFunction; the official fullnode serves it).
export REEG_ENGINE="$REEG_DIR/engine/target/debug/reeg-engine"
export REEG_NETWORK=testnet
export REEG_PACKAGE_ID=0x4c86e0c440c07c83c0b8372b90918f35380dc0a9ec830c77e0f172ff232b6f28
export REEG_RPC_URL=https://fullnode.testnet.sui.io:443
export REEG_HOME=/tmp/demo
export REEG_OPERATOR="${REEG_OPERATOR:-PUT-YOUR-OPERATOR-ADDRESS-HERE}"
export REEG_GRANTEE="${REEG_GRANTEE:-PUT-TEAMMATE-ADDRESS-HERE}"

# What to snapshot. Set DEMO_SRC=<your project> before sourcing; else a tiny sample is scaffolded.
if [ -z "${DEMO_SRC:-}" ]; then
  DEMO_SRC="$HOME/reeg-demo-project"
  mkdir -p "$DEMO_SRC/src"
  printf '# Portable Environment Demo\n\nThis whole working environment moves with one command.\n' > "$DEMO_SRC/README.md"
  printf 'export const hello = () => "this environment is portable";\n' > "$DEMO_SRC/src/index.ts"
fi
export DEMO_SRC

# seed <machineId>: copy DEMO_SRC into the environment's workdir, MINUS build artifacts + secrets.
# Walrus testnet can't take large blobs, so keep the snapshot small (aim < 5 MB).
seed() {
  local dest="$REEG_HOME/machines/$1/work"
  rsync -a \
    --exclude node_modules --exclude .git --exclude '.env' --exclude '.env.*' \
    --exclude build --exclude dist --exclude .expo --exclude .next --exclude .gradle \
    --exclude Pods --exclude .dart_tool --exclude DerivedData \
    --exclude '*.apk' --exclude '*.aab' --exclude '*.ipa' --exclude '*.so' \
    --exclude '*.dill' --exclude '*.wasm' --exclude '*.jar' --exclude '*.symbols' \
    --exclude '*.keystore' --exclude '*.jks' --exclude '*.p12' --exclude '*.p8' \
    --exclude '*.mobileprovision' --exclude local.properties --exclude '*.log' \
    "$DEMO_SRC/" "$dest/"
  echo "seeded $1 from: $DEMO_SRC  ($(du -sh "$dest" | cut -f1))"
  echo "   if that's more than ~5MB, point DEMO_SRC at a smaller subfolder (Walrus testnet struggles with big blobs)."
}

case "$REEG_OPERATOR" in
  PUT-*) echo "set REEG_OPERATOR and REEG_GRANTEE to your funded testnet addresses, then re-source." ;;
  *) echo "ready. snapshotting: $DEMO_SRC"; echo "on camera:  reeg create -> export M=<id> -> seed \$M -> reeg checkpoint \$M --epochs 1 -> reeg verify \$M" ;;
esac
