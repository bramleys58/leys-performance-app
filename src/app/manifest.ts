import type { MetadataRoute } from "next";

// Lets athletes install the app to their home screen.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Leys Performance",
    short_name: "Leys",
    description: "Training, logging and progress for Leys Performance athletes.",
    start_url: "/",
    display: "standalone",
    background_color: "#0b0d10",
    theme_color: "#0b0d10",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
