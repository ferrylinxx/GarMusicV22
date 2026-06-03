import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gar Music V22",
  description: "Reproductor local de Gar Music con calidad WAV",
  applicationName: "Gar Music",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Gar Music"
  },
  icons: {
    icon: "/icon.svg",
    apple: "/artwork/cover.png"
  },
  formatDetection: {
    telephone: false
  }
};

export const viewport: Viewport = {
  themeColor: "#0b0d12",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
