import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Central de Atendimento Axos",
  description: "Central de Atendimento Axos desenvolvida pela Axos Hub.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="theme-shell">{children}</body>
    </html>
  );
}
