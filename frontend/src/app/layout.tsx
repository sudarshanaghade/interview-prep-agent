import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import Navbar from "./components/Navbar";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "AI Technical Interview Agent",
  description: "Resume-grounded real-time voice technical interview platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`dark h-full ${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="min-h-full flex flex-col bg-[#111111] text-[#ededed] antialiased font-sans">
        <Navbar />
        <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6">
          {children}
        </main>
      </body>
    </html>
  );
}

