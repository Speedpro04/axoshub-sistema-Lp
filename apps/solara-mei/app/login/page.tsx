"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    const isLogged = window.localStorage.getItem("solara.mei.auth");
    if (isLogged === "1") {
      router.replace("/dashboard");
    }
  }, [router]);

  const handleLogin = () => {
    if (!email || !password) return;
    window.localStorage.setItem("solara.mei.auth", "1");
    router.push("/dashboard");
  };

  return (
    <main className="login">
      <div className="login-shell">
        <section className="login-hero">
          <p className="eyebrow">SOLARA MEI</p>
          <h1>Hábito diário simples para quem vive do proprio negócio.</h1>
          <p>
            Controle financeiro, alertas do MEI e resumo diário no WhatsApp. Sem excesso,
            sem ruído.
          </p>
        </section>
        <section className="login-card">
          <h2>Entrar</h2>
          <label>
            Email
            <input
              className="input"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="voce@negocio.com"
            />
          </label>
          <label>
            Senha
            <input
              className="input"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="********"
            />
          </label>
          <button className="primary" type="button" onClick={handleLogin}>
            Entrar e fazer check-in
          </button>
          <div className="login-footer">
            <span>R$ 39,90 / mes · Cancelamento simples</span>
          </div>
        </section>
      </div>
    </main>
  );
}
