# Larvae Contract Audit — Job 82

**Auditor:** clawdbotatg (Stage 3 — read-only)
**Target:** `packages/foundry/contracts/Larvae.sol` (214 LOC)
**Deploy script:** `packages/foundry/script/DeployLarvae.s.sol`
**Tests:** `packages/foundry/test/Larvae.t.sol`
**Compiler:** `>=0.8.20 <0.9.0`
**Dependencies:** OpenZeppelin Contracts (ERC721, ERC2981, Ownable, ReentrancyGuard)

**Spec context:**
- 10,000-piece ERC-721 PFP collection on Base
- Symbol per spec: `LARVA`. Code uses `LARVAE`.
- 5% royalty
- Free mint scaling: 1k CLAWD = 1 free, linear up to 20k = 20 free (cap)
- 0.069 ETH per paid mint
- "Track free mints per wallet to prevent abuse"
- CLAWD: `0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07` on Base
- Initial owner (job client): `0x68B8dD3d7d5CEdB72B40c4cF3152a175990D4599`

---

## Critical

_No findings._

---

## High

### H-1 — Free mint allocation can be drained by flash-loaning CLAWD

- **Severity:** High
- **Location:** `Larvae.sol:94-101` (`freeMintQuotaOf`), called from `mint` via `quote` at `Larvae.sol:113-116`
- **Description:** Free-mint entitlement is computed as `clawdToken.balanceOf(wallet) / clawdPerFreeMint` at the moment of `mint`. There is no snapshot, time-lock, lock-up, or "must hold for N blocks" check. CLAWD is a transferable ERC-20, so an attacker can:
  1. Borrow ≥20,000 CLAWD via a flashloan (or CLAWD/WETH pool, or any DEX route, or a friendly lender)
  2. Call `Larvae.mint(20)` from the borrower wallet — `balanceOf` reads ≥20,000, entitled = 20, all 20 are free
  3. Repeat from a fresh wallet for another 20 free mints
  4. Repay the flashloan in the same tx
  Net cost: only flashloan fee + gas. The contract can be drained of all 10,000 free spots without anyone holding a single CLAWD past the block boundary.

  This is a literal contradiction of the on-chain spec: *"Track free mints per wallet to prevent abuse."* The lifetime cap of 20 per wallet is enforced (good), but there's no per-wallet identity binding to actual CLAWD ownership over time.

- **Impact:** The entire 10k-supply free-allocation can be siphoned by an attacker with one flashloan and 500 fresh wallets. Legitimate CLAWD holders end up with no free supply. Treasury collects zero ETH from the paid tier because the supply is gone.
- **Recommended fix:** At minimum, require CLAWD to have been held continuously for some duration. Options, in increasing rigor:
  1. **Snapshot** — Owner publishes a `merkleRoot` of `(wallet, balance)` taken from a past block; `mint` accepts a Merkle proof instead of reading `balanceOf` live. This is the standard PFP pattern and entirely sidesteps flashloans.
  2. **Hold-block check** — Require `block.number >= lastReceivedBlock[msg.sender] + N`, but this requires CLAWD to expose receive-block tracking (it does not — out of scope to retrofit).
  3. **Document the limitation explicitly** if no fix is desired: this should be a deliberate product decision, not an accident.

  The Stage 4 owner should pick option (1) unless the client explicitly accepts the flashloan risk in writing.

---

## Medium

### M-1 — Symbol mismatch with spec (`LARVAE` vs `LARVA`)

- **Severity:** Medium
- **Location:** `Larvae.sol:72` — `ERC721("Larvae", "LARVAE")`
- **Description:** Spec says `symbol: "LARVA"`. Code has `"LARVAE"`. ERC-721 symbol is immutable after deployment.
- **Impact:** Permanent on-chain spec deviation. Marketplaces will display the wrong symbol. Cannot be fixed post-deploy. This is exactly the kind of error that an audit catches before it becomes a 10-year embarrassment.
- **Recommended fix:** Change to `ERC721("Larvae", "LARVA")` before deploy. Confirm spelling with client if in any doubt — spec is unambiguous (`LARVA`).

### M-2 — Owner can grief paid minters by raising `mintPrice` between quote and mint

- **Severity:** Medium
- **Location:** `Larvae.sol:167-170` (`setMintPrice`), interaction with `Larvae.sol:128-156` (`mint`)
- **Description:** `mintPrice` is mutable by owner with no upper bound and no event-only behavior. A user calls `quote` off-chain, sees price = 0.069 ETH, sends `mint{value: 0.069 ether}(1)`. Owner front-runs with `setMintPrice(10 ether)`. User's tx reverts with `InsufficientPayment`, gas burned. (Refund-overpayment logic doesn't help in the *under*-pay direction.)

  Owner could also set `clawdPerFreeMint` to a much larger value mid-mint, deflating free quota of CLAWD holders.

- **Impact:** Centralization griefing risk. Not fund-loss, but a malicious or compromised owner can disrupt mints and degrade UX. Not a critical issue because the contract assumes a trusted owner (the job client), but worth flagging.
- **Recommended fix:**
  - Cheapest mitigation: emit existing events and trust client wallet hygiene (already done).
  - Stronger: lock `mintPrice` after `setMintActive(true)` — once mint is live, price is fixed. Or require a 2-step "price-change pending" with timelock.
  - Acceptable to leave as-is if client explicitly retains pricing flexibility for reveals/promotions; document in README.

### M-3 — `withdraw` does not validate `to`; ETH can be permanently locked

- **Severity:** Medium
- **Location:** `Larvae.sol:187-192`
- **Description:** `withdraw(payable to)` accepts any address, including `address(0)`. A `call{value: balance}` to `address(0)` succeeds on most EVMs (returns true, ETH is sent to zero), so the `WithdrawFailed` revert does NOT fire. The accumulated mint revenue is permanently lost.
- **Impact:** Single-keystroke fat-finger from owner = total revenue lost. Not exploitable by an attacker, but a real production foot-gun. The current test suite only exercises happy paths.
- **Recommended fix:** Add `if (to == address(0)) revert();` at top of `withdraw`. Define a `ZeroAddressRecipient` error for clarity. Trivial fix.

### M-4 — Royalty receiver does not follow ownership transfer

- **Severity:** Medium
- **Location:** `Larvae.sol:83` (constructor), `Larvae.sol:183-185` (`setRoyalty`)
- **Description:** `_setDefaultRoyalty(initialOwner, 500)` is called once in the constructor. If `transferOwnership` is later called (Ownable allows this), royalties continue flowing to the *old* owner address until someone explicitly calls `setRoyalty(newOwner, 500)`. The two roles are decoupled in implementation but coupled in user expectation.
- **Impact:** After ownership rotation (e.g. moving from EOA to a multisig, or selling the project), royalty income silently misroutes to a now-stale address. Possibly the worst place to discover this is six months in when ownership has been transferred and royalties have been accumulating into a dead address on a marketplace contract.
- **Recommended fix:** Override `transferOwnership` to also update the royalty receiver, OR document in the deployment checklist + README that ownership transfer must be paired with `setRoyalty`. The override is the safer path:
  ```solidity
  function transferOwnership(address newOwner) public override onlyOwner {
      super.transferOwnership(newOwner);
      _setDefaultRoyalty(newOwner, _royaltyBpsCurrent());
  }
  ```
  (Requires storing the current royalty bps locally since ERC2981 doesn't expose a read-back.)

### M-5 — `mintActive` defaults false but is not enforced in deploy script

- **Severity:** Medium
- **Location:** `DeployLarvae.s.sol:43`, `Larvae.sol:37`
- **Description:** `mintActive` is `false` at deploy. Deploy script does not turn it on, does not set baseURI, and does not transfer royalty receiver to a multisig. There's no operational checklist enforced by code or by README. A naive operator deploys and assumes they can mint.

  This is **defensive and probably correct** — but only if the operator knows there's a checklist. A deploy script that doesn't fire any post-deploy setters silently expects out-of-band configuration.

- **Impact:** Not a vulnerability per se. But "we deployed and the mint button doesn't work" is a real shipping incident on every PFP project that ever lived. Reveals tend to also have base-URI bugs.
- **Recommended fix:** Add a deploy-checklist comment at the top of `DeployLarvae.s.sol` enumerating the post-deploy steps the owner must run from their multisig (set baseURI, set royalty receiver if different, setMintActive). Optionally, also write these to a `DEPLOY_CHECKLIST.md`. (No code-level fix required; this is a process gap.)

---

## Low

### L-1 — Unbounded `quantity` per `mint` call risks block-gas-limit DoS for batch minters

- **Severity:** Low
- **Location:** `Larvae.sol:128-156` (loop at line 144)
- **Description:** The for-loop at `for (uint256 i = 0; i < quantity; i++) { _safeMint(...) }` has no upper bound on `quantity`. A user (or owner attempting a large airdrop) calling `mint(1000)` with sufficient ETH will likely revert with out-of-gas because each `_safeMint` does `onERC721Received` checking. Block gas limit on Base is ~30M; one ERC721 mint is roughly 70-90k gas, so practical limit is roughly ~300 per tx.
- **Impact:** No security risk (revert = no state change). UX issue: a user trying to mint a large batch sees an opaque OOG without knowing why. Not exploitable.
- **Recommended fix:** Add an explicit `MAX_PER_TX` constant (e.g. 50 or 100) and `if (quantity > MAX_PER_TX) revert ExceedsMaxPerTx();`. Self-documents the limit and gives a clean error.

### L-2 — `setRoyalty` allows zero-address receiver via OZ revert path only

- **Severity:** Low
- **Location:** `Larvae.sol:183-185`
- **Description:** `setRoyalty(address(0), bps)` is rejected, but only because `_setDefaultRoyalty` reverts in OZ ERC2981 with `ERC2981InvalidDefaultRoyaltyReceiver`. The Larvae wrapper does not validate inputs itself. Behavior is correct, but the revert reason will look opaque (custom error from a parent contract). Small UX issue.
- **Impact:** Cosmetic. Owner gets a `ERC2981InvalidDefaultRoyaltyReceiver(0x0)` revert instead of the more legible `ZeroAddressReceiver()`.
- **Recommended fix:** Optional — front the OZ check with an explicit guard for clarity. Skipping is acceptable.

### L-3 — `mint` for-loop uses pre-increment, costs 0 by default but unchecked block helps

- **Severity:** Low (gas)
- **Location:** `Larvae.sol:144`
- **Description:** `for (uint256 i = 0; i < quantity; i++)` — Solidity 0.8 has overflow checks enabled. Wrapping the increment in `unchecked { ++i; }` saves a few hundred gas per iteration and is safe (i can never overflow when bounded by `quantity ≤ MAX_SUPPLY`).
- **Impact:** Gas savings of roughly 60 gas/iter. Negligible per-tx, adds up over 10k mints.
- **Recommended fix:** Standard pattern:
  ```solidity
  for (uint256 i = 0; i < quantity;) {
      _safeMint(msg.sender, startId + i);
      unchecked { ++i; }
  }
  ```

### L-4 — `quote` is exposed publicly; harmless but marketing surface

- **Severity:** Low (info)
- **Location:** `Larvae.sol:108-117`
- **Description:** Public view, anyone can call. Useful for frontends. No issue.
- **Recommended fix:** None. Documented for completeness.

### L-5 — Refund happens *after* `_safeMint` loop; reentrancy guarded but ordering is suboptimal

- **Severity:** Low
- **Location:** `Larvae.sol:144-153`
- **Description:** Order of operations is: update `freeMintsClaimed` and `totalMinted` (effects) → `_safeMint` loop (interaction with receiver via `onERC721Received`) → refund via `call`. The `_safeMint` callbacks happen before the refund. `nonReentrant` correctly guards re-entry into `mint`, but a malicious receiver in `onERC721Received` *could* call other state-changing functions on Larvae (e.g. `quote` is view, but anything not-nonReentrant on the contract). Reviewing: only `mint` and `withdraw` are nonReentrant. Owner-only setters can't be called by a non-owner attacker. View functions are safe. So practically the ordering is fine.

  Strictly CEI-correct would be: effects → refund → `_safeMint` (so external calls happen last, and at that point all storage is final). But the refund-last pattern is acceptable here because all critical state is already updated and the only callable surface from `onERC721Received` is owner-gated.

- **Impact:** None known. Defense-in-depth recommendation only.
- **Recommended fix:** Either: (a) leave as-is and add a code comment explaining the ordering decision, or (b) move refund before the `_safeMint` loop. Both are acceptable; option (a) is fine.

### L-6 — Deploy script reads `vm.envAddress` with try/catch; silently falls through on malformed input

- **Severity:** Low
- **Location:** `DeployLarvae.s.sol:28-39`
- **Description:** If `LARVAE_OWNER` is set but malformed, foundry will revert and the catch block falls through to `DEFAULT_OWNER`. So a typo in the env var deploys with the wrong owner without warning. (Conversely: if env is unset, default is used — fine.)
- **Impact:** Operator misconfiguration risk. The deploy will go through "successfully" with the hardcoded default owner even if the operator intended a different one.
- **Recommended fix:** Distinguish "env unset" from "env malformed". The cleanest pattern is:
  ```solidity
  // If LARVAE_OWNER is explicitly empty string, use default; otherwise use env value (let it revert on bad input)
  ```
  Or just emit a `console.log` of the resolved owner before deploy so the operator can verify in the trace.

---

## Info

### I-1 — `mint` event lacks `cost` field

- **Location:** `Larvae.sol:60`, emitted at `Larvae.sol:155`
- **Description:** `Minted(to, quantity, freeUsed, paid)` — `paid` is the count of paid tokens, not the ETH amount paid. Indexers will need to multiply by `mintPrice` from the same block, which is fine but not self-contained.
- **Recommended:** Optional. Add `uint256 cost` to event to make indexing trivial.

### I-2 — `freeMintsClaimed` is public; consider `claimedOf(address)` getter

- **Location:** `Larvae.sol:41`
- **Description:** Auto-generated getter has the slightly awkward name `freeMintsClaimed(address)`. `claimedOf(address)` would be slightly nicer for frontend devex. Cosmetic.

### I-3 — `MintActive` state has no event-on-deploy

- **Location:** Constructor
- **Description:** Constructor sets `mintActive = false` (default zero value), but emits no `MintActiveUpdated(false)`. Indexers tracking the event stream see the first state change only when `setMintActive` is called. Not wrong, but slightly inconsistent.
- **Recommended:** Optional `emit MintActiveUpdated(false);` in constructor for symmetry.

### I-4 — `tokenURI` returns empty string before reveal; OpenSea behavior

- **Location:** `Larvae.sol:202-209`
- **Description:** Pre-reveal (when baseURI is empty), `tokenURI` returns `""`. OpenSea will display the token without metadata — no name, no image. This is intentional (avoids dummy metadata) and acceptable, as long as owner sets baseURI promptly after deploy.
- **Recommended:** Document the reveal flow in the deployment README. Optionally point to a placeholder ipfs metadata in the constructor.

### I-5 — `setMintPrice(0)` is allowed

- **Location:** `Larvae.sol:167-170`
- **Description:** Owner can set price to zero. Combined with `mintActive=true`, this enables 100% free claim by anyone. Probably intended as a sale-end behavior. Document or guard if not.
- **Recommended:** Either accept (if free-claim phase is a feature) or add `if (newPrice == 0) revert ZeroPrice();`.

### I-6 — No `ERC721Burnable` / no opt-out path

- **Description:** Holders cannot burn their NFT. Common for collectibles. Documented for completeness — no action.

### I-7 — Comment at `Larvae.sol:11-17` accurately describes spec

- Good. Keeps audit trail clear.

### I-8 — Solidity pragma is a range, not a fixed version

- **Location:** `Larvae.sol:2` — `pragma solidity >=0.8.20 <0.9.0;`
- **Description:** Slither/Aderyn-style audits often flag floating pragmas. SE-2 default — acceptable.

---

## Trace-level verifications (not findings, just confirmations)

- **`nonReentrant` on `mint`**: Confirmed. OZ `ReentrancyGuard._nonReentrantBefore` flips `_status` to `ENTERED` *before* the function body, so any reentry into `mint` (or `withdraw`) reverts with `ReentrancyGuardReentrantCall`. Good.
- **CEI ordering inside `mint`**: `freeMintsClaimed[msg.sender] += freeUsed;` and `totalMinted = startId + quantity;` happen *before* `_safeMint` and *before* refund — correct effects-then-interactions.
- **Off-by-one on supply**: `totalMinted + quantity > MAX_SUPPLY`. With `totalMinted=9999` and `quantity=1`, `10000 > 10000` is false → mint allowed. After: `totalMinted=10000`. Next call with any positive quantity fails. Boundary correct.
- **Lifetime free-mint cap**: `freeMintsClaimed[wallet]` is monotonically increasing, never decremented. Even with infinite CLAWD, post-20 free claims, `entitled - claimed = 20 - 20 = 0`. Cap enforced. Good. (But see H-1 for the per-wallet sybil bypass.)
- **`clawdPerFreeMint` cannot become 0**: Constructor sets `1000 * 1e18`, `setClawdPerFreeMint` reverts on 0. So `freeMintQuotaOf` cannot div-by-zero. Good.
- **ERC2981 fee cap**: OZ caps `feeNumerator` at `_feeDenominator() = 10000`, reverts with `ERC2981InvalidDefaultRoyalty` otherwise. Cannot set >100% royalty.
- **Constructor zero-address check**: CLAWD validated. `initialOwner == address(0)` is rejected by OZ Ownable's own check. Good.
- **Deploy script owner**: `DeployLarvae.s.sol:43` calls `new Larvae(initialOwner, ...)` where `initialOwner` defaults to the job client `0x68B8...4599`. Constructor passes through to `Ownable(initialOwner)` and `_setDefaultRoyalty(initialOwner, 500)`. Correct.
- **Refund recipient = `msg.sender`**: User can only grief themselves by being a contract that rejects ETH. They get a `RefundFailed` revert. Acceptable (their problem, not the contract's).
- **Refund inside `nonReentrant` scope**: Yes. The `call` happens before the function returns, so the guard is still ENTERED. Reentrant calls into `mint`/`withdraw` from the refund path would revert. Good.
- **Royalty bps**: 500 = 5%. Matches spec.
- **`baseURI` updateability**: Owner can change anytime. Standard PFP pattern (delayed reveal). Acceptable.

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High     | 1 |
| Medium   | 5 |
| Low      | 6 |
| Info     | 8 |

### Top priorities for Stage 4 (must-fix before deploy)

1. **H-1** — Decide on flashloan mitigation (Merkle snapshot strongly recommended) or document acceptance in writing
2. **M-1** — Fix symbol from `LARVAE` → `LARVA` (immutable post-deploy; trivial change pre-deploy)
3. **M-3** — Validate `to != address(0)` in `withdraw`
4. **M-4** — Decide on royalty/ownership coupling: either auto-update on transfer or document in checklist
5. **M-5** — Add deploy checklist (post-deploy: setBaseURI, setMintActive)

Lows L-1 and L-3 are quick wins. Info-level items are optional.

The contract is in solid shape overall — clean structure, proper use of OZ primitives, correct CEI inside `mint`, sensible event emissions, and a deploy script that correctly wires the job client as both owner and royalty recipient. The flashloan attack vector (H-1) is the only finding that could materially compromise the deliverable; everything else is hygiene.
