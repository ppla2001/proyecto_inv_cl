import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Plus_Jakarta_Sans } from "next/font/google";
import { AppNav } from "@/components/AppNav";
import "./globals.css";

const sans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Finanzas",
  description: "Dashboard personal de finanzas e inversiones",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body className={sans.variable}>
        <div className="app-shell">
          <AppNav />
          {children}
        </div>
      </body>
    </html>
  );
}
