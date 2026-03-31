"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/financeiro", label: "Financeiro" },
  { href: "/clientes", label: "Clientes" },
  { href: "/configuracoes", label: "Configuracoes" },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">SOLARA</span>
          <small>MEI</small>
        </div>
        <nav className="sidebar-nav">
          {navItems.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-link ${active ? "active" : ""}`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <p>Plano ativo</p>
          <strong>R$ 39,90 / mes</strong>
        </div>
      </aside>
      <div className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">Uso diario</p>
            <h1>Controle simples e constante</h1>
          </div>
          <div className="topbar-actions">
            <Link className="ghost-button" href="/login">
              Sair
            </Link>
          </div>
        </header>
        <main className="main-content">{children}</main>
      </div>
    </div>
  );
}
