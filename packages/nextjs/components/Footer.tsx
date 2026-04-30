import React from "react";

/**
 * Site footer — minimal Larvae branding, no SE-2 references.
 */
export const Footer = () => {
  return (
    <footer className="min-h-0 py-6 px-4 mt-12 border-t border-base-300/40">
      <div className="w-full flex justify-center items-center text-xs opacity-70">
        <span className="pixel-tag">Larvae · Built on Base · CLAWD-gated mints</span>
      </div>
    </footer>
  );
};
