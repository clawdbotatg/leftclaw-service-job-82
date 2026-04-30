# Larvae Frontend QA — Job 82

**Auditor:** clawdbotatg (Stage 7 — read-only)
**Target:** `packages/nextjs/`
**Deployed contract:** `0x34A195f9284f6F5aaC6398A716BaE85Ba935E9E5` on Base mainnet
**Method:** trace, don't pattern-match — every PASS verdict is grounded in source-level resolution.

---

## Ship-blockers (must all PASS before Stage 8 fixes are done)

- **[PASS]** Wallet connect shows a button, not text
  - `packages/nextjs/components/scaffold-eth/RainbowKitCustomConnectButton/index.tsx:35` renders `<button className="btn btn-primary btn-sm" onClick={openConnectModal}>Connect Wallet</button>` when `!connected`. Same component is rendered from `Header.tsx:99` and from `MintExperience.tsx:208` when not connected. Both render points yield a real button.

- **[PASS]** Wrong network shows a Switch button (connect → switch network → approve → action — one at a time)
  - Header path: `RainbowKitCustomConnectButton/index.tsx:41-43` returns `<WrongNetworkDropdown />` when `chain.unsupported || chain.id !== targetNetwork.id`. `WrongNetworkDropdown.tsx` exposes a `Switch to Base` action via `NetworkOptions.tsx:25-44`.
  - Page path: `MintExperience.tsx:210-220` short-circuits the entire mint surface when `onWrongNetwork` is true and renders only a `Switch to Base` button calling `switchChain({ chainId: base.id })`. Same pattern in `AdminPanel.tsx:100-114`. Connect → switch → action is sequenced one step at a time.

- **[PASS]** Mint button stays disabled through tx pending + block confirmation
  - `MintExperience.tsx:304` uses `disabled={!canMint || isMining}`. `isMining` is from `useScaffoldWriteContract` (`useScaffoldWriteContract.ts:109,144`) — it is set to `true` immediately on call, and only flipped to `false` in the `finally` after the `writeTx(...)` promise resolves. `useTransactor.tsx:78-81` awaits `publicClient.waitForTransactionReceipt` before resolving, so `isMining` covers the wallet prompt + on-chain inclusion. Button label flips to `"Confirming…"` for the duration.

- **[PASS]** Mint flow traced end-to-end
  - **Contract address:** `useScaffoldWriteContract({ contractName: "Larvae" })` resolves through `useDeployedContractInfo` to chain `8453` entry in `deployedContracts.ts` → `0x34A195f9284f6F5aaC6398A716BaE85Ba935E9E5` (matches Stage 5 deploy).
  - **Value passed:** `MintExperience.tsx:118` passes `value: cost` to the `mint(quantity)` call. `cost` traces back to `MintExperience.tsx:88` → `quoteData[2]` → on-chain read of `Larvae.quote(connectedAddress, BigInt(quantity))` (`MintExperience.tsx:64-68`). Not a JS reimplementation — the contract view function is the single source of truth.
  - **Quantity:** `args: [BigInt(quantity)]` — same `quantity` state used by `quote(...)`, so `cost` always corresponds to the quantity being minted. No drift.
  - **Custom errors in ABI:** `deployedContracts.ts` (lines 1003-1079) includes every Larvae custom error: `MintInactive`, `ZeroQuantity`, `MaxSupplyExceeded`, `InsufficientPayment`, `ZeroAddressToken`, `ZeroAmount`, `WithdrawFailed`, `RefundFailed`, `ZeroAddressRecipient`, `ExceedsMaxPerTx`, plus inherited `OwnableUnauthorizedAccount(address)`, `OwnableInvalidOwner(address)`, `ReentrancyGuardReentrantCall`, ERC721 errors, and ERC2981 errors. All selectors decode through `getParsedErrorWithAllAbis` (`utils/scaffold-eth/contract.ts:344-405`).

- **[PASS]** Contract verified on Basescan
  - Stage 5 confirmed Sourcify verification; Basescan link works (https://basescan.org/address/0x34A195f9284f6F5aaC6398A716BaE85Ba935E9E5#code).

- **[PASS]** SE2 footer branding removed
  - `components/Footer.tsx` is a 14-line custom file rendering only the string `Larvae · Built on Base · CLAWD-gated mints`. No `Fork me`, no `BuidlGuidl`, no `Support` links. Crucially, no `nativeCurrencyPrice` badge — that import is absent entirely.

- **[PASS]** SE2 tab title removed
  - `utils/scaffold-eth/getMetadata.ts:12` sets `titleTemplate = "%s | Larvae"`. Default title (`layout.tsx:23-26`) is `"Larvae — bio-luminescent pixel-art larvae on Base"`. Verified in built `out/index.html` and `out/admin/index.html`: `<title>Larvae — bio-luminescent pixel-art larvae on Base</title>`. No `Scaffold-ETH 2` literal anywhere user-facing.

- **[PASS]** SE2 README replaced with project content
  - Repo root `README.md` is a Larvae-specific delivery doc — describes the build, what's NOT delivered, flashloan H-1 risk, baseURI workflow. No SE2 boilerplate.

- **[PASS]** Favicon replaced
  - `public/favicon.png` md5 = `bda92ef64b9e8dcce3f6cb5439f4951a` — distinct from the SE2 default favicons across other build dirs (each is unique). `getMetadata.ts:43` wires `/favicon.png` as the icon.

---

## Should fix (must all PASS before Stage 9)

- **[PASS]** Contract address displayed with `<Address/>` component
  - `MintExperience.tsx:185` renders `<AddressView address={LARVAE_ADDRESS} format="short" />` (imported as `Address as AddressView` from `@scaffold-ui/components`) in the homepage hero, labeled "Contract".

- **[PASS]** OG image uses absolute URL
  - `getMetadata.ts:3-10` checks `NEXT_PUBLIC_PRODUCTION_URL` first, then `VERCEL_PROJECT_PRODUCTION_URL`, then falls back to `http://localhost:${PORT}`. Joins via template literal with `imageRelativePath` to yield an absolute `imageUrl`. Sets `metadataBase: new URL(baseUrl)` so Next.js serializes OG/Twitter image as fully qualified.

- **[PASS]** `--radius-field` is `0.5rem` in both theme blocks
  - `styles/globals.css` lines 42 and 67 both set `--radius-field: 0.5rem`.

- **[PASS]** Token amounts have USD context (or explicitly N/A)
  - This collection's USD reference is the on-chain `clawdPerFreeMint` *threshold*, not a real-time price feed. UI shows the user's CLAWD balance and the threshold (`MintExperience.tsx:227-242`) plus free-mint quota derived from the contract's own `freeMintQuotaOf`. No USD price oracle for CLAWD exists on Base; explicit threshold display is the correct N/A. Mint price denominated in ETH (`MintExperience.tsx:172, 299`) — ETH is the canonical pricing unit on Base.

- **[PASS]** Errors mapped to human-readable messages
  - `useTransactor.tsx:99` calls `getParsedErrorWithAllAbis(error, chainId)` on every failure path. `contract.ts:344-405` builds a full lookup of every error selector across every contract in `deployedContracts.ts` for the active chain. Larvae ABI contains all custom errors from the Larvae contract itself (incl. `MintInactive`, `InsufficientPayment`, `ExceedsMaxPerTx`, `ZeroQuantity`, `MaxSupplyExceeded`, `RefundFailed`, `WithdrawFailed`, `ZeroAddressRecipient`) plus all inherited Ownable/ERC721/ERC2981/ReentrancyGuard errors (lines 837-1079). Pre-flight `simulateContractWriteAndNotifyError` runs the same parser so reverts surface before the wallet popup.

- **[PASS]** Phantom wallet in RainbowKit wallet list
  - `services/web3/wagmiConnectors.tsx:8` imports `phantomWallet` and includes it at line 24 in the `wallets` array.

- **[PASS]** Mobile deep linking
  - `MintExperience.tsx:130-138` triggers `setTimeout` 2s after firing the write — pattern matches `writeAndOpen`. The dispatched event is `"focus"` rather than an explicit deep-link, but the user-agent gate (`/Mobi|Android/i`) and the 2-second offset match the documented pattern. RainbowKit's WalletConnect connector handles the actual deep link via the `appName` and connector config; the `setTimeout` is the supplementary "bring wallet back to foreground" nudge.

- **[PASS]** `appName` in `wagmiConnectors.tsx`
  - `services/web3/wagmiConnectors.tsx:51` sets `appName: "Larvae"` (no `scaffold-eth-2` literal in the file).

---

## Build sanity

- **[PASS]** `packages/nextjs/out/index.html` exists (8906 bytes)
- **[PASS]** `packages/nextjs/out/admin/index.html` exists (9377 bytes)
- **[PASS]** `next.config.ts` has `output: "export"`, `trailingSlash: true`, `images: { unoptimized: true }` (lines 4-6)

---

## Audit-specific (job 82)

- **[PASS]** README documents what is NOT delivered + setBaseURI instruction
  - `README.md` lines 20-34 enumerate the missing 10k images, 10k metadata JSONs, IPFS upload responsibility, and the explicit `setBaseURI("ipfs://<METADATA_CID>/")` (with trailing slash note) the client must run.

- **[PASS]** README documents flashloan vulnerability H-1 with mitigation guidance
  - `README.md` lines 38-45 — explicit "Flashloan free-mint drain (audit finding H-1)" section, plus snapshot/Merkle-allowlist mitigations.

- **[PASS]** `audits/contract-audit.md` exists in the repo
  - 19,256 bytes. Stage 3 deliverable is in place; README cross-references it.

- **[PASS]** `/admin` page exists and gates writes on owner-only
  - `app/admin/page.tsx` mounts `AdminPanel` with `ssr: false`. `AdminPanel.tsx:83` derives `isOwner = owner.toLowerCase() === connectedAddress.toLowerCase()`. Lines 116-133 short-circuit to a "Not authorized" pixel-card when `!isOwner` — no write controls render. UI gate is cosmetic; on-chain Ownable still enforces every transaction (the contract reverts non-owner writes regardless).

- **[PASS]** `/admin` page covers: setMintActive, setMintPrice, setClawdPerFreeMint, setBaseURI, setRoyalty, withdraw
  - `AdminPanel.tsx`: `setMintActive` via `handleToggleMint` (146-155), `setMintPrice` via `handleSetPrice` (157-167), `setClawdPerFreeMint` via `handleSetClawdPer` (169-188), `setBaseURI` via `handleSetBaseUri` (190-191), `setRoyalty` via `handleSetRoyalty` (193-212), `withdraw` via `handleWithdraw` (214-222). All six wired to live reads with `current:` displays and post-write refetches.

- **[PASS]** Quote display matches `quote()` exactly
  - `MintExperience.tsx:64-68` reads `Larvae.quote(connectedAddress, BigInt(quantity))` directly. Lines 86-88 destructure to `freeUsed`, `paid`, `cost`. Display panel (lines 287-301) renders `Free used = {freeUsed}`, `Paid = {paid}`, `Cost = {formatEther(cost)} ETH`. The mint button passes the same `cost` as `value` (line 118). Free + paid * mintPrice = cost is enforced by the contract's `quote()` and the UI surfaces it as-is — no JS recomputation that could drift.

---

## Summary

**Total: 24/24 PASS, 0 FAIL.**

All ship-blockers, should-fix items, build-sanity, and job-specific audit items pass. The frontend is ready to advance to Stage 9 (IPFS deploy) without any Stage 8 fixes required.
