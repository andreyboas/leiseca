import {
  BookOpen,
  CalendarClock,
  Download,
  Home,
  Layers,
  Library,
  Menu,
  MessageSquareText,
  Search,
  Settings,
  Upload,
  X,
} from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { BrandLogo } from '@/src/components/BrandLogo';
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

interface NavItem {
  id: PaginaAtiva;
  rotulo: string;
  icone: React.ComponentType<{ className?: string }>;
}

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

  if (!inicializado) {
    return (
      <div className="app-shell-height flex items-center justify-center bg-[var(--bg-canvas)] text-sm text-[var(--text-muted)]">
        Carregando biblioteca local...
      </div>
    );
  }

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
              <BrandLogo size="md" showWordmark wordmarkClassName="text-base whitespace-nowrap" />
              <span className="text-[10px] font-mono-tabular text-[var(--text-muted)]">
                Ctrl+B
              </span>
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

            <div className="border-t border-[var(--border-hairline)] p-3">
              <button
                type="button"
                onClick={() => setBuscaGlobalAberta(true)}
                className="flex w-full items-center justify-between rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3 py-2 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                <span className="inline-flex items-center gap-2 truncate">
                  <Search className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span className="truncate">Busca global</span>
                </span>
                <kbd className="rounded border border-[var(--border-hairline)] px-1.5 py-0.5 text-[10px] font-mono-tabular shrink-0">
                  Ctrl+K
                </kbd>
              </button>
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
      {menuMobileAberto && (
        <div
          className="print-hidden fixed inset-0 z-50 flex lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Menu de navegação"
        >
          <div
            className="fixed inset-0 bg-black/50 transition-opacity"
            onClick={() => setMenuMobileAberto(false)}
          />
          <aside className="safe-top safe-bottom relative z-10 flex w-[min(82vw,18rem)] flex-col bg-[var(--bg-surface)] border-r border-[var(--border-hairline)] shadow-2xl">
            <div className="flex h-14 items-center justify-between border-b border-[var(--border-hairline)] px-4">
              <BrandLogo size="md" showWordmark wordmarkClassName="text-base" />
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
            <div className="border-t border-[var(--border-hairline)] p-3">
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
            </div>
          </aside>
        </div>
      )}

      {/* Área Principal */}
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        {!modoFocoTotal && (
          <header className="print-hidden safe-top flex h-14 shrink-0 items-center justify-between gap-2 sm:gap-4 border-b border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 sm:px-6">
            <div className="flex items-center gap-1.5 sm:gap-3 min-w-0">
              <button
                type="button"
                onClick={handleToggleMenu}
                title="Recolher ou expandir barra lateral (Ctrl+B)"
                aria-label="Alternar barra lateral"
                className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
              >
                <Menu className="h-5 w-5" />
              </button>
              <div className="flex items-center gap-2 text-sm min-w-0">
                <BrandLogo
                  size="sm"
                  showWordmark
                  compactMobileWordmark
                  wordmarkClassName="text-sm whitespace-nowrap"
                  className={recolhida ? 'inline-flex' : 'inline-flex lg:hidden'}
                />
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

              <button
                type="button"
                onClick={() => setUploadModalAberto(true)}
                className="inline-flex min-h-[40px] sm:min-h-0 items-center gap-1.5 sm:gap-2 rounded-lg bg-[var(--accent-primary)] px-3 sm:px-3.5 py-1.5 text-xs font-medium text-white hover:opacity-90 cursor-pointer whitespace-nowrap shrink-0"
              >
                <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Importar</span>
              </button>
            </div>
          </header>
        )}

        {/* Viewport de Conteúdo */}
        <div className="touch-scroll flex-1 overflow-y-auto overflow-x-hidden">
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
        <div
          role="status"
          className={`print-hidden safe-bottom fixed bottom-4 right-4 z-50 flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-xl border px-4 py-3 text-xs font-medium shadow-xl ${
            toast.tipo === 'erro'
              ? 'border-red-300 bg-red-950 text-red-100'
              : toast.tipo === 'sucesso'
              ? 'border-emerald-500/40 bg-slate-900 text-white'
              : 'border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--text-primary)]'
          }`}
        >
          <span>{toast.mensagem}</span>
          <button
            type="button"
            onClick={limparToast}
            className="rounded p-0.5 opacity-70 hover:opacity-100 cursor-pointer"
            aria-label="Fechar aviso"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
