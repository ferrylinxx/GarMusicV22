import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Gar Music V22",
    short_name: "Gar Music",
    description: "Reproductor local de Gar Music con calidad WAV",
    start_url: "/",
    display: "standalone",
    background_color: "#0b0d12",
    theme_color: "#0b0d12",
    orientation: "portrait-primary",
    categories: ["music", "entertainment"],
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any"
      },
      {
        src: "/artwork/cover.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any"
      },
      {
        src: "/artwork/cover.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable"
      }
    ]
  };
}
