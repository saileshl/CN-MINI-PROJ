import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";
import { SessionProvider } from "@/context/SessionContext";

export const metadata: Metadata = {
  title: "Network Jitter Measurement & Reduction System",
  description: "Real-time UDP network jitter measurement with application-level adaptive jitter buffer mitigation. Measure RTT, RTT variation, packet loss, and demonstrate jitter buffer effectiveness.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <SessionProvider>
          <nav className="nav">
            <Link href="/" className="nav-brand">
              ⚡ NetJitter
            </Link>
            <div className="nav-links">
              <Link href="/" className="nav-link">Dashboard</Link>
              <Link href="/setup" className="nav-link">Setup Agent</Link>
              <Link href="/results" className="nav-link">Results</Link>
            </div>
          </nav>
          <main style={{ position: 'relative', zIndex: 1 }}>
            {children}
          </main>
        </SessionProvider>
      </body>
    </html>
  );
}
