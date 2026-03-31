"use client";

import { useEffect, useRef, useState } from "react";
import { getSupabaseClient } from "../supabase-client";

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "forgot">("login");
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [signupOpen, setSignupOpen] = useState(false);
  const [signupLoading, setSignupLoading] = useState(false);
  const [signupError, setSignupError] = useState<string | null>(null);
  const [signupInfo, setSignupInfo] = useState<string | null>(null);
  const [signupClinicName, setSignupClinicName] = useState("");
  const [signupCnpj, setSignupCnpj] = useState("");
  const [signupPhone, setSignupPhone] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const ensureTenantRef = useRef(false);
  const emailInputRef = useRef<HTMLInputElement | null>(null);
  const normalizeEmail = (value: string) => value.trim().toLowerCase();

  const ensureTenant = async () => {
    if (ensureTenantRef.current) return;
    const client = getSupabaseClient();
    if (!client) return;
    const { data } = await client.auth.getSession();
    const accessToken = data.session?.access_token;
    if (!accessToken) return;
    ensureTenantRef.current = true;
    try {
      const response = await fetch("/api/tenants/ensure", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      const payload = await response.json().catch(() => null);
      if (payload?.created) {
        window.location.href = "/?onboarding=1";
        return;
      }
      window.location.href = "/";
    } catch {
      ensureTenantRef.current = false;
      setError("Não foi possível validar seu tenant agora.");
    }
  };

  useEffect(() => {
    ensureTenant();
  }, []);

  const handleLogin = async () => {
    setError(null);
    setInfo(null);
    setLoading(true);

    const client = getSupabaseClient();
    if (!client) {
      setError("Supabase não configurado. Preencha o .env.local.");
      setLoading(false);
      return;
    }

    try {
      const { error: signInError } = await client.auth.signInWithPassword({
        email: normalizeEmail(email),
        password,
      });

      if (signInError) {
        setError(signInError.message || "Email ou senha invalidos.");
        return;
      }

      await ensureTenant();
    } catch {
      setError("Nao foi possivel concluir o login.");
    } finally {
      setLoading(false);
    }
  };


  const handleSignUp = async () => {
    setSignupError(null);
    setSignupInfo(null);
    setSignupLoading(true);

    const normalizedEmail = normalizeEmail(signupEmail);
    if (!signupClinicName.trim()) {
      setSignupError("Informe o nome da clínica.");
      setSignupLoading(false);
      return;
    }
    if (!normalizedEmail || !signupPassword) {
      setSignupError("Preencha Email e Senha para se cadastrar.");
      setSignupLoading(false);
      return;
    }

    const client = getSupabaseClient();
    if (!client) {
      setSignupError("Supabase não configurado. Preencha o .env.local.");
      setSignupLoading(false);
      return;
    }

    try {
      const { error: signUpError } = await client.auth.signUp({
        email: normalizedEmail,
        password: signupPassword,
        options: {
          emailRedirectTo: `${window.location.origin}/login`,
          data: {
            tenant_name: signupClinicName.trim(),
            nome_real: signupClinicName.trim(),
            cnpj: signupCnpj.trim() || null,
            phone: signupPhone.trim() || null,
          },
        },
      });

      if (signUpError) {
        const message = signUpError.message || "Não foi possível criar sua conta.";
        setSignupError(message);
        return;
      }

      const successMessage = "Cadastro iniciado. Verifique seu email para confirmar.";
      setSignupInfo(successMessage);
    } catch {
      const message = "Nao foi possivel concluir o cadastro agora.";
      setSignupError(message);
    } finally {
      setSignupLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    setError(null);
    setInfo(null);
    setLoading(true);

    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) {
      setError("Informe seu Email para recuperar a senha.");
      emailInputRef.current?.focus();
      setLoading(false);
      return;
    }

    const client = getSupabaseClient();
    if (!client) {
      setError("Supabase não configurado. Preencha o .env.local.");
      setLoading(false);
      return;
    }

    try {
      const { error: resetError } = await client.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: `${window.location.origin}/login?reset=1`,
      });

      if (resetError) {
        const message =
          resetError.message || "Não foi possível enviar o email de recuperação.";
        setError(message);
        return;
      }

      const successMessage = "Enviamos um email para redefinir sua senha.";
      setInfo(successMessage);
    } catch {
      const message = "Nao foi possivel solicitar a recuperacao agora.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (mode === "login") {
      await handleLogin();
      return;
    }
    await handleForgotPassword();
  };

  const modeTitle = mode === "login" ? "Entrar na conta" : "Recuperar senha";

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="login-banner">
          <div className="login-banner-bar" aria-hidden="true">
            <img src="/login-logo.png" alt="Axos Hub" />
          </div>
        </div>
        <div className="login-brand">
          <div>
            <h1>Módulo de Recepção Digital</h1>
            <span className="login-brand-subtitle">Solara Connect</span>
          </div>
        </div>

        <p className="login-subtitle">{modeTitle}</p>

        <form className="login-form" onSubmit={handleSubmit}>
          <label>
            Email
            <input
              ref={emailInputRef}
              type="email"
              placeholder="Digite seu email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          {mode !== "forgot" ? (
            <label>
              Senha
              <div className="password-field">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="********"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
                <button
                  type="button"
                  className="ghost small"
                  onClick={() => setShowPassword((prev) => !prev)}
                >
                  {showPassword ? "Ocultar" : "Mostrar"}
                </button>
              </div>
            </label>
          ) : null}
          {error && <div className="login-error">{error}</div>}
          {info && <div className="login-info">{info}</div>}
          <button className="primary" type="submit" disabled={loading}>
            {loading
              ? "Processando..."
              : mode === "login"
                ? "Entrar"
                : "Enviar link"}
          </button>
          <div className="login-info">
            Use Login ou Esqueci senha. Para cadastro, clique em Cadastro.
          </div>
          <div className="login-links">
            <button
              type="button"
              className={`link-button ${mode === "login" ? "active" : ""}`}
              onClick={() => {
                setMode("login");
                setError(null);
                setInfo(null);
              }}
            >
              Login
            </button>
            <button
              type="button"
              className="link-button"
              onClick={() => {
                setSignupOpen(true);
                setSignupEmail(normalizeEmail(email));
                setSignupPassword("");
                setSignupClinicName("");
                setSignupCnpj("");
                setSignupPhone("");
                setSignupError(null);
                setSignupInfo(null);
              }}
            >
              Cadastro
            </button>
            <button
              type="button"
              className={`link-button ${mode === "forgot" ? "active" : ""}`}
              onClick={() => {
                setMode("forgot");
                setError(null);
                setInfo(null);
              }}
            >
              Esqueci senha
            </button>
          </div>
        </form>

        <div className="login-footer">
          <span>Desenvolvida pela Axos Hub</span>
          <a href="/">Voltar ao painel</a>
        </div>
      </div>

      <div className="login-aside">
        <h2>Operação unificada, atendimento rápido.</h2>
        <p>
          Organize equipe, recepção e cobranças em uma única central. Fluxos claros,
          acompanhamento em tempo real e controle total do atendimento.
        </p>
        <div className="login-highlights">
          <div>
            <strong>Kanban ativo</strong>
            <span>Priorize cada atendimento com visão simples.</span>
          </div>
          <div>
            <strong>Agenda integrada</strong>
            <span>Confirme e mova consultas sem friccao.</span>
          </div>
          <div>
            <strong>Financeiro</strong>
            <span>Visualize cobranças e status em segundos.</span>
          </div>
        </div>
      </div>

      {signupOpen ? (
        <div className="login-modal-backdrop" role="presentation">
          <div className="login-modal" role="dialog" aria-modal="true">
            <div className="login-modal-header">
              <div>
                <h2>Cadastro da clínica</h2>
                <p>Informe os dados para criar sua conta.</p>
              </div>
              <button
                type="button"
                className="ghost"
                onClick={() => setSignupOpen(false)}
              >
                Fechar
              </button>
            </div>
            <div className="login-modal-body">
              <label>
                Nome da clínica
                <input
                  type="text"
                  value={signupClinicName}
                  onChange={(event) => setSignupClinicName(event.target.value)}
                />
              </label>
              <label>
                CNPJ
                <input
                  type="text"
                  value={signupCnpj}
                  onChange={(event) => setSignupCnpj(event.target.value)}
                />
              </label>
              <label>
                Telefone
                <input
                  type="text"
                  value={signupPhone}
                  onChange={(event) => setSignupPhone(event.target.value)}
                />
              </label>
              <label>
                Email
                <input
                  type="email"
                  value={signupEmail}
                  onChange={(event) => setSignupEmail(event.target.value)}
                />
              </label>
              <label>
                Senha
                <input
                  type="password"
                  value={signupPassword}
                  onChange={(event) => setSignupPassword(event.target.value)}
                />
              </label>
              {signupError ? <div className="login-error">{signupError}</div> : null}
              {signupInfo ? <div className="login-info">{signupInfo}</div> : null}
            </div>
            <div className="login-modal-actions">
              <button
                className="primary"
                type="button"
                onClick={handleSignUp}
                disabled={signupLoading}
              >
                {signupLoading ? "Processando..." : "Criar cadastro"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

