# Larvae — Job 82 Build (Partial Delivery)

## Live deployment
- Live URL: https://bafybeihj3ogc2y7l2ysdhctbwmzaxsleu4vp2nu633dwlrdlyxaqiz7i3q.ipfs.community.bgipfs.com/
- Admin panel: https://bafybeihj3ogc2y7l2ysdhctbwmzaxsleu4vp2nu633dwlrdlyxaqiz7i3q.ipfs.community.bgipfs.com/admin/

## What this is
A working ERC-721 mint dApp for the "Larvae" 10,000-PFP collection on Base mainnet, deployed and verified.

- Contract: [`0x34A195f9284f6F5aaC6398A716BaE85Ba935E9E5`](https://basescan.org/address/0x34A195f9284f6F5aaC6398A716BaE85Ba935E9E5#code)
- Network: Base (chain 8453)
- Owner: `0x68B8dD3d7d5CEdB72B40c4cF3152a175990D4599` (job client)
- $CLAWD token: `0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07`

## What's complete
- ERC-721 + ERC-2981 + Ownable contract (`Larvae.sol`) deployed on Base, Sourcify-verified
- CLAWD-gated free mint logic: `clawdPerFreeMint` x 1 = 1 free mint, capped at 20 per wallet
- 0.069 ETH paid mint when no CLAWD held (owner-adjustable)
- 5% royalty (ERC-2981) wired to the owner address; auto-follows ownership transfers
- Mint frontend (this app) with live CLAWD-balance quota, mint quantity selector, transaction tracking
- Owner control panel at `/admin` for setMintActive, setMintPrice, setClawdPerFreeMint, setBaseURI, setRoyalty, withdraw
- 27 passing Foundry tests covering all mint paths and access control

## What is NOT delivered: art generation must be commissioned separately

**Important: this build intentionally stops at the contract + mint dApp. Generating the 10,000 PFP artworks and their metadata is a substantial standalone project that needs its own commission, separate from this build job.**

### Why this is its own job

Producing a 10,000-PFP collection at the spec quality (24x24 pixel art upscaled to 1000x1000, 56-color CryptoPunks palette + bio-luminescent accents, 5 base larva types with the requested rarity distribution, multi-trait composition with trait pools for headwear/eyes/facial/mouth/accessories/hair/special, rarity tiers, glow effects on legendary) is itself a multi-week, multi-discipline project:

1. **Trait art creation.** Every distinct trait — every hat, every eye type, every special — has to be hand-drawn or commissioned as a pixel-art asset that matches the palette and outline rules. CryptoPunks-style collections typically use ~80-150 individual trait sprites across categories. Reproducing CryptoPunks' specific traits is also a copyright/IP concern; this collection should use original trait art that is "in the spirit of" the reference, not a copy.
2. **Composition pipeline.** Once trait sprites exist, an automated pipeline composites them per-token following the rarity weights, dedupe rules, and trait-conflict rules (e.g. "no glasses + VR helmet at the same time"). This is a custom script written against the specific trait set.
3. **Provenance + commitment.** A reveal-quality drop typically commits to the metadata-CID hash before mint opens (provenance hash) so collectors know the art was not curated post-mint. That requires the full collection to exist before mint goes live.
4. **Metadata generation.** 10,000 JSONs in OpenSea schema, one per token, with the right attributes array, image CID, name, description.
5. **IPFS pinning.** Pin both image directory and metadata directory to a durable IPFS service (Pinata, NFT.Storage, bgipfs, etc.) — long-lived pinning, not free-tier ephemeral storage.
6. **QA.** Eyeball every legendary, spot-check trait counts vs. the rarity table, verify metadata integrity.

This is typically a separate engagement with a pixel artist and a composition engineer. **Estimate scope realistically before commissioning** — assume weeks of work, not hours.

### What this bot can build

Once the artwork + metadata exist and are pinned to IPFS, this contract is ready to ship with no additional code work. Specifically the bot CAN do:
- Compose existing trait sprites if the client provides them (a follow-up job)
- Generate metadata JSONs from a trait-table CSV the artist produces
- Upload finished artwork + metadata to bgipfs and produce the baseURI string
- Wire up provenance hashing if the client wants reveal-style mechanics

### What the client must supply to go live with this contract

1. **10,000 pixel-art PNG images** matching the spec (24x24 upscaled to 1000x1000, 56-color CryptoPunks palette + bio-luminescent accents, transparent background, sharp pixels, 5 base larva types with distribution: Male 60% / Female 25% / Zombie 8% / Ape 5% / Alien 2%, traits in pools as described).
2. **10,000 metadata JSON files** following OpenSea schema (`name`, `description`, `image`, `attributes` array). One JSON per token id, named `0.json` ... `9999.json`.
3. **IPFS upload of both** — pin images and metadata to IPFS (any pinning service: Pinata, web3.storage, bgipfs, etc.).
4. **A baseURI string** of the form `ipfs://<METADATA_CID>/` (note the trailing slash — the contract appends `<tokenId>.json`).

Once supplied:
- Owner calls `setBaseURI("ipfs://<METADATA_CID>/")` from `/admin` or directly via Basescan.
- Owner calls `setMintActive(true)` to open public mint.
- Optionally adjusts `clawdPerFreeMint` to track $CLAWD/USD price changes (default = 1000 CLAWD = $1k assumes a $1/CLAWD reference; adjust as price moves).

## Known limitations & risks

### Flashloan free-mint drain (audit finding H-1)
The contract checks live `clawdToken.balanceOf(msg.sender)` at mint time. An attacker can flash-borrow >= 20,000 CLAWD, mint 20 free in one tx, and repay — repeating with fresh wallets to drain the entire 10k free supply at flashloan-fee cost.

**This is a real, exploitable vulnerability** when public mint is open. Recommended mitigations before flipping `mintActive=true`:
- Pre-mint to a snapshot of known long-term CLAWD holders, then enable public mint for paid-only.
- Or upgrade the contract to use a Merkle-allowlist of holders snapshotted at a past block.

The current build ships intentionally simple per the on-chain spec ("Enforce on-chain via $CLAWD token balance check at time of mint"). The audit report at `audits/contract-audit.md` documents the issue with severity.

### OpenSea collection page
This bot does not log into OpenSea. After the contract is verified and a few tokens are minted, OpenSea will auto-detect the collection. The client must:
- Visit https://opensea.io/collection/larvae (or the resolved slug) once tokens exist
- Sign in with the owner wallet
- Set: collection logo, banner, description, payment-token toggles, royalty info — OpenSea reads ERC-2981 royalty automatically

## Local development

```bash
yarn install
cd packages/nextjs && yarn dev
```

Visit http://localhost:3000 to use the mint UI against the live Base contract (`scaffold.config.ts` is set to `chains.base`).

## Static export (for IPFS)

```bash
cd packages/nextjs && yarn build
# output: packages/nextjs/out/
```

## Audit
See `audits/contract-audit.md` for the full pre-deploy contract audit report.
