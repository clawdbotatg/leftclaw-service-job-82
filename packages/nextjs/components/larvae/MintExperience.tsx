"use client";

import { useEffect, useMemo, useState } from "react";
import { Address as AddressView } from "@scaffold-ui/components";
import { formatEther, formatUnits } from "viem";
import { base } from "viem/chains";
import { useAccount, useBalance, useSwitchChain } from "wagmi";
import { LarvaeArt } from "~~/components/larvae/LarvaeArt";
import { RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth/useScaffoldReadContract";
import { useScaffoldWriteContract } from "~~/hooks/scaffold-eth/useScaffoldWriteContract";
import { notification } from "~~/utils/scaffold-eth";

const LARVAE_ADDRESS = "0x34A195f9284f6F5aaC6398A716BaE85Ba935E9E5" as const;

const formatNumber = (value: bigint, decimals = 18, fractionDigits = 2) => {
  const formatted = formatUnits(value, decimals);
  const num = Number(formatted);
  if (!Number.isFinite(num)) return formatted;
  if (num >= 1) {
    return num.toLocaleString(undefined, { maximumFractionDigits: fractionDigits });
  }
  return num.toLocaleString(undefined, { maximumFractionDigits: 4 });
};

export const MintExperience = () => {
  const { address: connectedAddress, chain: walletChain, isConnected } = useAccount();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const onWrongNetwork = isConnected && walletChain?.id !== base.id;

  const [quantity, setQuantity] = useState(1);

  // ---- contract reads ----
  const { data: totalMinted, refetch: refetchTotalMinted } = useScaffoldReadContract({
    contractName: "Larvae",
    functionName: "totalMinted",
  });
  const { data: mintActive } = useScaffoldReadContract({
    contractName: "Larvae",
    functionName: "mintActive",
  });
  const { data: mintPrice } = useScaffoldReadContract({
    contractName: "Larvae",
    functionName: "mintPrice",
  });
  const { data: clawdPerFreeMint } = useScaffoldReadContract({
    contractName: "Larvae",
    functionName: "clawdPerFreeMint",
  });
  const { data: clawdBalance, refetch: refetchClawd } = useScaffoldReadContract({
    contractName: "Clawd",
    functionName: "balanceOf",
    args: [connectedAddress],
  });
  const { data: clawdDecimals } = useScaffoldReadContract({
    contractName: "Clawd",
    functionName: "decimals",
  });
  const { data: freeQuota, refetch: refetchQuota } = useScaffoldReadContract({
    contractName: "Larvae",
    functionName: "freeMintQuotaOf",
    args: [connectedAddress],
  });
  const { data: quoteData } = useScaffoldReadContract({
    contractName: "Larvae",
    functionName: "quote",
    args: [connectedAddress, BigInt(quantity)],
  });
  const { data: walletEth } = useBalance({
    address: connectedAddress,
    chainId: base.id,
  });

  const { writeContractAsync, isMining } = useScaffoldWriteContract({ contractName: "Larvae" });

  // ---- derived ----
  const supplyTotal = 10000n;
  const mintedNum = totalMinted ?? 0n;
  const remainingSupply = supplyTotal > mintedNum ? supplyTotal - mintedNum : 0n;

  const mintPriceEth = mintPrice ? formatEther(mintPrice) : "0.069";
  const clawdThreshold = clawdPerFreeMint ? formatUnits(clawdPerFreeMint, Number(clawdDecimals ?? 18)) : "1000";

  const entitled = freeQuota ? freeQuota[0] : 0n;
  const remaining = freeQuota ? freeQuota[1] : 0n;
  const freeUsed = quoteData ? quoteData[0] : 0n;
  const paid = quoteData ? quoteData[1] : 0n;
  const cost = quoteData ? quoteData[2] : 0n;

  const maxThisTx = useMemo(() => {
    const cap = 50n;
    return remainingSupply < cap ? Number(remainingSupply) : 50;
  }, [remainingSupply]);

  // clamp quantity if remaining supply shrinks
  useEffect(() => {
    if (quantity > maxThisTx && maxThisTx > 0) setQuantity(maxThisTx);
    if (maxThisTx === 0 && quantity !== 0) setQuantity(0);
  }, [maxThisTx, quantity]);

  const insufficientEth = !!walletEth && walletEth.value < cost;
  const canMint =
    isConnected && !onWrongNetwork && !!mintActive && quantity > 0 && quantity <= maxThisTx && !insufficientEth;

  const mintLabel = !mintActive
    ? "Mint not yet open"
    : insufficientEth
      ? "Insufficient ETH"
      : `Mint ${quantity} larva${quantity === 1 ? "" : "e"}`;

  const handleMint = async () => {
    if (!canMint) return;
    try {
      const writePromise = writeContractAsync(
        {
          functionName: "mint",
          args: [BigInt(quantity)],
          value: cost,
        },
        {
          onBlockConfirmation: () => {
            notification.success(`Minted ${quantity} Larva${quantity === 1 ? "" : "e"}!`);
            refetchTotalMinted();
            refetchClawd();
            refetchQuota();
          },
        },
      );
      // writeAndOpen pattern (mobile): kick the wallet open ~2s after request fires
      if (typeof window !== "undefined" && /Mobi|Android/i.test(navigator.userAgent)) {
        setTimeout(() => {
          try {
            window.dispatchEvent(new Event("focus"));
          } catch {
            /* noop */
          }
        }, 2000);
      }
      await writePromise;
    } catch (err) {
      console.error("mint error", err);
    }
  };

  return (
    <div className="flex flex-col items-center grow w-full pt-10 pb-24 px-4">
      {/* Hero */}
      <section className="w-full max-w-5xl flex flex-col lg:flex-row gap-10 items-center justify-between">
        <div className="flex-1 min-w-0">
          <p className="pixel-tag mb-3">Bio-luminescent · Pixel-art · Base</p>
          <h1
            className="glow-text text-5xl md:text-6xl mb-4"
            style={{ fontFamily: "var(--font-pixel-display)", lineHeight: 1.05 }}
          >
            LARVAE
          </h1>
          <p className="text-lg opacity-90 max-w-xl">
            10,000 bio-luminescent pixel-art larvae on Base, gated by{" "}
            <span className="glow-text font-semibold">$CLAWD</span>.
          </p>

          <div className="grid grid-cols-3 gap-3 mt-8 max-w-xl">
            <div className="pixel-card p-4">
              <p className="pixel-tag opacity-80">Minted</p>
              <p className="text-2xl mt-1 font-bold">
                {Number(mintedNum).toLocaleString()}
                <span className="opacity-60 text-base"> / 10,000</span>
              </p>
            </div>
            <div className="pixel-card p-4">
              <p className="pixel-tag opacity-80">Mint price</p>
              <p className="text-2xl mt-1 font-bold">{mintPriceEth} ETH</p>
            </div>
            <div className="pixel-card p-4">
              <p className="pixel-tag opacity-80">Free per</p>
              <p className="text-2xl mt-1 font-bold">
                {Number(clawdThreshold).toLocaleString()}
                <span className="opacity-60 text-sm"> CLAWD</span>
              </p>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2 text-xs opacity-70">
            <span className="pixel-tag">Contract</span>
            <AddressView address={LARVAE_ADDRESS} format="short" />
          </div>
        </div>

        <div className="shrink-0">
          <LarvaeArt />
        </div>
      </section>

      {/* Mint banner / panel */}
      <section className="w-full max-w-3xl mt-12">
        {mintActive === false && (
          <div className="alert mb-6 bg-base-100 border border-warning/40 rounded-lg">
            <span className="pixel-tag" style={{ color: "#ffcf72" }}>
              Mint hasn&apos;t opened yet — owner must enable it.
            </span>
          </div>
        )}

        <div className="pixel-card p-6 md:p-8">
          {!isConnected ? (
            <div className="flex flex-col items-center gap-3">
              <p className="opacity-80 text-center">Connect your wallet to see your $CLAWD-based free-mint quota.</p>
              <RainbowKitCustomConnectButton />
            </div>
          ) : onWrongNetwork ? (
            <div className="flex flex-col items-center gap-3">
              <p className="opacity-80">Wrong network — Larvae mints on Base.</p>
              <button
                className="btn btn-primary"
                disabled={isSwitching}
                onClick={() => switchChain({ chainId: base.id })}
              >
                {isSwitching ? "Switching…" : "Switch to Base"}
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              {/* CLAWD balance + quota */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-base-200/60 rounded-md p-4 border border-base-300/50">
                  <p className="pixel-tag opacity-80">Your $CLAWD</p>
                  <p className="text-xl mt-1 font-bold">
                    {clawdBalance !== undefined
                      ? `${formatNumber(clawdBalance, Number(clawdDecimals ?? 18))} CLAWD`
                      : "—"}
                  </p>
                  <p className="text-xs opacity-60 mt-1">
                    1 free mint per {Number(clawdThreshold).toLocaleString()} CLAWD held.
                  </p>
                </div>
                <div className="bg-base-200/60 rounded-md p-4 border border-base-300/50">
                  <p className="pixel-tag opacity-80">Free mints</p>
                  <p className="text-xl mt-1 font-bold glow-text">{Number(remaining)} available</p>
                  <p className="text-xs opacity-60 mt-1">
                    {Number(entitled - remaining)} of {Number(entitled)} used (lifetime cap 20).
                  </p>
                </div>
              </div>

              {/* Quantity */}
              <div className="flex flex-col gap-2">
                <label className="pixel-tag">Quantity</label>
                <div className="flex items-center gap-3">
                  <button
                    className="btn btn-sm btn-secondary"
                    onClick={() => setQuantity(q => Math.max(1, q - 1))}
                    disabled={quantity <= 1}
                    aria-label="Decrease quantity"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    min={1}
                    max={maxThisTx}
                    className="input input-bordered w-24 text-center"
                    value={quantity}
                    onChange={e => {
                      const v = Number(e.target.value);
                      if (!Number.isFinite(v)) return;
                      setQuantity(Math.min(maxThisTx, Math.max(1, Math.floor(v))));
                    }}
                  />
                  <button
                    className="btn btn-sm btn-secondary"
                    onClick={() => setQuantity(q => Math.min(maxThisTx, q + 1))}
                    disabled={quantity >= maxThisTx}
                    aria-label="Increase quantity"
                  >
                    +
                  </button>
                  <button
                    className="btn btn-sm btn-ghost"
                    onClick={() => setQuantity(maxThisTx)}
                    disabled={maxThisTx <= 1 || quantity === maxThisTx}
                  >
                    Max ({maxThisTx})
                  </button>
                </div>
              </div>

              {/* Quote breakdown */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-md p-3 border border-base-300/50">
                  <p className="pixel-tag opacity-80">Free used</p>
                  <p className="text-lg font-bold glow-text">{Number(freeUsed)}</p>
                </div>
                <div className="rounded-md p-3 border border-base-300/50">
                  <p className="pixel-tag opacity-80">Paid</p>
                  <p className="text-lg font-bold">{Number(paid)}</p>
                </div>
                <div className="rounded-md p-3 border border-base-300/50">
                  <p className="pixel-tag opacity-80">Cost</p>
                  <p className="text-lg font-bold">{formatEther(cost)} ETH</p>
                </div>
              </div>

              {/* Mint button */}
              <button className="btn btn-primary btn-lg w-full" onClick={handleMint} disabled={!canMint || isMining}>
                {isMining ? "Confirming…" : mintLabel}
              </button>

              <p className="text-xs opacity-60 text-center">
                Wallet ETH: {walletEth ? `${Number(formatEther(walletEth.value)).toFixed(4)} ETH` : "—"} · Max per tx:
                50 · Remaining supply: {Number(remainingSupply)}
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
