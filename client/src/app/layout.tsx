import type { Metadata } from "next";
import { Nunito } from "next/font/google";
import "./globals.css";
import { DialogProvider } from "@/components/DialogProvider";

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
  weight: ["400", "600", "700", "800", "900"],
});

export const metadata: Metadata = {
  title: "NarraKids",
  description: "Aplikasi Kolaborasi Bikin Cerita Untuk Anak!",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${nunito.variable} font-nunito antialiased`}
      >
        <DialogProvider>
          {children}
        </DialogProvider>
      </body>
    </html>
  );
}
