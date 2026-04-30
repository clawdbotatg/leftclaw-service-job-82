import { Press_Start_2P, VT323 } from "next/font/google";
import "@rainbow-me/rainbowkit/styles.css";
import "@scaffold-ui/components/styles.css";
import { ScaffoldEthAppWithProviders } from "~~/components/ScaffoldEthAppWithProviders";
import { ThemeProvider } from "~~/components/ThemeProvider";
import "~~/styles/globals.css";
import { getMetadata } from "~~/utils/scaffold-eth/getMetadata";

const pixelDisplay = Press_Start_2P({
  weight: "400",
  subsets: ["latin"],
  display: "swap",
  variable: "--font-pixel-display",
});

const pixelBody = VT323({
  weight: "400",
  subsets: ["latin"],
  display: "swap",
  variable: "--font-pixel-body",
});

export const metadata = getMetadata({
  title: "Larvae — bio-luminescent pixel-art larvae on Base",
  description: "10,000 unique pixel-art larvae. Hold $CLAWD to mint free.",
});

const ScaffoldEthApp = ({ children }: { children: React.ReactNode }) => {
  return (
    <html suppressHydrationWarning className={`${pixelDisplay.variable} ${pixelBody.variable}`} data-theme="dark">
      <body>
        <ThemeProvider enableSystem={false} defaultTheme="dark" forcedTheme="dark">
          <ScaffoldEthAppWithProviders>{children}</ScaffoldEthAppWithProviders>
        </ThemeProvider>
      </body>
    </html>
  );
};

export default ScaffoldEthApp;
