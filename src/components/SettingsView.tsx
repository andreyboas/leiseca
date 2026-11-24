import { CheckCircle2, Database, LogOut, Palette, ShieldCheck, Trash2, UserCheck } from 'lucide-react';
import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAuth } from '@/src/contexts/AuthContext';
import { db } from '@/src/db/database';
import { useLeiSecaStore } from '@/src/store/useLeiSecaStore';

export const SettingsView: React.FC = () => {
  const { user, perfil, sair } = useAuth();
  const {
    configuracao,
    atualizarCorConfig,
    atualizarPreferencias,
    atualizarMetaDiaria,
    mostrarToast,
  } = useLeiSecaStore();

  const [confirmandoLimpar, setConfirmandoLimpar] = useState(false);

  const contagemCodigos = useLiveQuery(() => db.codigos.count(), []) ?? 0;
  const contagemArtigos = useLiveQuery(() => db.artigos.count(), []) ?? 0;
  const contagemGrifos = useLiveQuery(() => db.grifos.count(), []) ?? 0;
  const contagemAnotacoes = useLiveQuery(() => db.anotacoes.count(), []) ?? 0;

  const limparTodosDados = async () => {
    await db.transaction(
      'rw',
      [db.codigos, db.artigos, db.grifos, db.anotacoes, db.tags, db.colecoes, db.progressos],
      async () => {
        await Promise.all([
          db.codigos.clear(),
          db.artigos.clear(),
          db.grifos.clear(),
          db.anotacoes.clear(),
          db.tags.clear(),
          db.colecoes.clear(),
          db.progressos.clear(),
        ]);
      }
    );
    useLeiSecaStore.setState({ codigoAtivoId: null, artigoAtivoId: null });
    setConfirmandoLimpar(false);
    mostrarToast('Banco local limpo com sucesso.', 'info');
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-8 space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
          Configurações
        </h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Gerencie sua conta, personalize as cores do marca-texto, preferências de leitura e armazenamento local.
        </p>
      </div>

      {/* Conta conectada */}
      {user && (
        <section className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={user.displayName || 'Usuário'}
                  referrerPolicy="no-referrer"
                  className="h-11 w-11 shrink-0 rounded-full object-cover border border-[var(--border-hairline)]"
                />
              ) : (
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--accent-primary)] text-sm font-semibold text-white">
                  {(user.displayName || user.email || 'E').charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-semibold text-[var(--text-primary)] truncate">
                    {user.displayName || perfil?.displayName || 'Estudante'}
                  </h2>
                  <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                    <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                    E-mail verificado
                  </span>
                </div>
                <p className="text-xs text-[var(--text-muted)] truncate">{user.email}</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void sair()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3 py-2 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
              Sair da conta
            </button>
          </div>

          <div className="flex items-center gap-2 rounded-lg bg-[var(--bg-canvas)] px-3.5 py-2.5 text-xs text-[var(--text-secondary)]">
            <UserCheck className="h-4 w-4 shrink-0 text-[var(--accent-primary)]" aria-hidden="true" />
            <span>
              Método de autenticação:{' '}
              <strong className="font-semibold text-[var(--text-primary)]">
                {user.providerData.some((p) => p.providerId === 'google.com')
                  ? 'Conta Google'
                  : 'E-mail e senha (verificado)'}
              </strong>
            </span>
          </div>
        </section>
      )}

      {/* Cores do Marca-texto */}
      <section className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-[var(--text-primary)]">
              Legenda das cores do marca-texto
            </h2>
            <p className="text-xs text-[var(--text-muted)]">
              Defina o significado de cada cor do marca-texto.
            </p>
          </div>
          <Palette className="h-5 w-5 text-[var(--text-muted)]" aria-hidden="true" />
        </div>

        <div className="divide-y divide-[var(--border-hairline)]">
          {configuracao.cores.map((cor) => (
            <div
              key={cor.id}
              className="flex flex-wrap items-center gap-3 py-3 first:pt-1 last:pb-1"
            >
              <span
                className="h-7 w-7 shrink-0 rounded-full border"
                style={{ backgroundColor: cor.hexBg, borderColor: cor.hexBorder }}
              />
              <input
                type="text"
                value={cor.nome}
                onChange={(e) => atualizarCorConfig(cor.id, { nome: e.target.value })}
                aria-label={`Nome da cor ${cor.nome}`}
                className="w-28 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-primary)]"
              />
              <input
                type="text"
                value={cor.significado}
                onChange={(e) => atualizarCorConfig(cor.id, { significado: e.target.value })}
                aria-label={`Significado da cor ${cor.nome}`}
                placeholder="Significado nos estudos..."
                className="w-full min-w-0 sm:w-auto sm:flex-1 sm:min-w-[200px] rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3 py-1.5 text-xs text-[var(--text-primary)]"
              />
            </div>
          ))}
        </div>
      </section>

      {/* Preferências e Meta */}
      <section className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6 space-y-4">
        <h2 className="text-base font-semibold text-[var(--text-primary)]">
          Preferências de estudo e tema
        </h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
              Tema da interface
            </label>
            <select
              value={configuracao.preferencias.tema}
              onChange={(e) =>
                atualizarPreferencias({
                  tema: e.target.value as 'claro' | 'escuro' | 'sepia',
                })
              }
              className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3 py-2 text-xs text-[var(--text-primary)]"
            >
              <option value="claro">Claro (Papel)</option>
              <option value="sepia">Sépia (Leitura prolongada)</option>
              <option value="escuro">Escuro (Noturno)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
              Meta diária (artigos por dia)
            </label>
            <input
              type="number"
              min={1}
              max={200}
              value={configuracao.metaDiariaArtigos}
              onChange={(e) => atualizarMetaDiaria(Number(e.target.value) || 1)}
              className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3 py-2 text-xs font-mono-tabular text-[var(--text-primary)]"
            />
          </div>
        </div>
      </section>

      {/* Armazenamento Local e Privacidade */}
      <section className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-[var(--text-primary)]">
              Armazenamento local e privacidade
            </h2>
            <p className="text-xs text-[var(--text-muted)]">
              Seus dados ficam armazenados localmente via IndexedDB e funcionam 100% offline.
            </p>
          </div>
          <Database className="h-5 w-5 text-[var(--text-muted)]" aria-hidden="true" />
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-xs">
          <div className="rounded-lg bg-[var(--bg-canvas)] p-3">
            <span className="block text-[var(--text-muted)]">Códigos</span>
            <span className="mt-1 block text-lg font-semibold font-mono-tabular text-[var(--text-primary)]">
              {contagemCodigos}
            </span>
          </div>
          <div className="rounded-lg bg-[var(--bg-canvas)] p-3">
            <span className="block text-[var(--text-muted)]">Artigos</span>
            <span className="mt-1 block text-lg font-semibold font-mono-tabular text-[var(--text-primary)]">
              {contagemArtigos}
            </span>
          </div>
          <div className="rounded-lg bg-[var(--bg-canvas)] p-3">
            <span className="block text-[var(--text-muted)]">Grifos</span>
            <span className="mt-1 block text-lg font-semibold font-mono-tabular text-[var(--text-primary)]">
              {contagemGrifos}
            </span>
          </div>
          <div className="rounded-lg bg-[var(--bg-canvas)] p-3">
            <span className="block text-[var(--text-muted)]">Anotações</span>
            <span className="mt-1 block text-lg font-semibold font-mono-tabular text-[var(--text-primary)]">
              {contagemAnotacoes}
            </span>
          </div>
        </div>

        <div className="flex items-start gap-2.5 rounded-lg bg-[var(--bg-canvas)] p-3.5 text-xs text-[var(--text-secondary)]">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-primary)]" aria-hidden="true" />
          <span>
            Nenhum arquivo PDF/DOCX enviado nem suas anotações são transmitidos para servidores externos. A arquitetura está preparada para sincronização futura opcional, mantendo o controle total no seu navegador por padrão.
          </span>
        </div>

        <div className="pt-2 flex items-center justify-end gap-2">
          {confirmandoLimpar ? (
            <>
              <span className="text-xs text-red-600 dark:text-red-400">
                Apagar todos os dados locais?
              </span>
              <button
                type="button"
                onClick={limparTodosDados}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white cursor-pointer"
              >
                Sim, apagar tudo
              </button>
              <button
                type="button"
                onClick={() => setConfirmandoLimpar(false)}
                className="rounded-lg px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
              >
                Cancelar
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmandoLimpar(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-950/30 cursor-pointer"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              Limpar biblioteca local
            </button>
          )}
        </div>
      </section>
    </div>
  );
};
