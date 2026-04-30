"use client";

import dynamic from "next/dynamic";
import type { NextPage } from "next";

// Render the live mint UI only on the client. Wagmi/RainbowKit hooks pull
// connector state at module-load time and crash during a Next.js static-export
// prerender; gating the entire experience behind dynamic({ ssr: false })
// keeps it out of the server bundle.
const MintExperience = dynamic(() => import("~~/components/larvae/MintExperience").then(m => m.MintExperience), {
  ssr: false,
});

const Home: NextPage = () => <MintExperience />;

export default Home;
