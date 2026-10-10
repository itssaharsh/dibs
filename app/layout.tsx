import type { Metadata, Viewport } from "next";
import { Archivo, Figtree, Spline_Sans_Mono } from "next/font/google";
import "./globals.css";

const archivo = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--font-archivo", display: "swap" });
const figtree = Figtree({ subsets: ["latin"], weight: ["400", "600", "700"], variable: "--font-figtree", display: "swap" });
const mono = Spline_Sans_Mono({ subsets: ["latin"], weight: ["500", "700"], variable: "--font-spline-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Dibs — a BOOK comment with a deposit behind it",
  description:
    "Dibs: a 'BOOK' comment with a deposit behind it. Ghost a seller and it pays them; pay on time and your deposit shrinks at every Dibs store.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#FFFFFF",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${archivo.variable} ${figtree.variable} ${mono.variable}`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
