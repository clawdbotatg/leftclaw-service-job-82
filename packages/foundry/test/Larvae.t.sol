// SPDX-License-Identifier: MIT
pragma solidity >=0.8.20 <0.9.0;

import "forge-std/Test.sol";
import { Larvae } from "../contracts/Larvae.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

contract MockClawd is ERC20 {
    constructor() ERC20("Clawd", "CLAWD") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract LarvaeTest is Test {
    Larvae internal larvae;
    MockClawd internal clawd;

    address internal owner = address(0xA11CE);
    address internal alice = address(0xBEEF);
    address internal bob = address(0xCAFE);

    uint256 internal constant CLAWD_PER_FREE = 1000 * 1e18;
    uint256 internal constant MINT_PRICE = 0.069 ether;

    function setUp() public {
        clawd = new MockClawd();
        larvae = new Larvae(owner, IERC20(address(clawd)), "");

        // Activate mint by default for most tests.
        vm.prank(owner);
        larvae.setMintActive(true);

        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
    }

    // --------------------------------------------------------------
    // Free-mint scaling
    // --------------------------------------------------------------

    function test_FreeMint_OneThousandClawd_GivesOneFree() public {
        clawd.mint(alice, 1_000 * 1e18);
        (uint256 entitled, uint256 remaining) = larvae.freeMintQuotaOf(alice);
        assertEq(entitled, 1, "1k CLAWD = 1 free");
        assertEq(remaining, 1);

        vm.prank(alice);
        larvae.mint(1);

        assertEq(larvae.balanceOf(alice), 1);
        assertEq(larvae.totalMinted(), 1);
        assertEq(larvae.freeMintsClaimed(alice), 1);
        assertEq(address(larvae).balance, 0, "free mint should not collect ETH");
    }

    function test_FreeMint_TwentyThousandClawd_Gives20Free() public {
        clawd.mint(alice, 20_000 * 1e18);
        (uint256 entitled,) = larvae.freeMintQuotaOf(alice);
        assertEq(entitled, 20);

        vm.prank(alice);
        larvae.mint(20);

        assertEq(larvae.balanceOf(alice), 20);
        assertEq(larvae.freeMintsClaimed(alice), 20);
    }

    function test_FreeMint_TwentyFiveThousandClawd_StillCappedAt20() public {
        clawd.mint(alice, 25_000 * 1e18);
        (uint256 entitled,) = larvae.freeMintQuotaOf(alice);
        assertEq(entitled, 20, "free mints cap at 20");

        // Minting 21 with no ETH should fail (the 21st is paid).
        vm.prank(alice);
        vm.expectRevert(Larvae.InsufficientPayment.selector);
        larvae.mint(21);

        // 21 with payment for the 21st works: 20 free + 1 paid.
        vm.prank(alice);
        larvae.mint{ value: MINT_PRICE }(21);

        assertEq(larvae.balanceOf(alice), 21);
        assertEq(larvae.freeMintsClaimed(alice), 20);
        assertEq(address(larvae).balance, MINT_PRICE);
    }

    // --------------------------------------------------------------
    // Paid mint
    // --------------------------------------------------------------

    function test_PaidMint_AtMintPrice() public {
        // bob holds no CLAWD, so all mints are paid.
        vm.prank(bob);
        larvae.mint{ value: MINT_PRICE }(1);

        assertEq(larvae.balanceOf(bob), 1);
        assertEq(larvae.freeMintsClaimed(bob), 0);
        assertEq(address(larvae).balance, MINT_PRICE);
    }

    function test_PaidMint_RefundsOverpayment() public {
        uint256 before = bob.balance;

        vm.prank(bob);
        larvae.mint{ value: 1 ether }(1);

        // Bob paid only MINT_PRICE; the rest was refunded.
        assertEq(bob.balance, before - MINT_PRICE);
        assertEq(address(larvae).balance, MINT_PRICE);
    }

    function test_PaidMint_RevertsOnUnderpayment() public {
        vm.prank(bob);
        vm.expectRevert(Larvae.InsufficientPayment.selector);
        larvae.mint{ value: MINT_PRICE - 1 }(1);
    }

    // --------------------------------------------------------------
    // Mixed (partial free + paid)
    // --------------------------------------------------------------

    function test_MixedMint_PartialFreeAndPaid() public {
        // Alice has 2k CLAWD => 2 free mints.
        clawd.mint(alice, 2_000 * 1e18);

        // She mints 5 total: 2 free + 3 paid = 3 * MINT_PRICE.
        uint256 expectedCost = 3 * MINT_PRICE;
        (uint256 freeUsed, uint256 paid, uint256 cost) = larvae.quote(alice, 5);
        assertEq(freeUsed, 2);
        assertEq(paid, 3);
        assertEq(cost, expectedCost);

        vm.prank(alice);
        larvae.mint{ value: expectedCost }(5);

        assertEq(larvae.balanceOf(alice), 5);
        assertEq(larvae.freeMintsClaimed(alice), 2);
        assertEq(address(larvae).balance, expectedCost);
    }

    function test_MixedMint_FreeQuotaIsLifetime() public {
        clawd.mint(alice, 2_000 * 1e18);

        // First call: take both free mints.
        vm.prank(alice);
        larvae.mint(2);
        assertEq(larvae.freeMintsClaimed(alice), 2);

        // Second call (still 2k CLAWD, but quota is exhausted): paid only.
        (, uint256 remaining) = larvae.freeMintQuotaOf(alice);
        assertEq(remaining, 0);

        vm.prank(alice);
        larvae.mint{ value: MINT_PRICE }(1);
        assertEq(larvae.balanceOf(alice), 3);
    }

    // --------------------------------------------------------------
    // MAX_SUPPLY enforcement
    // --------------------------------------------------------------

    function test_MaxSupply_RevertsWhenExceeded() public {
        // Cheaply set state instead of minting 10k tokens: write totalMinted
        // to MAX_SUPPLY - 1 via storage slot manipulation.
        // totalMinted is the 3rd public uint after mintPrice and clawdPerFreeMint.
        // Easier: do it via a large paid mint sequence at the limit.
        // Use vm.store on the slot of totalMinted.
        // Slot layout (public state, in declaration order in Larvae after
        // inherited contracts): we don't know inherited slots reliably, so
        // mint up to MAX_SUPPLY - 1 via repeated calls is too expensive.
        // Instead: simulate by setting totalMinted via a helper deployment
        // that mints all 10k at once, then attempt 1 more.

        // Mint exactly MAX_SUPPLY in batches paid by bob.
        uint256 max = larvae.MAX_SUPPLY();
        uint256 batch = 500;
        uint256 minted;
        while (minted < max) {
            uint256 q = max - minted < batch ? max - minted : batch;
            vm.deal(bob, q * MINT_PRICE);
            vm.prank(bob);
            larvae.mint{ value: q * MINT_PRICE }(q);
            minted += q;
        }

        assertEq(larvae.totalMinted(), max);

        // One more should revert.
        vm.deal(bob, MINT_PRICE);
        vm.prank(bob);
        vm.expectRevert(Larvae.MaxSupplyExceeded.selector);
        larvae.mint{ value: MINT_PRICE }(1);
    }

    function test_ZeroQuantity_Reverts() public {
        vm.prank(bob);
        vm.expectRevert(Larvae.ZeroQuantity.selector);
        larvae.mint(0);
    }

    function test_MintInactive_Reverts() public {
        vm.prank(owner);
        larvae.setMintActive(false);

        vm.prank(bob);
        vm.expectRevert(Larvae.MintInactive.selector);
        larvae.mint{ value: MINT_PRICE }(1);
    }

    // --------------------------------------------------------------
    // Owner-only gates
    // --------------------------------------------------------------

    function test_SetMintActive_OnlyOwner() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        larvae.setMintActive(false);
    }

    function test_SetMintPrice_OnlyOwner() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        larvae.setMintPrice(1 ether);

        vm.prank(owner);
        larvae.setMintPrice(1 ether);
        assertEq(larvae.mintPrice(), 1 ether);
    }

    function test_SetClawdPerFreeMint_OnlyOwner_AndNonZero() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        larvae.setClawdPerFreeMint(500 * 1e18);

        vm.prank(owner);
        vm.expectRevert(Larvae.ZeroAmount.selector);
        larvae.setClawdPerFreeMint(0);

        vm.prank(owner);
        larvae.setClawdPerFreeMint(500 * 1e18);
        assertEq(larvae.clawdPerFreeMint(), 500 * 1e18);
    }

    function test_SetBaseURI_OnlyOwner_AndTokenURI() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        larvae.setBaseURI("ipfs://bafy/");

        vm.prank(owner);
        larvae.setBaseURI("ipfs://bafy/");

        // Mint one and check tokenURI.
        vm.prank(bob);
        larvae.mint{ value: MINT_PRICE }(1);
        assertEq(larvae.tokenURI(0), "ipfs://bafy/0.json");
    }

    function test_TokenURI_EmptyBase_ReturnsEmpty() public {
        vm.prank(bob);
        larvae.mint{ value: MINT_PRICE }(1);
        assertEq(larvae.tokenURI(0), "");
    }

    function test_SetRoyalty_OnlyOwner() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        larvae.setRoyalty(alice, 100);

        vm.prank(owner);
        larvae.setRoyalty(bob, 250);

        (address receiver, uint256 amount) = larvae.royaltyInfo(0, 10_000);
        assertEq(receiver, bob);
        assertEq(amount, 250);
    }

    // --------------------------------------------------------------
    // Withdraw
    // --------------------------------------------------------------

    function test_Withdraw_OnlyOwner() public {
        vm.prank(bob);
        larvae.mint{ value: MINT_PRICE }(1);
        assertEq(address(larvae).balance, MINT_PRICE);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        larvae.withdraw(payable(alice));
    }

    function test_Withdraw_TransfersBalance() public {
        vm.prank(bob);
        larvae.mint{ value: MINT_PRICE }(1);

        address payable sink = payable(address(0xD15));
        uint256 before = sink.balance;

        vm.prank(owner);
        larvae.withdraw(sink);

        assertEq(sink.balance, before + MINT_PRICE);
        assertEq(address(larvae).balance, 0);
    }

    // --------------------------------------------------------------
    // Constructor / interface
    // --------------------------------------------------------------

    function test_Constructor_ZeroTokenReverts() public {
        vm.expectRevert(Larvae.ZeroAddressToken.selector);
        new Larvae(owner, IERC20(address(0)), "");
    }

    function test_SupportsInterface_ERC721_And_ERC2981() public view {
        // ERC721
        assertTrue(larvae.supportsInterface(0x80ac58cd));
        // ERC2981
        assertTrue(larvae.supportsInterface(0x2a55205a));
        // ERC165
        assertTrue(larvae.supportsInterface(0x01ffc9a7));
    }
}
