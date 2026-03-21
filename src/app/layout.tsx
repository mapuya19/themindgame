import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "The Mind",
  description: "A cooperative card game of intuition and silence",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "The Mind",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" style={{ overflow: 'hidden' }}>
      <head>
        <meta name="theme-color" content="#0f0f1a" />
      </head>
      <body className={`${inter.className} bg-bg-primary min-h-screen overflow-hidden`}>
        {children}
      </body>
    </html>
  );
}
