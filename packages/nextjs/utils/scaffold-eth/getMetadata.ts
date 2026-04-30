import type { Metadata } from "next";

const rawProd = process.env.NEXT_PUBLIC_PRODUCTION_URL;
const baseUrl = rawProd
  ? rawProd.startsWith("http")
    ? rawProd
    : `https://${rawProd}`
  : process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : `http://localhost:${process.env.PORT || 3000}`;

const titleTemplate = "%s | Larvae";

export const getMetadata = ({
  title,
  description,
  imageRelativePath = "/og-image.jpg",
}: {
  title: string;
  description: string;
  imageRelativePath?: string;
}): Metadata => {
  const imageUrl = `${baseUrl}${imageRelativePath}`;

  return {
    metadataBase: new URL(baseUrl),
    title: {
      default: title,
      template: titleTemplate,
    },
    description,
    openGraph: {
      title,
      description,
      images: [imageUrl],
    },
    twitter: {
      title,
      description,
      images: [imageUrl],
    },
    icons: {
      icon: [{ url: "/favicon.png", sizes: "32x32", type: "image/png" }],
    },
  };
};
