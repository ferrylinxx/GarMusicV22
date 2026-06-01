import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gar Music V22",
  description: "Reproductor local de Gar Music"
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
