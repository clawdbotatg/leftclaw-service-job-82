"use client";

import { useState } from "react";
import { AddressInput, Address as AddressView } from "@scaffold-ui/components";
import { formatEther, parseEther, parseUnits } from "viem";
import { base } from "viem/chains";
import { useAccount, useSwitchChain } from "wagmi";
import { RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth/useScaffoldReadContract";
import { useScaffoldWriteContract } from "~~/hooks/scaffold-eth/useScaffoldWriteContract";
import { notification } from "~~/utils/scaffold-eth";

const Section = ({
  title,
  current,
  children,
}: {
  title: string;
  current?: React.ReactNode;
  children: React.ReactNode;
}) => (
  <div className="pixel-card p-5 md:p-6 flex flex-col gap-3">
    <div className="flex items-center justify-between flex-wrap gap-2">
      <h3 className="pixel-tag !text-base">{title}</h3>
      {current && (
        <div className="text-sm opacity-80 font-mono">
          <span className="opacity-60">current:</span> {current}
        </div>
      )}
    </div>
    {children}
  </div>
);

export const AdminPanel = () => {
  const { address: connectedAddress, chain: walletChain, isConnected } = useAccount();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const onWrongNetwork = isConnected && walletChain?.id !== base.id;

  // ---- reads ----
  const { data: owner } = useScaffoldReadContract({
    contractName: "Larvae",
    functionName: "owner",
  });
  const { data: mintActive, refetch: refetchActive } = useScaffoldReadContract({
    contractName: "Larvae",
    functionName: "mintActive",
  });
  const { data: mintPrice, refetch: refetchPrice } = useScaffoldReadContract({
    contractName: "Larvae",
    functionName: "mintPrice",
  });
  const { data: clawdPerFreeMint, refetch: refetchClawdPer } = useScaffoldReadContract({
    contractName: "Larvae",
    functionName: "clawdPerFreeMint",
  });
  const { data: royaltyBps, refetch: refetchRoyalty } = useScaffoldReadContract({
    contractName: "Larvae",
    functionName: "royaltyBps",
  });
  const { data: totalMinted } = useScaffoldReadContract({
    contractName: "Larvae",
    functionName: "totalMinted",
  });
  // tokenURI(0) probes baseURI indirectly. If no token is minted yet it reverts;
  // treat that as "no preview yet".
  const { data: tokenZeroUri } = useScaffoldReadContract({
    contractName: "Larvae",
    functionName: "tokenURI",
    args: [0n],
  });

  const { writeContractAsync, isMining } = useScaffoldWriteContract({ contractName: "Larvae" });

  // ---- form state ----
  const [newPriceEth, setNewPriceEth] = useState("");
  const [newClawdPer, setNewClawdPer] = useState("");
  const [newBaseUri, setNewBaseUri] = useState("");
  const [royaltyReceiver, setRoyaltyReceiver] = useState("");
  const [royaltyFeeBps, setRoyaltyFeeBps] = useState("500");
  const [withdrawTo, setWithdrawTo] = useState("");

  const isOwner = !!owner && !!connectedAddress && owner.toLowerCase() === connectedAddress.toLowerCase();

  // ---------- early returns ----------
  if (!isConnected) {
    return (
      <div className="flex flex-col items-center grow w-full pt-16 pb-24 px-4">
        <div className="pixel-card p-8 max-w-md text-center">
          <h2 className="glow-text mb-3" style={{ fontFamily: "var(--font-pixel-display)" }}>
            Admin
          </h2>
          <p className="opacity-80 mb-4">Connect with the owner wallet to manage Larvae.</p>
          <RainbowKitCustomConnectButton />
        </div>
      </div>
    );
  }

  if (onWrongNetwork) {
    return (
      <div className="flex flex-col items-center grow w-full pt-16 pb-24 px-4">
        <div className="pixel-card p-8 max-w-md text-center">
          <h2 className="glow-text mb-3" style={{ fontFamily: "var(--font-pixel-display)" }}>
            Admin
          </h2>
          <p className="opacity-80 mb-4">Wrong network — Larvae is on Base.</p>
          <button className="btn btn-primary" disabled={isSwitching} onClick={() => switchChain({ chainId: base.id })}>
            {isSwitching ? "Switching…" : "Switch to Base"}
          </button>
        </div>
      </div>
    );
  }

  if (!isOwner) {
    return (
      <div className="flex flex-col items-center grow w-full pt-16 pb-24 px-4">
        <div className="pixel-card p-8 max-w-md text-center">
          <h2 className="glow-text mb-3" style={{ fontFamily: "var(--font-pixel-display)" }}>
            Not authorized
          </h2>
          <p className="opacity-80 mb-2">Connect with the owner wallet to manage Larvae.</p>
          {owner && (
            <div className="text-sm opacity-70 mt-3 flex flex-col items-center gap-1">
              <span className="pixel-tag">Owner</span>
              <AddressView address={owner} format="short" />
            </div>
          )}
        </div>
      </div>
    );
  }

  // ---------- handlers ----------
  const wrap = async (label: string, run: () => Promise<unknown>, refetch?: () => unknown) => {
    try {
      await run();
      if (refetch) await refetch();
      notification.success(`${label} updated`);
    } catch (err) {
      console.error(label, err);
    }
  };

  const handleToggleMint = () =>
    wrap(
      "mintActive",
      () =>
        writeContractAsync({
          functionName: "setMintActive",
          args: [!mintActive],
        }),
      refetchActive,
    );

  const handleSetPrice = () => {
    if (!newPriceEth) return;
    let value: bigint;
    try {
      value = parseEther(newPriceEth);
    } catch {
      notification.error("Invalid ETH amount");
      return;
    }
    return wrap("mintPrice", () => writeContractAsync({ functionName: "setMintPrice", args: [value] }), refetchPrice);
  };

  const handleSetClawdPer = () => {
    if (!newClawdPer) return;
    let value: bigint;
    try {
      // Whole-CLAWD units → wei (CLAWD has 18 decimals like most ERC-20s).
      value = parseUnits(newClawdPer, 18);
    } catch {
      notification.error("Invalid CLAWD amount");
      return;
    }
    if (value === 0n) {
      notification.error("Must be greater than 0");
      return;
    }
    return wrap(
      "clawdPerFreeMint",
      () => writeContractAsync({ functionName: "setClawdPerFreeMint", args: [value] }),
      refetchClawdPer,
    );
  };

  const handleSetBaseUri = () =>
    wrap("baseURI", () => writeContractAsync({ functionName: "setBaseURI", args: [newBaseUri] }));

  const handleSetRoyalty = () => {
    if (!royaltyReceiver) {
      notification.error("Receiver required");
      return;
    }
    const fee = Number(royaltyFeeBps);
    if (!Number.isFinite(fee) || fee < 0 || fee > 10000) {
      notification.error("Bps must be 0–10000");
      return;
    }
    return wrap(
      "royalty",
      () =>
        writeContractAsync({
          functionName: "setRoyalty",
          args: [royaltyReceiver as `0x${string}`, BigInt(fee)],
        }),
      refetchRoyalty,
    );
  };

  const handleWithdraw = () => {
    if (!withdrawTo) {
      notification.error("Recipient required");
      return;
    }
    return wrap("withdraw", () =>
      writeContractAsync({ functionName: "withdraw", args: [withdrawTo as `0x${string}`] }),
    );
  };

  return (
    <div className="flex flex-col items-center grow w-full pt-10 pb-24 px-4">
      <div className="w-full max-w-3xl">
        <h1 className="glow-text text-4xl mb-2" style={{ fontFamily: "var(--font-pixel-display)" }}>
          Admin
        </h1>
        <p className="opacity-70 mb-8 text-sm">
          Owner-only controls for the Larvae contract. Connected as{" "}
          <AddressView address={connectedAddress!} format="short" /> · Total minted: {Number(totalMinted ?? 0n)}
        </p>

        <div className="flex flex-col gap-4">
          <Section
            title="Mint active"
            current={
              <span
                className={`pixel-tag !text-sm ${mintActive ? "!text-success" : "!text-warning"}`}
                style={{ color: mintActive ? "#00ff9d" : "#ffcf72" }}
              >
                {mintActive ? "open" : "closed"}
              </span>
            }
          >
            <button className="btn btn-primary" disabled={isMining} onClick={handleToggleMint}>
              {mintActive ? "Close mint" : "Open mint"}
            </button>
          </Section>

          <Section title="Mint price" current={mintPrice !== undefined ? `${formatEther(mintPrice)} ETH` : "—"}>
            <div className="flex flex-col md:flex-row gap-3 items-stretch">
              <input
                className="input input-bordered flex-1"
                type="number"
                step="0.0001"
                min={0}
                placeholder="New mint price (ETH)"
                value={newPriceEth}
                onChange={e => setNewPriceEth(e.target.value)}
              />
              <button className="btn btn-primary" disabled={isMining || !newPriceEth} onClick={handleSetPrice}>
                Update price
              </button>
            </div>
          </Section>

          <Section
            title="CLAWD per free mint"
            current={
              clawdPerFreeMint !== undefined ? `${Number(clawdPerFreeMint / 10n ** 18n).toLocaleString()} CLAWD` : "—"
            }
          >
            <div className="flex flex-col md:flex-row gap-3 items-stretch">
              <input
                className="input input-bordered flex-1"
                type="number"
                min={1}
                placeholder="e.g. 1000"
                value={newClawdPer}
                onChange={e => setNewClawdPer(e.target.value)}
              />
              <button className="btn btn-primary" disabled={isMining || !newClawdPer} onClick={handleSetClawdPer}>
                Update threshold
              </button>
            </div>
            <p className="text-xs opacity-60">Whole-CLAWD units. Stored on-chain multiplied by 10^18.</p>
          </Section>

          <Section
            title="Base URI"
            current={
              <span className="font-mono text-xs break-all">
                {tokenZeroUri ? tokenZeroUri.toString().replace(/0\.json$/, "") : "—"}
              </span>
            }
          >
            <div className="flex flex-col md:flex-row gap-3 items-stretch">
              <input
                className="input input-bordered flex-1"
                type="text"
                placeholder="ipfs://<METADATA_CID>/"
                value={newBaseUri}
                onChange={e => setNewBaseUri(e.target.value)}
              />
              <button className="btn btn-primary" disabled={isMining || !newBaseUri} onClick={handleSetBaseUri}>
                Update baseURI
              </button>
            </div>
            <p className="text-xs opacity-60">
              Trailing slash matters — the contract appends <code>{"<tokenId>.json"}</code>.
            </p>
          </Section>

          <Section
            title="Royalty (ERC-2981)"
            current={royaltyBps !== undefined ? `${(Number(royaltyBps) / 100).toFixed(2)}%` : "—"}
          >
            <div className="flex flex-col gap-3">
              <AddressInput value={royaltyReceiver} onChange={setRoyaltyReceiver} placeholder="Receiver address" />
              <div className="flex flex-col md:flex-row gap-3 items-stretch">
                <input
                  className="input input-bordered flex-1"
                  type="number"
                  min={0}
                  max={10000}
                  placeholder="Fee (bps, 500 = 5%)"
                  value={royaltyFeeBps}
                  onChange={e => setRoyaltyFeeBps(e.target.value)}
                />
                <button className="btn btn-primary" disabled={isMining || !royaltyReceiver} onClick={handleSetRoyalty}>
                  Update royalty
                </button>
              </div>
            </div>
          </Section>

          <Section title="Withdraw">
            <div className="flex flex-col gap-3">
              <AddressInput value={withdrawTo} onChange={setWithdrawTo} placeholder="Recipient address" />
              <button className="btn btn-primary" disabled={isMining || !withdrawTo} onClick={handleWithdraw}>
                Withdraw all ETH
              </button>
            </div>
            <p className="text-xs opacity-60">Sends the contract&apos;s entire ETH balance to the recipient.</p>
          </Section>
        </div>
      </div>
    </div>
  );
};
