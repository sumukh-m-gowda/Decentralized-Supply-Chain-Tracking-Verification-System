import type { Metadata } from "next";
import "./globals.css";
import Nav from "@/components/Nav";
import { getSession } from "@/lib/auth";

export const metadata: Metadata = { title: "TraceLedger — supply chain verification", description: "Verify where a product has been and whether its record has been altered." };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&family=Schibsted+Grotesk:wght@400;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>
        <Nav session={session} />
        <main className="page">{children}</main>
      </body>
    </html>
  );
}
