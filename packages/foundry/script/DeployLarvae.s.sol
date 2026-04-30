// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./DeployHelpers.s.sol";
import { Larvae } from "../contracts/Larvae.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @notice Deploy script for the Larvae ERC-721 collection.
 * @dev Inherits ScaffoldETHDeploy which:
 *      - Includes forge-std/Script.sol for deployment
 *      - Includes ScaffoldEthDeployerRunner modifier
 *      - Provides `deployer` variable
 * Example:
 *   yarn deploy --file DeployLarvae.s.sol               # local anvil chain
 *   yarn deploy --file DeployLarvae.s.sol --network base
 */
contract DeployLarvae is ScaffoldETHDeploy {
    // Job 82 client (initial owner / royalty receiver). Override with the
    // LARVAE_OWNER env var when running tests or non-production deploys.
    address constant DEFAULT_OWNER = 0x68B8dD3d7d5CEdB72B40c4cF3152a175990D4599;

    // CLAWD ERC-20 on Base. Override with LARVAE_CLAWD env var if needed.
    address constant DEFAULT_CLAWD = 0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07;

    function run() external ScaffoldEthDeployerRunner {
        address initialOwner;
        try vm.envAddress("LARVAE_OWNER") returns (address envOwner) {
            initialOwner = envOwner;
        } catch {
            initialOwner = DEFAULT_OWNER;
        }

        address clawdAddr;
        try vm.envAddress("LARVAE_CLAWD") returns (address envClawd) {
            clawdAddr = envClawd;
        } catch {
            clawdAddr = DEFAULT_CLAWD;
        }

        string memory initialBaseURI = "";

        new Larvae(initialOwner, IERC20(clawdAddr), initialBaseURI);
    }
}
