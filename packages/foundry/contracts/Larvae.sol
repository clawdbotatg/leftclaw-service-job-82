// SPDX-License-Identifier: MIT
pragma solidity >=0.8.20 <0.9.0;

import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import { ERC2981 } from "@openzeppelin/contracts/token/common/ERC2981.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { Strings } from "@openzeppelin/contracts/utils/Strings.sol";

/**
 * @title Larvae
 * @notice ERC-721 collection on Base. Holders of CLAWD ERC-20 receive a free
 *         mint allocation: one free mint per `clawdPerFreeMint` CLAWD held,
 *         capped at 20 free mints per wallet (lifetime). Additional mints cost
 *         `mintPrice` per token. Total supply is hard-capped at 10,000.
 */
/// @notice KNOWN LIMITATION: free-mint quota uses live `clawdToken.balanceOf(msg.sender)`.
/// An attacker can flash-borrow CLAWD, mint up to 20 free per wallet, and repay in the same tx.
/// To mitigate, owner SHOULD pre-mint to a known holder snapshot OR adopt a Merkle-allowlist
/// upgrade before enabling public mint. Mitigation tracked in repo README "Known Limitations".
contract Larvae is ERC721, ERC2981, Ownable, ReentrancyGuard {
    using Strings for uint256;

    // -----------------------------------------------------------------------
    // Constants
    // -----------------------------------------------------------------------

    uint256 public constant MAX_SUPPLY = 10_000;
    uint256 public constant MAX_FREE_MINTS_PER_WALLET = 20;
    uint256 public constant MAX_PER_TX = 50;

    // -----------------------------------------------------------------------
    // Storage
    // -----------------------------------------------------------------------

    IERC20 public immutable clawdToken;

    uint256 public mintPrice;
    uint256 public clawdPerFreeMint;
    uint256 public totalMinted;
    bool public mintActive;
    uint96 public royaltyBps;

    string private _baseTokenURI;

    mapping(address => uint256) public freeMintsClaimed;

    // -----------------------------------------------------------------------
    // Errors
    // -----------------------------------------------------------------------

    error MintInactive();
    error ZeroQuantity();
    error MaxSupplyExceeded();
    error InsufficientPayment();
    error ZeroAddressToken();
    error ZeroAmount();
    error WithdrawFailed();
    error RefundFailed();
    error ZeroAddressRecipient();
    error ExceedsMaxPerTx();

    // -----------------------------------------------------------------------
    // Events
    // -----------------------------------------------------------------------

    event Minted(address indexed to, uint256 quantity, uint256 freeUsed, uint256 paid);
    event MintPriceUpdated(uint256 newPrice);
    event ClawdPerFreeMintUpdated(uint256 newAmount);
    event MintActiveUpdated(bool active);
    event BaseURIUpdated(string newBaseURI);
    event Withdrawn(address indexed to, uint256 amount);

    // -----------------------------------------------------------------------
    // Constructor
    // -----------------------------------------------------------------------

    constructor(address initialOwner, IERC20 _clawdToken, string memory initialBaseURI)
        ERC721("Larvae", "LARVA")
        Ownable(initialOwner)
    {
        if (address(_clawdToken) == address(0)) revert ZeroAddressToken();

        clawdToken = _clawdToken;
        mintPrice = 0.069 ether;
        clawdPerFreeMint = 1000 * 1e18;
        _baseTokenURI = initialBaseURI;

        // Default royalty: 5% to initialOwner.
        royaltyBps = 500;
        _setDefaultRoyalty(initialOwner, 500);
    }

    // -----------------------------------------------------------------------
    // Views
    // -----------------------------------------------------------------------

    /**
     * @notice Returns the lifetime free mint entitlement and remaining quota
     *         for a wallet based on its current CLAWD balance.
     */
    function freeMintQuotaOf(address wallet) public view returns (uint256 entitled, uint256 remaining) {
        uint256 balance = clawdToken.balanceOf(wallet);
        uint256 raw = balance / clawdPerFreeMint;
        entitled = raw > MAX_FREE_MINTS_PER_WALLET ? MAX_FREE_MINTS_PER_WALLET : raw;

        uint256 claimed = freeMintsClaimed[wallet];
        remaining = entitled > claimed ? entitled - claimed : 0;
    }

    /**
     * @notice Quote the breakdown of a hypothetical mint of `quantity` tokens
     *         for `wallet`: how many would be free, how many paid, and the
     *         total ETH cost.
     */
    function quote(address wallet, uint256 quantity)
        public
        view
        returns (uint256 freeUsed, uint256 paid, uint256 cost)
    {
        (, uint256 remaining) = freeMintQuotaOf(wallet);
        freeUsed = quantity > remaining ? remaining : quantity;
        paid = quantity - freeUsed;
        cost = paid * mintPrice;
    }

    // -----------------------------------------------------------------------
    // Mint
    // -----------------------------------------------------------------------

    /**
     * @notice Mint `quantity` tokens to msg.sender. Free mint quota is
     *         consumed first; remaining tokens are charged at `mintPrice`.
     *         Overpayment is refunded.
     */
    function mint(uint256 quantity) external payable nonReentrant {
        if (!mintActive) revert MintInactive();
        if (quantity == 0) revert ZeroQuantity();
        if (quantity > MAX_PER_TX) revert ExceedsMaxPerTx();
        if (totalMinted + quantity > MAX_SUPPLY) revert MaxSupplyExceeded();

        (uint256 freeUsed, uint256 paid, uint256 cost) = quote(msg.sender, quantity);
        if (msg.value < cost) revert InsufficientPayment();

        // Effects.
        if (freeUsed > 0) {
            freeMintsClaimed[msg.sender] += freeUsed;
        }
        uint256 startId = totalMinted;
        totalMinted = startId + quantity;

        // Interactions.
        for (uint256 i = 0; i < quantity; i++) {
            _safeMint(msg.sender, startId + i);
        }

        // Refund any overpayment.
        uint256 refund = msg.value - cost;
        if (refund > 0) {
            (bool ok,) = msg.sender.call{ value: refund }("");
            if (!ok) revert RefundFailed();
        }

        emit Minted(msg.sender, quantity, freeUsed, paid);
    }

    // -----------------------------------------------------------------------
    // Owner controls
    // -----------------------------------------------------------------------

    function setMintActive(bool active) external onlyOwner {
        mintActive = active;
        emit MintActiveUpdated(active);
    }

    function setMintPrice(uint256 newPrice) external onlyOwner {
        mintPrice = newPrice;
        emit MintPriceUpdated(newPrice);
    }

    function setClawdPerFreeMint(uint256 newAmount) external onlyOwner {
        if (newAmount == 0) revert ZeroAmount();
        clawdPerFreeMint = newAmount;
        emit ClawdPerFreeMintUpdated(newAmount);
    }

    function setBaseURI(string calldata newBaseURI) external onlyOwner {
        _baseTokenURI = newBaseURI;
        emit BaseURIUpdated(newBaseURI);
    }

    function setRoyalty(address receiver, uint96 feeBps) external onlyOwner {
        if (receiver == address(0)) revert ZeroAddressRecipient();
        royaltyBps = feeBps;
        _setDefaultRoyalty(receiver, feeBps);
    }

    function withdraw(address payable to) external onlyOwner nonReentrant {
        if (to == address(0)) revert ZeroAddressRecipient();
        uint256 balance = address(this).balance;
        (bool ok,) = to.call{ value: balance }("");
        if (!ok) revert WithdrawFailed();
        emit Withdrawn(to, balance);
    }

    // -----------------------------------------------------------------------
    // Internal / overrides
    // -----------------------------------------------------------------------

    function _baseURI() internal view override returns (string memory) {
        return _baseTokenURI;
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        string memory base = _baseURI();
        if (bytes(base).length == 0) {
            return "";
        }
        return string.concat(base, tokenId.toString(), ".json");
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC2981) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    /// @dev Royalty receiver follows ownership. When ownership transfers to a non-zero
    ///      address, default royalty is re-set to the new owner using the current
    ///      `royaltyBps`. Renounce (newOwner == address(0)) intentionally leaves the
    ///      existing royalty receiver in place.
    function _transferOwnership(address newOwner) internal override {
        super._transferOwnership(newOwner);
        if (newOwner != address(0)) {
            _setDefaultRoyalty(newOwner, royaltyBps);
        }
    }
}
