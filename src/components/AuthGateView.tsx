import {
  AlertCircle,
  ArrowLeft,
  BookOpenCheck,
  CheckCircle2,
  Eye,
  EyeOff,
  Highlighter,
  Layers,
  Loader2,
  Lock,
  Mail,
  MailCheck,
  RefreshCw,
  ShieldCheck,
  User as UserIcon,
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { BrandLogo } from '@/src/components/BrandLogo';
import { SiteFooter } from '@/src/components/SiteFooter';
import { useAuth } from '@/src/contexts/AuthContext';
import { traduzirErroAuth } from '@/src/firebase';

type ModoAuth = 'login' | 'cadastro' | 'recuperar';

function GoogleIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
      />
    </svg>
  );
}

export const AuthGateView: React.FC = () => {
  const {
    user,
    emailVerificado,
    entrarComGoogle,
    entrarComEmail,
    criarContaComEmail,
    reenviarEmailVerificacao,
    verificarStatusEmail,
    enviarRecuperacaoSenha,
    sair,
  } = useAuth();

  const [modo, setModo] = useState<ModoAuth>(() => {
    if (typeof window !== 'undefined' && /cadastro|signup|criar-conta/i.test(window.location.pathname)) {
      return 'cadastro';
    }
    return 'login';
  });

  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);

  const [carregando, setCarregando] = useState(false);
  const [carregandoGoogle, setCarregandoGoogle] = useState(false);
  const [verificandoAgora, setVerificandoAgora] = useState(false);
  const [cooldownReenvio, setCooldownReenvio] = useState(0);

  const [erro, setErro] = useState<string | null>(null);
  const [avisoSucesso, setAvisoSucesso] = useState<string | null>(null);

  const aguardandoVerificacao = Boolean(user && !emailVerificado);

  useEffect(() => {
    if (cooldownReenvio <= 0) return;
    const timer = window.setInterval(() => {
      setCooldownReenvio((c) => (c > 0 ? c - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldownReenvio]);

  // Verifica automaticamente se o usuário já clicou no link de confirmação em outra aba
  useEffect(() => {
    if (!aguardandoVerificacao) return;

    const checar = () => {
      void verificarStatusEmail();
    };

    const interval = window.setInterval(checar, 4500);
    window.addEventListener('focus', checar);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', checar);
    };
  }, [aguardandoVerificacao, verificarStatusEmail]);

  const trocarModo = (novoModo: ModoAuth) => {
    setModo(novoModo);
    setErro(null);
    setAvisoSucesso(null);
  };

  const handleGoogle = async () => {
    setErro(null);
    setAvisoSucesso(null);
    setCarregandoGoogle(true);
    try {
      await entrarComGoogle();
    } catch (err) {
      setErro(traduzirErroAuth(err));
    } finally {
      setCarregandoGoogle(false);
    }
  };

  const handleSubmitLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    setAvisoSucesso(null);

    if (!email.trim() || !senha) {
      setErro('Preencha seu e-mail e sua senha.');
      return;
    }

    setCarregando(true);
    try {
      const usuario = await entrarComEmail(email, senha);
      if (!usuario.emailVerified) {
        setAvisoSucesso(
          'Sua conta ainda aguarda verificação de e-mail. Confirme o link enviado para liberar o acesso.'
        );
      }
    } catch (err) {
      setErro(traduzirErroAuth(err));
    } finally {
      setCarregando(false);
    }
  };

  const handleSubmitCadastro = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    setAvisoSucesso(null);

    // Filtro simples anti-bot (honeypot)
    if (honeypot.trim() !== '') {
      setErro('Não foi possível validar o envio do formulário.');
      return;
    }

    if (nome.trim().length < 2) {
      setErro('Informe seu nome completo (mínimo 2 caracteres).');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setErro('Informe um endereço de e-mail válido.');
      return;
    }
    if (senha.length < 6) {
      setErro('A senha precisa ter pelo menos 6 caracteres.');
      return;
    }
    if (senha !== confirmarSenha) {
      setErro('As senhas digitadas não coincidem.');
      return;
    }

    setCarregando(true);
    try {
      await criarContaComEmail(nome, email, senha);
      setCooldownReenvio(60);
      setAvisoSucesso(
        'Conta criada! Enviamos a verificação para o seu e-mail para confirmar que você não é spam ou bot.'
      );
    } catch (err) {
      setErro(traduzirErroAuth(err));
    } finally {
      setCarregando(false);
    }
  };

  const handleSubmitRecuperar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    setAvisoSucesso(null);

    if (!email.trim()) {
      setErro('Informe o e-mail da sua conta.');
      return;
    }

    setCarregando(true);
    try {
      await enviarRecuperacaoSenha(email);
      setAvisoSucesso(
        'Se existir uma conta com esse e-mail, enviamos um link para redefinir sua senha.'
      );
    } catch (err) {
      setErro(traduzirErroAuth(err));
    } finally {
      setCarregando(false);
    }
  };

  const handleChecarVerificacaoManual = async () => {
    setErro(null);
    setAvisoSucesso(null);
    setVerificandoAgora(true);
    try {
      const ok = await verificarStatusEmail();
      if (!ok) {
        setErro(
          'Ainda não identificamos a confirmação do seu e-mail. Abra o e-mail enviado (verifique também a caixa de Spam), clique no link de verificação e tente novamente.'
        );
      }
    } catch (err) {
      setErro(traduzirErroAuth(err));
    } finally {
      setVerificandoAgora(false);
    }
  };

  const handleReenviar = async () => {
    if (cooldownReenvio > 0) return;
    setErro(null);
    setAvisoSucesso(null);
    setCarregando(true);
    try {
      await reenviarEmailVerificacao();
      setCooldownReenvio(60);
      setAvisoSucesso('Novo e-mail de verificação enviado! Verifique sua caixa de entrada e Spam.');
    } catch (err) {
      setErro(traduzirErroAuth(err));
    } finally {
      setCarregando(false);
    }
  };

  return (
    <div className="app-shell-height flex flex-col overflow-y-auto bg-[var(--bg-canvas)] text-[var(--text-primary)]">
      <div className="mx-auto grid w-full flex-1 max-w-6xl grid-cols-1 lg:grid-cols-[1.05fr_1fr] items-center gap-8 px-4 py-8 sm:px-8 lg:gap-14">
        {/* Coluna de apresentação da plataforma */}
        <section className="hidden lg:flex flex-col justify-center space-y-8 pr-4">
          <BrandLogo size="xl" showWordmark wordmarkClassName="text-2xl" />

          <div className="grid grid-cols-1 gap-3.5 max-w-lg">
            <div className="flex items-start gap-3 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4">
              <BookOpenCheck className="mt-0.5 h-5 w-5 shrink-0 text-[var(--accent-primary)]" aria-hidden="true" />
              <div>
                <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                  Leitura isolada por artigo
                </h2>
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                  Importe códigos em PDF, DOCX ou texto e navegue sem distrações por títulos, capítulos e artigos.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4">
              <Highlighter className="mt-0.5 h-5 w-5 shrink-0 text-[var(--accent-primary)]" aria-hidden="true" />
              <div>
                <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                  Grifos estratégicos e anotações
                </h2>
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                  Marca-texto com legenda personalizável, comentários ancorados ao trecho e busca instantânea.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4">
              <Layers className="mt-0.5 h-5 w-5 shrink-0 text-[var(--accent-primary)]" aria-hidden="true" />
              <div>
                <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                  Revisão espaçada e flashcards
                </h2>
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                  Memorize prazos, exceções e jurisprudência no ritmo ideal de retenção.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
            <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            <span>Acesso protegido com autenticação verificada anti-spam e anti-bot.</span>
          </div>
        </section>

        {/* Coluna do formulário de Login / Cadastro / Verificação */}
        <section className="mx-auto w-full max-w-md">
          <div className="mb-6 flex justify-center lg:hidden">
            <BrandLogo size="lg" showWordmark wordmarkClassName="text-xl" />
          </div>

          <div className="rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6 sm:p-8 shadow-xl">
            {aguardandoVerificacao && user ? (
              /* Tela de Verificação de E-mail obrigatória antes de entrar */
              <div className="space-y-5">
                <div className="flex flex-col items-center text-center space-y-3">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--bg-subtle)] text-[var(--accent-primary)]">
                    <MailCheck className="h-7 w-7" aria-hidden="true" />
                  </div>
                  <div className="space-y-1">
                    <h2 className="text-xl font-semibold tracking-tight text-[var(--text-primary)]">
                      Verifique seu e-mail
                    </h2>
                    <p className="text-xs leading-relaxed text-[var(--text-muted)]">
                      Para garantir que esta conta não é spam ou bot, enviamos uma verificação para:
                    </p>
                  </div>
                  <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3.5 py-2 text-xs font-semibold text-[var(--text-primary)] break-all">
                    {user.email}
                  </div>
                </div>

                <div className="rounded-xl bg-[var(--bg-canvas)] p-3.5 text-xs leading-relaxed text-[var(--text-secondary)] space-y-1.5">
                  <p>1. Abra sua caixa de entrada (ou pasta de Spam / Promoções).</p>
                  <p>2. Clique no link de confirmação enviado pelo nosso sistema.</p>
                  <p>3. O acesso será liberado automaticamente — ou clique no botão abaixo.</p>
                </div>

                {erro && (
                  <div
                    role="alert"
                    className="flex items-start gap-2.5 rounded-xl border border-red-300 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
                  >
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{erro}</span>
                  </div>
                )}

                {avisoSucesso && (
                  <div
                    role="status"
                    className="flex items-start gap-2.5 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-xs text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200"
                  >
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{avisoSucesso}</span>
                  </div>
                )}

                <div className="space-y-2.5 pt-1">
                  <button
                    type="button"
                    onClick={handleChecarVerificacaoManual}
                    disabled={verificandoAgora}
                    className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent-primary)] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[var(--accent-hover)] disabled:opacity-60 cursor-pointer"
                  >
                    {verificandoAgora ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    )}
                    <span>Já verifiquei meu e-mail — Acessar site</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleReenviar}
                    disabled={carregando || cooldownReenvio > 0}
                    className="inline-flex min-h-[42px] w-full items-center justify-center gap-2 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-4 py-2 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] disabled:opacity-60 cursor-pointer"
                  >
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>
                      {cooldownReenvio > 0
                        ? `Reenviar verificação em ${cooldownReenvio}s`
                        : 'Reenviar e-mail de verificação'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setErro(null);
                      setAvisoSucesso(null);
                      void sair();
                    }}
                    className="inline-flex w-full items-center justify-center gap-1.5 py-2 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Usar outro e-mail ou voltar ao login</span>
                  </button>
                </div>
              </div>
            ) : modo === 'recuperar' ? (
              /* Recuperação de senha */
              <div className="space-y-5">
                <div className="space-y-1">
                  <button
                    type="button"
                    onClick={() => trocarModo('login')}
                    className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer mb-2"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                    Voltar para o login
                  </button>
                  <h2 className="text-xl font-semibold tracking-tight text-[var(--text-primary)]">
                    Recuperar senha
                  </h2>
                  <p className="text-xs text-[var(--text-muted)]">
                    Informe seu e-mail cadastrado para receber o link de redefinição.
                  </p>
                </div>

                {erro && (
                  <div
                    role="alert"
                    className="flex items-start gap-2.5 rounded-xl border border-red-300 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
                  >
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{erro}</span>
                  </div>
                )}

                {avisoSucesso && (
                  <div
                    role="status"
                    className="flex items-start gap-2.5 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-xs text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200"
                  >
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{avisoSucesso}</span>
                  </div>
                )}

                <form onSubmit={handleSubmitRecuperar} className="space-y-4">
                  <div>
                    <label
                      htmlFor="auth-email-reset"
                      className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5"
                    >
                      E-mail
                    </label>
                    <div className="relative">
                      <Mail
                        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"
                        aria-hidden="true"
                      />
                      <input
                        id="auth-email-reset"
                        type="email"
                        required
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="voce@exemplo.com"
                        className="w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-canvas)] py-2.5 pl-9 pr-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={carregando}
                    className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent-primary)] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[var(--accent-hover)] disabled:opacity-60 cursor-pointer"
                  >
                    {carregando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                    <span>Enviar link de recuperação</span>
                  </button>
                </form>
              </div>
            ) : (
              /* Login ou Criar Conta */
              <div className="space-y-5">
                <div className="grid grid-cols-2 rounded-xl bg-[var(--bg-subtle)] p-1">
                  <button
                    type="button"
                    onClick={() => trocarModo('login')}
                    className={`rounded-lg py-2 text-xs font-semibold transition-colors cursor-pointer ${
                      modo === 'login'
                        ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm'
                        : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    Entrar
                  </button>
                  <button
                    type="button"
                    onClick={() => trocarModo('cadastro')}
                    className={`rounded-lg py-2 text-xs font-semibold transition-colors cursor-pointer ${
                      modo === 'cadastro'
                        ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm'
                        : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    Criar conta
                  </button>
                </div>

                <div className="space-y-1">
                  <h2 className="text-xl font-semibold tracking-tight text-[var(--text-primary)]">
                    {modo === 'login' ? 'Acesse sua conta' : 'Crie sua conta'}
                  </h2>
                  <p className="text-xs text-[var(--text-muted)]">
                    {modo === 'login'
                      ? 'Entre para abrir sua biblioteca e retomar seus estudos.'
                      : 'Cadastre-se com Google ou e-mail verificado para começar.'}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleGoogle}
                  disabled={carregandoGoogle || carregando}
                  className="inline-flex min-h-[44px] w-full items-center justify-center gap-2.5 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-4 py-2.5 text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] disabled:opacity-60 cursor-pointer"
                >
                  {carregandoGoogle ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <GoogleIcon />
                  )}
                  <span>
                    {modo === 'login'
                      ? 'Entrar com conta Google'
                      : 'Criar conta com Google'}
                  </span>
                </button>

                <div className="relative flex items-center py-0.5">
                  <div className="flex-grow border-t border-[var(--border-hairline)]" />
                  <span className="mx-3 shrink-0 text-[11px] font-medium text-[var(--text-muted)]">
                    ou com e-mail e senha
                  </span>
                  <div className="flex-grow border-t border-[var(--border-hairline)]" />
                </div>

                {erro && (
                  <div
                    role="alert"
                    className="flex items-start gap-2.5 rounded-xl border border-red-300 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
                  >
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{erro}</span>
                  </div>
                )}

                {avisoSucesso && (
                  <div
                    role="status"
                    className="flex items-start gap-2.5 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-xs text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200"
                  >
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{avisoSucesso}</span>
                  </div>
                )}

                {modo === 'login' ? (
                  <form onSubmit={handleSubmitLogin} className="space-y-3.5">
                    <div>
                      <label
                        htmlFor="login-email"
                        className="block text-xs font-medium text-[var(--text-secondary)] mb-1"
                      >
                        E-mail
                      </label>
                      <div className="relative">
                        <Mail
                          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"
                          aria-hidden="true"
                        />
                        <input
                          id="login-email"
                          type="email"
                          required
                          autoComplete="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="voce@exemplo.com"
                          className="w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-canvas)] py-2.5 pl-9 pr-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label
                          htmlFor="login-senha"
                          className="block text-xs font-medium text-[var(--text-secondary)]"
                        >
                          Senha
                        </label>
                        <button
                          type="button"
                          onClick={() => trocarModo('recuperar')}
                          className="text-[11px] font-medium text-[var(--accent-primary)] hover:underline cursor-pointer"
                        >
                          Esqueci minha senha
                        </button>
                      </div>
                      <div className="relative">
                        <Lock
                          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"
                          aria-hidden="true"
                        />
                        <input
                          id="login-senha"
                          type={mostrarSenha ? 'text' : 'password'}
                          required
                          autoComplete="current-password"
                          value={senha}
                          onChange={(e) => setSenha(e.target.value)}
                          placeholder="Sua senha"
                          className="w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-canvas)] py-2.5 pl-9 pr-10 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                        />
                        <button
                          type="button"
                          onClick={() => setMostrarSenha((v) => !v)}
                          aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                        >
                          {mostrarSenha ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={carregando || carregandoGoogle}
                      className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent-primary)] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[var(--accent-hover)] disabled:opacity-60 cursor-pointer"
                    >
                      {carregando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                      <span>Entrar na plataforma</span>
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleSubmitCadastro} className="space-y-3.5">
                    {/* Campo honeypot invisível para bloqueio básico de bots */}
                    <input
                      type="text"
                      name="website"
                      value={honeypot}
                      onChange={(e) => setHoneypot(e.target.value)}
                      tabIndex={-1}
                      autoComplete="off"
                      aria-hidden="true"
                      className="hidden"
                    />

                    <div>
                      <label
                        htmlFor="cadastro-nome"
                        className="block text-xs font-medium text-[var(--text-secondary)] mb-1"
                      >
                        Nome completo
                      </label>
                      <div className="relative">
                        <UserIcon
                          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"
                          aria-hidden="true"
                        />
                        <input
                          id="cadastro-nome"
                          type="text"
                          required
                          autoComplete="name"
                          maxLength={120}
                          value={nome}
                          onChange={(e) => setNome(e.target.value)}
                          placeholder="Seu nome"
                          className="w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-canvas)] py-2.5 pl-9 pr-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                        />
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="cadastro-email"
                        className="block text-xs font-medium text-[var(--text-secondary)] mb-1"
                      >
                        E-mail
                      </label>
                      <div className="relative">
                        <Mail
                          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"
                          aria-hidden="true"
                        />
                        <input
                          id="cadastro-email"
                          type="email"
                          required
                          autoComplete="email"
                          maxLength={320}
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="voce@exemplo.com"
                          className="w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-canvas)] py-2.5 pl-9 pr-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                        />
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="cadastro-senha"
                        className="block text-xs font-medium text-[var(--text-secondary)] mb-1"
                      >
                        Senha (mínimo 6 caracteres)
                      </label>
                      <div className="relative">
                        <Lock
                          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"
                          aria-hidden="true"
                        />
                        <input
                          id="cadastro-senha"
                          type={mostrarSenha ? 'text' : 'password'}
                          required
                          minLength={6}
                          autoComplete="new-password"
                          value={senha}
                          onChange={(e) => setSenha(e.target.value)}
                          placeholder="Crie uma senha forte"
                          className="w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-canvas)] py-2.5 pl-9 pr-10 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                        />
                        <button
                          type="button"
                          onClick={() => setMostrarSenha((v) => !v)}
                          aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                        >
                          {mostrarSenha ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="cadastro-confirmar"
                        className="block text-xs font-medium text-[var(--text-secondary)] mb-1"
                      >
                        Confirmar senha
                      </label>
                      <div className="relative">
                        <Lock
                          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"
                          aria-hidden="true"
                        />
                        <input
                          id="cadastro-confirmar"
                          type={mostrarSenha ? 'text' : 'password'}
                          required
                          minLength={6}
                          autoComplete="new-password"
                          value={confirmarSenha}
                          onChange={(e) => setConfirmarSenha(e.target.value)}
                          placeholder="Repita sua senha"
                          className="w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-canvas)] py-2.5 pl-9 pr-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                        />
                      </div>
                    </div>

                    <div className="flex items-start gap-2 rounded-xl bg-[var(--bg-canvas)] p-3 text-[11px] leading-relaxed text-[var(--text-muted)]">
                      <ShieldCheck
                        className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-primary)]"
                        aria-hidden="true"
                      />
                      <span>
                        Verificação anti-spam: após o cadastro, enviaremos uma confirmação para o seu e-mail antes de liberar o acesso.
                      </span>
                    </div>

                    <button
                      type="submit"
                      disabled={carregando || carregandoGoogle}
                      className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent-primary)] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[var(--accent-hover)] disabled:opacity-60 cursor-pointer"
                    >
                      {carregando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                      <span>Criar conta e verificar e-mail</span>
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>
        </section>
      </div>
      <SiteFooter />
    </div>
  );
};
