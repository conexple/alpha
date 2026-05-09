#!/usr/bin/env bash
# scripts/deploy-devnet.sh — idempotent devnet deployment driver.
#
# What it does:
#   1. anchor build (if needed) + anchor deploy --provider.cluster devnet
#   2. capture program IDs into Anchor.toml + .env
#   3. run scripts/init-network.ts to:
#       a. initialize_rules (conexple_protocol)
#       b. initialize_registry + register_oracle (conexple_oracle)
#       c. initialize_network (conexple_network)
#       d. initialize_pool (conexple_escrow)
#       e. mint demo USDC + airdrop to deployer
#
# Re-running is safe — each step short-circuits if state already exists.

set -euo pipefail

cd "$(dirname "$0")/.."

# --- pre-flight ---
if [ ! -f keys/devnet-deployer.json ]; then
  echo "Generating deployer keypair at keys/devnet-deployer.json..."
  mkdir -p keys
  solana-keygen new --no-bip39-passphrase -o keys/devnet-deployer.json --force
fi

solana config set --url devnet --keypair "$PWD/keys/devnet-deployer.json" >/dev/null

DEPLOYER=$(solana address)
echo "Deployer: $DEPLOYER"

BAL=$(solana balance --url devnet | awk '{print $1}' | sed 's/SOL//')
if (( $(echo "$BAL < 2" | bc -l) )); then
  echo "Airdropping 2 SOL to $DEPLOYER..."
  solana airdrop 2 --url devnet || true
fi

# --- build + deploy ---
echo "anchor build..."
anchor build

echo "anchor deploy --provider.cluster devnet..."
anchor deploy --provider.cluster devnet

# --- capture program IDs ---
echo "anchor keys list..."
anchor keys list | tee keys/program-ids.txt

# Update Anchor.toml + .env in-place would be nice, but for V1 we leave that
# as a manual `anchor keys sync` after first deploy. The IDs are also written
# into target/idl/*.json and target/deploy/*-keypair.json.

# --- init network ---
echo "Running init-network.ts..."
pnpm exec tsx scripts/init-network.ts

# --- mint demo USDC ---
echo "Running mint-demo-usdc.ts..."
pnpm exec tsx scripts/mint-demo-usdc.ts

echo ""
echo "===================================================="
echo "  Devnet deploy complete."
echo "  Run 'pnpm seed' to create demo merchant + 5 wallets."
echo "  Run 'pnpm smoke' to trigger one purchase end-to-end."
echo "===================================================="
