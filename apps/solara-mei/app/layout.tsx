import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SOLARA MEI",
  description: "Plataforma SaaS para jornada operacional e crescimento do MEI.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
