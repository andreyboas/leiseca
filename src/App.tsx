import {
  AlertCircle,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  Download,
  Home,
  Info,
  Layers,
  Library,
  LogOut,
  Menu,
  MessageSquareText,
  Search,
  Settings,
  X,
} from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { TelaCarregando } from '@/src/components/BookLoader';
import { AuthGateView } from '@/src/components/AuthGateView';
import { BrandLogo } from '@/src/components/BrandLogo';
import { useAuth } from '@/src/contexts/AuthContext';
import { caminhoDaPagina, paginaDoCaminho } from '@/src/navigation';
import { ExportView } from '@/src/components/ExportView';
import { FlashcardsView } from '@/src/components/FlashcardsView';
import { GlobalSearchModal } from '@/src/components/GlobalSearchModal';
import { HomeDashboardView } from '@/src/components/HomeDashboardView';
import { LibraryView } from '@/src/components/LibraryView';
import { NotesDirectoryView } from '@/src/components/NotesDirectoryView';
import { OfflineIndicator } from '@/src/components/OfflineIndicator';
import { PWAInstallButton } from '@/src/components/PWAInstallButton';
import { ReaderView } from '@/src/components/ReaderView';
import { SettingsView } from '@/src/components/SettingsView';
import { SpacedReviewView } from '@/src/components/SpacedReviewView';
import { UploadVadeMecumModal } from '@/src/components/UploadVadeMecumModal';
import { type PaginaAtiva, useLeiSecaStore } from '@/src/store/useLeiSecaStore';
import { sanitizarUrlSegura } from '@/src/utils/security';

interface NavItem {
  id: PaginaAtiva;
  rotulo: string;
  icone: React.ComponentType<{ className?: string }>;
}

const TITULO_PADRAO = 'Lei Seca — Estudo de Legislação';

const ITENS_NAVEGACAO: NavItem[] = [
  { id: 'inicio', rotulo: 'Início', icone: Home },
  { id: 'biblioteca', rotulo: 'Biblioteca', icone: Library },
  { id: 'leitor', rotulo: 'Leitor', icone: BookOpen },
  { id: 'anotacoes', rotulo: 'Anotações', icone: MessageSquareText },
  { id: 'revisao', rotulo: 'Revisão', icone: CalendarClock },
  { id: 'flashcards', rotulo: 'Flashcards', icone: Layers },
  { id: 'exportar', rotulo: 'Exportar', icone: Download },
  { id: 'configuracoes', rotulo: 'Configurações', icone: Settings },
];

export default function App() {
  const {
    inicializado,
    pagina,
    toast,
    configuracao,
    inicializar,
    navegarPara,
    setBuscaGlobalAberta,
    alternarSidebarPrincipal,
    definirLarguraSidebarPrincipal,
    alternarModoFocoTotal,
    limparToast,
  } = useLeiSecaStore();

  const { user, authReady, emailVerificado, sair } = useAuth();
  const [menuMobileAberto, setMenuMobileAberto] = useState(false);
  const [uploadModalAberto, setUploadModalAberto] = useState(false);

  const prefs = configuracao.preferencias;
  const recolhida = !!prefs.sidebarPrincipalRecolhida;
  const larguraSalva = prefs.sidebarPrincipalLargura ?? 256;
  const modoFocoTotal = pagina === 'leitor' && !!prefs.modoFocoTotal;

  const [larguraTemp, setLarguraTemp] = useState(larguraSalva);
  const [redimensionando, setRedimensionando] = useState(false);
  const larguraRef = useRef(larguraSalva);

  useEffect(() => {
    setLarguraTemp(larguraSalva);
    larguraRef.current = larguraSalva;
  }, [larguraSalva]);

  useEffect(() => {
    inicializar();
  }, [inicializar]);

  // Endereço do navegador acompanha a seção: cada seção tem seu link e o botão voltar funciona
  const primeiroEnderecoRef = useRef(true);
  const conteudoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!authReady || !user || !emailVerificado) return;
    const alvo = caminhoDaPagina(pagina);
    if (window.location.pathname !== alvo) {
      if (primeiroEnderecoRef.current) {
        // Endereço desconhecido na abertura: corrige sem criar uma entrada extra no histórico
        window.history.replaceState({ pagina }, '', alvo);
      } else {
        window.history.pushState({ pagina }, '', alvo);
      }
    }
    primeiroEnderecoRef.current = false;
    conteudoRef.current?.scrollTo({ top: 0 });
  }, [authReady, user, emailVerificado, pagina]);

  // Botão voltar/avançar do navegador troca de seção
  useEffect(() => {
    const aoNavegar = () => {
      navegarPara(paginaDoCaminho(window.location.pathname) ?? 'inicio');
    };
    window.addEventListener('popstate', aoNavegar);
    return () => window.removeEventListener('popstate', aoNavegar);
  }, [navegarPara]);

  // Título da aba do navegador acompanha a seção atual (Início mantém o título padrão)
  useEffect(() => {
    if (!authReady || !user || !emailVerificado) {
      document.title = `Entrar — Lei Seca`;
      return;
    }
    const secao = ITENS_NAVEGACAO.find((i) => i.id === pagina);
    document.title =
      !secao || pagina === 'inicio' ? TITULO_PADRAO : `${secao.rotulo} — Lei Seca`;
  }, [authReady, user, emailVerificado, pagina]);

  // Atalho global Ctrl+B / Cmd+B para recolher/expandir barra lateral
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        if (window.innerWidth < 1024) {
          setMenuMobileAberto((v) => !v);
        } else {
          if (modoFocoTotal) {
            void alternarModoFocoTotal();
          } else {
            void alternarSidebarPrincipal();
          }
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [alternarSidebarPrincipal, alternarModoFocoTotal, modoFocoTotal]);

  const iniciarResizeSidebar = (e: React.MouseEvent) => {
    e.preventDefault();
    setRedimensionando(true);
    const onMouseMove = (ev: MouseEvent) => {
      const nova = Math.max(180, Math.min(360, ev.clientX));
      larguraRef.current = nova;
      setLarguraTemp(nova);
    };
    const onMouseUp = () => {
      setRedimensionando(false);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      void definirLarguraSidebarPrincipal(larguraRef.current);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const handleToggleMenu = () => {
    if (window.innerWidth < 1024) {
      setMenuMobileAberto((v) => !v);
    } else {
      void alternarSidebarPrincipal();
    }
  };

  const itemAtual = ITENS_NAVEGACAO.find((i) => i.id === pagina);

  if (!authReady || !inicializado) {
    return (
      <div className="app-shell-height flex items-center justify-center bg-[var(--bg-canvas)] text-sm text-[var(--text-muted)]">
        Carregando biblioteca e sessão...
      </div>
    );
  }

  if (!user || !emailVerificado) {
    return <AuthGateView />;
  }

  const nomeUsuario = user.displayName || user.email?.split('@')[0] || 'Estudante';
  const inicialUsuario = nomeUsuario.trim().charAt(0).toUpperCase() || 'E';
  const avatarUrlSeguro = sanitizarUrlSegura(user.photoURL);

  return (
    <div className="app-shell-height flex w-full overflow-hidden bg-[var(--bg-canvas)] text-[var(--text-primary)]">
      {/* Sidebar Desktop retrátil e redimensionável */}
      {!modoFocoTotal && (
        <aside
          aria-label="Navegação principal"
          style={{
            width: recolhida ? 0 : `${larguraTemp}px`,
          }}
          className={`print-hidden relative hidden lg:flex shrink-0 flex-col bg-[var(--bg-surface)] overflow-hidden ${
            recolhida ? 'border-r-0' : 'border-r border-[var(--border-hairline)]'
          } ${redimensionando ? '' : 'transition-[width] duration-200 ease-out'}`}
        >
          <div
            style={{ width: `${larguraTemp}px` }}
            className="flex h-full flex-col"
          >
            <div className="flex h-14 items-center justify-between border-b border-[var(--border-hairline)] px-4">
              <button
                type="button"
                onClick={() => navegarPara('inicio')}
                title="Voltar para o Início"
                aria-label="Voltar para o início"
                className="inline-flex items-center rounded-lg py-1 hover:opacity-85 transition-opacity cursor-pointer"
              >
                <BrandLogo size="md" showWordmark wordmarkClassName="text-base whitespace-nowrap" />
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto p-3 space-y-1">
              {ITENS_NAVEGACAO.map((item) => {
                const Icone = item.icone;
                const ativo = pagina === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => navegarPara(item.id)}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
                      ativo
                        ? 'bg-[var(--bg-subtle)] text-[var(--text-primary)]'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]/60 hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <Icone className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="truncate">{item.rotulo}</span>
                  </button>
                );
              })}
            </nav>

            <div className="border-t border-[var(--border-hairline)] p-3 space-y-2.5">
              <button
                type="button"
                onClick={() => setBuscaGlobalAberta(true)}
                className="flex w-full items-center justify-between rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3 py-2 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                <span className="inline-flex items-center gap-2 truncate">
                  <Search className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span className="truncate">Busca global</span>
                </span>
              </button>

              <div className="flex items-center justify-between gap-2 rounded-lg bg-[var(--bg-canvas)] px-2.5 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  {avatarUrlSeguro ? (
                    <img
                      src={avatarUrlSeguro}
                      alt={nomeUsuario}
                      referrerPolicy="no-referrer"
                      className="h-7 w-7 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--accent-primary)] text-xs font-semibold text-white">
                      {inicialUsuario}
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-[var(--text-primary)]">
                      {nomeUsuario}
                    </p>
                    <p className="truncate text-xs text-[var(--text-muted)]">
                      {user.email}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void sair()}
                  title="Sair da conta"
                  aria-label="Sair da conta"
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] hover:text-red-600 dark:hover:text-red-400 cursor-pointer"
                >
                  <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>

          {!recolhida && (
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Redimensionar barra lateral"
              onMouseDown={iniciarResizeSidebar}
              className="absolute inset-y-0 right-0 w-1.5 cursor-col-resize hover:bg-[var(--accent-primary)]/40 transition-colors"
            />
          )}
        </aside>
      )}

      {/* Drawer Mobile e Tablet (< lg) */}
      <div
        className={`print-hidden fixed inset-0 z-50 flex lg:hidden transition-[visibility] duration-0 ${
          menuMobileAberto
            ? 'visible pointer-events-auto delay-0'
            : 'invisible pointer-events-none delay-200'
        }`}
        role="dialog"
        aria-modal="true"
        aria-hidden={!menuMobileAberto}
        aria-label="Menu de navegação"
      >
        <div
          className={`fixed inset-0 bg-black/50 transition-opacity duration-200 ease-out ${
            menuMobileAberto ? 'opacity-100' : 'opacity-0'
          }`}
          onClick={() => setMenuMobileAberto(false)}
        />
        <aside
          className={`safe-top safe-bottom relative z-10 flex w-[min(82vw,18rem)] flex-col bg-[var(--bg-surface)] border-r border-[var(--border-hairline)] shadow-2xl transition-transform duration-200 ease-out ${
            menuMobileAberto ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
            <div className="flex h-14 items-center justify-between border-b border-[var(--border-hairline)] px-4">
              <button
                type="button"
                onClick={() => {
                  navegarPara('inicio');
                  setMenuMobileAberto(false);
                }}
                title="Voltar para o Início"
                aria-label="Voltar para o início"
                className="inline-flex items-center rounded-lg py-1 hover:opacity-85 transition-opacity cursor-pointer"
              >
                <BrandLogo size="md" showWordmark wordmarkClassName="text-base" />
              </button>
              <button
                type="button"
                onClick={() => setMenuMobileAberto(false)}
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] cursor-pointer"
                aria-label="Fechar menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="touch-scroll flex-1 overflow-y-auto p-3 space-y-1">
              {ITENS_NAVEGACAO.map((item) => {
                const Icone = item.icone;
                const ativo = pagina === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      navegarPara(item.id);
                      setMenuMobileAberto(false);
                    }}
                    className={`flex min-h-[44px] w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium cursor-pointer ${
                      ativo
                        ? 'bg-[var(--bg-subtle)] text-[var(--text-primary)]'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]/60'
                    }`}
                  >
                    <Icone className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{item.rotulo}</span>
                  </button>
                );
              })}
            </nav>
            <div className="border-t border-[var(--border-hairline)] p-3 space-y-2.5">
              <button
                type="button"
                onClick={() => {
                  setMenuMobileAberto(false);
                  setBuscaGlobalAberta(true);
                }}
                className="flex min-h-[44px] w-full items-center gap-2 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3 py-2 text-xs text-[var(--text-secondary)] cursor-pointer"
              >
                <Search className="h-4 w-4" aria-hidden="true" />
                <span>Busca global</span>
              </button>

              <div className="flex items-center justify-between gap-2 rounded-lg bg-[var(--bg-canvas)] px-3 py-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  {avatarUrlSeguro ? (
                    <img
                      src={avatarUrlSeguro}
                      alt={nomeUsuario}
                      referrerPolicy="no-referrer"
                      className="h-8 w-8 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--accent-primary)] text-xs font-semibold text-white">
                      {inicialUsuario}
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-[var(--text-primary)]">
                      {nomeUsuario}
                    </p>
                    <p className="truncate text-xs text-[var(--text-muted)]">
                      {user.email}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setMenuMobileAberto(false);
                    void sair();
                  }}
                  aria-label="Sair da conta"
                  className="inline-flex min-h-[40px] min-w-[40px] shrink-0 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] hover:text-red-600 dark:hover:text-red-400 cursor-pointer"
                >
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>
        </aside>
      </div>

      {/* Área Principal */}
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        {!modoFocoTotal && (
          <header className="print-hidden safe-top flex h-14 shrink-0 items-center justify-between gap-2 sm:gap-4 border-b border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 sm:px-6">
            <div className="flex items-center gap-1.5 sm:gap-3 min-w-0">
              <button
                type="button"
                onClick={handleToggleMenu}
                aria-label="Alternar barra lateral"
                className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
              >
                <Menu className="h-5 w-5" />
              </button>
              <div className="flex items-center gap-2 text-sm min-w-0">
                <button
                  type="button"
                  onClick={() => navegarPara('inicio')}
                  title="Voltar para o Início"
                  aria-label="Voltar para o início"
                  className={`items-center rounded-lg py-1 hover:opacity-85 transition-opacity cursor-pointer ${
                    recolhida ? 'inline-flex' : 'inline-flex lg:hidden'
                  }`}
                >
                  <BrandLogo
                    size="sm"
                    showWordmark
                    compactMobileWordmark
                    wordmarkClassName="text-sm whitespace-nowrap"
                  />
                </button>
                <span
                  className={`text-[var(--text-muted)] ${recolhida ? 'inline' : 'lg:hidden'}`}
                  aria-hidden="true"
                >
                  /
                </span>
                <span className="truncate font-medium text-[var(--text-secondary)]">
                  {itemAtual?.rotulo || 'Início'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => setBuscaGlobalAberta(true)}
                className="inline-flex min-h-[40px] min-w-[40px] sm:min-h-0 sm:min-w-0 items-center justify-center gap-1.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-2.5 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] lg:hidden cursor-pointer"
                aria-label="Busca global"
              >
                <Search className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                <span className="hidden sm:inline">Buscar</span>
              </button>

              <PWAInstallButton />
            </div>
          </header>
        )}

        {/* Viewport de Conteúdo */}
        <div ref={conteudoRef} className="touch-scroll flex-1 overflow-y-auto overflow-x-hidden">
          {pagina === 'inicio' && (
            <HomeDashboardView onAbrirUpload={() => setUploadModalAberto(true)} />
          )}
          {pagina === 'biblioteca' && (
            <LibraryView onAbrirUpload={() => setUploadModalAberto(true)} />
          )}
          {pagina === 'leitor' && <ReaderView />}
          {pagina === 'anotacoes' && <NotesDirectoryView />}
          {pagina === 'revisao' && <SpacedReviewView />}
          {pagina === 'flashcards' && <FlashcardsView />}
          {pagina === 'exportar' && <ExportView />}
          {pagina === 'configuracoes' && <SettingsView />}
        </div>
      </div>

      <GlobalSearchModal />
      <UploadVadeMecumModal
        aberto={uploadModalAberto}
        onFechar={() => setUploadModalAberto(false)}
      />
      <OfflineIndicator />

      {toast && (
        <div className="print-hidden pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-3 sm:px-6 pb-[max(1rem,env(safe-area-inset-bottom,0px))]">
          <div
            role="status"
            aria-live="polite"
            className={`pointer-events-auto grid w-full sm:w-auto sm:min-w-[300px] sm:max-w-lg grid-cols-[1.5rem_minmax(0,1fr)_1.5rem] items-center gap-2.5 rounded-xl border px-3.5 py-3 text-xs sm:text-sm font-medium shadow-xl ${
              toast.tipo === 'erro'
                ? 'border-red-400/50 bg-red-950 text-red-100'
                : toast.tipo === 'sucesso'
                ? 'border-emerald-500/40 bg-slate-900 text-white'
                : 'border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--text-primary)]'
            }`}
          >
            <span className="flex h-6 w-6 items-center justify-center" aria-hidden="true">
              {toast.tipo === 'erro' ? (
                <AlertCircle className="h-4 w-4 text-red-300" />
              ) : toast.tipo === 'sucesso' ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              ) : (
                <Info className="h-4 w-4 text-[var(--accent-primary)]" />
              )}
            </span>
            <span className="min-w-0 text-center leading-snug [overflow-wrap:anywhere]">
              {toast.mensagem}
            </span>
            <button
              type="button"
              onClick={limparToast}
              className="inline-flex h-6 w-6 items-center justify-center rounded-md opacity-75 transition-opacity hover:opacity-100 hover:bg-black/10 dark:hover:bg-white/10 cursor-pointer"
              aria-label="Fechar aviso"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
