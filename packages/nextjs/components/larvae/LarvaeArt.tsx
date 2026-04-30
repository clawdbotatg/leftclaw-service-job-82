/**
 * Pure-CSS pixel-art placeholder for the Larvae collection. The real PNGs are
 * not yet shipped (see README → "What is NOT delivered"); this is a
 * representative on-brand visual using the bio-luminescent palette.
 */
const PALETTE = {
  bg: "var(--color-larva-deep)",
  body: "var(--color-larva-violet)",
  glow: "var(--color-larva-glow)",
  shadow: "#14193a",
} as const;

// 8x8 grid; each cell is one of the colors above. "_" = bg.
const PIXELS = ["________", "__GG____", "_GGG____", "_GBBG___", "GBBBBG__", "_GBBBG__", "__GGG___", "___S____"];

const colorFor = (ch: string) => {
  switch (ch) {
    case "G":
      return PALETTE.glow;
    case "B":
      return PALETTE.body;
    case "S":
      return PALETTE.shadow;
    default:
      return PALETTE.bg;
  }
};

export const LarvaeArt = () => {
  return (
    <div className="larva-grid" aria-hidden>
      {PIXELS.flatMap((row, y) =>
        row.split("").map((ch, x) => (
          <div
            key={`${y}-${x}`}
            className="larva-pixel"
            style={{
              background: colorFor(ch),
              boxShadow:
                ch === "G" ? "0 0 6px rgba(0,255,157,0.85)" : ch === "B" ? "0 0 4px rgba(125,95,255,0.6)" : undefined,
            }}
          />
        )),
      )}
    </div>
  );
};
