import {
  CheckCircle2,
  Database,
  LogOut,
  Palette,
  Plus,
  ShieldCheck,
  Trash2,
  UserCheck,
} from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAuth } from '@/src/contexts/AuthContext';
import { db } from '@/src/db/database';
import { useLeiSecaStore } from '@/src/store/useLeiSecaStore';
import { sanitizarUrlSegura } from '@/src/utils/security';
import {
  CORES_SUGESTAO_MARCADOR,
  derivarPaletaMarcador,
  MAX_CORES_PERSONALIZADAS,
} from '@/src/utils/studyHelpers';

export const SettingsView: React.FC = () => {
  const { user, perfil, sair } = useAuth();
  const {
    configuracao,
    atualizarCorConfig,
    adicionarCorPersonalizada,
    removerCorPersonalizada,
    atualizarPreferencias,
    atualizarMetaDiaria,
    mostrarToast,
  } = useLeiSecaStore();

  const [confirmandoLimpar, setConfirmandoLimpar] = useState(false);
  const [novoMarcadorNome, setNovoMarcadorNome] = useState('');
  const [novoMarcadorSignificado, setNovoMarcadorSignificado] = useState('');
  const [novoMarcadorCor, setNovoMarcadorCor] = useState<string>(CORES_SUGESTAO_MARCADOR[0]);
  const [criandoMarcador, setCriandoMarcador] = useState(false);
  const avatarUrlSeguro = sanitizarUrlSegura(user?.photoURL);

  const marcadoresPersonalizados = useMemo(
    () => configuracao.cores.filter((c) => c.personalizada),
    [configuracao.cores]
  );
  const limitePersonalizadosAtingido =
    marcadoresPersonalizados.length >= MAX_CORES_PERSONALIZADAS;
  const previewPaleta = useMemo(
    () => derivarPaletaMarcador(novoMarcadorCor),
    [novoMarcadorCor]
  );

  const handleCriarMarcador = async (e: React.FormEvent) => {
    e.preventDefault();
    if (limitePersonalizadosAtingido || criandoMarcador) return;
    if (!novoMarcadorNome.trim()) {
      mostrarToast('Digite um nome para o novo marcador.', 'erro');
      return;
    }

    setCriandoMarcador(true);
    try {
      const res = await adicionarCorPersonalizada({
        nome: novoMarcadorNome,
        corHex: novoMarcadorCor,
        significado: novoMarcadorSignificado,
      });
      if (!res.sucesso) {
        mostrarToast(res.erro || 'Não foi possível criar o marcador.', 'erro');
        return;
      }
      setNovoMarcadorNome('');
      setNovoMarcadorSignificado('');
      const proximaSugestao =
        CORES_SUGESTAO_MARCADOR[
          (marcadoresPersonalizados.length + 1) % CORES_SUGESTAO_MARCADOR.length
        ];
      setNovoMarcadorCor(proximaSugestao);
      mostrarToast('Marcador de texto criado!', 'sucesso');
    } finally {
      setCriandoMarcador(false);
    }
  };

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
              {avatarUrlSeguro ? (
                <img
                  src={avatarUrlSeguro}
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
                  <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                    E-mail verificado
                  </span>
                </div>
                <p className="text-sm text-[var(--text-muted)] truncate">{user.email}</p>
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
      <section className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-[var(--text-primary)]">
              Marcadores de texto e cores
            </h2>
            <p className="text-xs text-[var(--text-muted)]">
              Personalize o nome, o significado e crie até {MAX_CORES_PERSONALIZADAS} marcadores com a cor que preferir.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-2.5 py-1 text-xs font-medium font-mono-tabular text-[var(--text-secondary)]">
              {marcadoresPersonalizados.length}/{MAX_CORES_PERSONALIZADAS} personalizados
            </span>
            <Palette className="h-5 w-5 text-[var(--text-muted)]" aria-hidden="true" />
          </div>
        </div>

        <div className="divide-y divide-[var(--border-hairline)]">
          {configuracao.cores.map((cor) => (
            <div
              key={cor.id}
              className="flex flex-wrap items-center gap-3 py-3 first:pt-1 last:pb-1"
            >
              {cor.personalizada ? (
                <label
                  title="Alterar cor do marcador"
                  className="relative flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full border shadow-xs transition-transform hover:scale-105"
                  style={{ backgroundColor: cor.hexBg, borderColor: cor.hexBorder }}
                >
                  <input
                    type="color"
                    value={cor.hexBorder}
                    onChange={(e) =>
                      void atualizarCorConfig(cor.id, { corHex: e.target.value })
                    }
                    aria-label={`Cor do marcador ${cor.nome}`}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  />
                </label>
              ) : (
                <span
                  className="h-8 w-8 shrink-0 rounded-full border"
                  style={{ backgroundColor: cor.hexBg, borderColor: cor.hexBorder }}
                />
              )}

              <input
                type="text"
                maxLength={40}
                value={cor.nome}
                onChange={(e) => void atualizarCorConfig(cor.id, { nome: e.target.value })}
                aria-label={`Nome do marcador ${cor.nome}`}
                placeholder="Nome do marcador"
                className="w-36 sm:w-40 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-primary)]"
              />

              <input
                type="text"
                maxLength={100}
                value={cor.significado}
                onChange={(e) =>
                  void atualizarCorConfig(cor.id, { significado: e.target.value })
                }
                aria-label={`Significado do marcador ${cor.nome}`}
                placeholder="Significado nos estudos (opcional)..."
                className="w-full min-w-0 sm:w-auto sm:flex-1 sm:min-w-[180px] rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3 py-1.5 text-xs text-[var(--text-primary)]"
              />

              {cor.personalizada && (
                <button
                  type="button"
                  onClick={() => {
                    void removerCorPersonalizada(cor.id);
                    mostrarToast('Marcador personalizado removido.', 'info');
                  }}
                  title={`Excluir marcador ${cor.nome}`}
                  aria-label={`Excluir marcador ${cor.nome}`}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--border-hairline)] text-[var(--text-muted)] hover:border-red-300 hover:bg-red-50 hover:text-red-600 dark:hover:border-red-900/50 dark:hover:bg-red-950/30 dark:hover:text-red-400 cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Criar novo marcador personalizado */}
        <form
          onSubmit={handleCriarMarcador}
          className="rounded-xl border border-dashed border-[var(--border-hairline)] bg-[var(--bg-canvas)] p-4 space-y-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-[var(--text-primary)]">
              Criar novo marcador de texto
            </span>
            <span className="text-[11px] text-[var(--text-muted)]">
              {limitePersonalizadosAtingido
                ? 'Limite de 5 marcadores atingido'
                : `Restam ${MAX_CORES_PERSONALIZADAS - marcadoresPersonalizados.length} vaga(s)`}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-12 sm:items-end">
            <div className="sm:col-span-4">
              <label
                htmlFor="novo-marcador-nome"
                className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1"
              >
                Nome do marcador
              </label>
              <input
                id="novo-marcador-nome"
                type="text"
                maxLength={40}
                disabled={limitePersonalizadosAtingido}
                value={novoMarcadorNome}
                onChange={(e) => setNovoMarcadorNome(e.target.value)}
                placeholder="Ex: Jurisprudência STJ"
                className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-2 text-xs text-[var(--text-primary)] disabled:opacity-50"
              />
            </div>

            <div className="sm:col-span-5">
              <label
                htmlFor="novo-marcador-significado"
                className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1"
              >
                Significado (opcional)
              </label>
              <input
                id="novo-marcador-significado"
                type="text"
                maxLength={100}
                disabled={limitePersonalizadosAtingido}
                value={novoMarcadorSignificado}
                onChange={(e) => setNovoMarcadorSignificado(e.target.value)}
                placeholder="Ex: Teses repetitivas e informativos"
                className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-2 text-xs text-[var(--text-primary)] disabled:opacity-50"
              />
            </div>

            <div className="sm:col-span-3 flex items-center gap-2">
              <label
                title="Escolher qualquer cor"
                className="relative flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-[var(--border-hairline)] shadow-xs"
                style={{
                  backgroundColor: previewPaleta.hexBg,
                  borderColor: previewPaleta.hexBorder,
                }}
              >
                <input
                  type="color"
                  disabled={limitePersonalizadosAtingido}
                  value={novoMarcadorCor}
                  onChange={(e) => setNovoMarcadorCor(e.target.value)}
                  aria-label="Escolher cor do novo marcador"
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
                />
              </label>

              <button
                type="submit"
                disabled={limitePersonalizadosAtingido || criandoMarcador}
                className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-[var(--accent-primary)] px-3 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed whitespace-nowrap"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                Adicionar
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-[var(--text-muted)] mr-1">Sugestões:</span>
              {CORES_SUGESTAO_MARCADOR.map((corHex) => {
                const selecionada =
                  novoMarcadorCor.toLowerCase() === corHex.toLowerCase();
                return (
                  <button
                    key={corHex}
                    type="button"
                    disabled={limitePersonalizadosAtingido}
                    onClick={() => setNovoMarcadorCor(corHex)}
                    aria-label={`Selecionar cor ${corHex}`}
                    style={{ backgroundColor: corHex }}
                    className={`h-5 w-5 rounded-full border border-black/15 transition-transform cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                      selecionada
                        ? 'ring-2 ring-[var(--accent-primary)] ring-offset-1 ring-offset-[var(--bg-canvas)] scale-110'
                        : 'hover:scale-110'
                    }`}
                  />
                );
              })}
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className="text-[11px] text-[var(--text-muted)]">Prévia:</span>
              <span
                style={{
                  backgroundColor:
                    configuracao.preferencias.tema === 'escuro'
                      ? previewPaleta.hexBgDark
                      : previewPaleta.hexBg,
                  borderBottom: `1px solid ${previewPaleta.hexBorder}88`,
                }}
                className="rounded px-2 py-0.5 text-xs font-medium text-[var(--text-primary)]"
              >
                {novoMarcadorNome.trim() || 'Trecho destacado'}
              </span>
            </div>
          </div>
        </form>
      </section>

      {/* Preferências e Meta */}
      <section className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6 space-y-5">
        <h2 className="text-base font-semibold text-[var(--text-primary)]">
          Preferências de estudo e tema
        </h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
              Tema da interface
            </label>
            <select
              value={configuracao.preferencias.tema}
              onChange={(e) =>
                atualizarPreferencias({
                  tema: e.target.value as 'claro' | 'escuro' | 'sepia',
                })
              }
              className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3 py-2 text-sm text-[var(--text-primary)]"
            >
              <option value="claro">Claro (Papel)</option>
              <option value="sepia">Sépia (Leitura prolongada)</option>
              <option value="escuro">Escuro (Noturno)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
              Meta diária (artigos por dia)
            </label>
            <input
              type="number"
              min={1}
              max={200}
              value={configuracao.metaDiariaArtigos}
              onChange={(e) => atualizarMetaDiaria(Number(e.target.value) || 1)}
              className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3 py-2 text-sm font-mono-tabular text-[var(--text-primary)]"
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
