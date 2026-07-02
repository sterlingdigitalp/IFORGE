import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Identity Forge",
  description: "Canonical character approval"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
