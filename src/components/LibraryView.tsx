import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  Download,
  Edit2,
  Folder,
  FolderOpen,
  FolderPlus,
  Home,
  MoveRight,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { BrandLogo } from '@/src/components/BrandLogo';
import { db } from '@/src/db/database';
import { useLeiSecaStore } from '@/src/store/useLeiSecaStore';
import type { Codigo, Pasta } from '@/src/types/domain';
import {
  formatarContagemUnidades,
  formatarDataBR,
  ROTULOS_TIPO_DOCUMENTO,
} from '@/src/utils/studyHelpers';

interface LibraryViewProps {
  onAbrirUpload: () => void;
}

export const LibraryView: React.FC<LibraryViewProps> = ({ onAbrirUpload }) => {
  const {
    abrirArtigoNoLeitor,
    excluirCodigo,
    carregarAmostraDemonstracao,
    criarColecao,
    excluirColecao,
    criarPasta,
    renomearPasta,
    moverPasta,
    moverCodigoParaPasta,
    excluirPasta,
    navegarPara,
  } = useLeiSecaStore();

  const pastas = useLiveQuery(() => db.pastas.orderBy('ordem').toArray(), []) || [];
  const codigos = useLiveQuery(() => db.codigos.orderBy('ordem').toArray(), []) || [];
  const progressos = useLiveQuery(() => db.progressos.toArray(), []) || [];
  const colecoes = useLiveQuery(() => db.colecoes.toArray(), []) || [];
  const artigos = useLiveQuery(() => db.artigos.toArray(), []) || [];

  const [pastaAtualId, setPastaAtualId] = useState<string | null>(null);
  const [pastasExpandidas, setPastasExpandidas] = useState<Record<string, boolean>>({});
  const [criandoPasta, setCriandoPasta] = useState(false);
  const [novoNomePasta, setNovoNomePasta] = useState('');
  const [renomeandoPastaId, setRenomeandoPastaId] = useState<string | null>(null);
  const [nomeRenomear, setNomeRenomear] = useState('');

  const [confirmandoExclusaoId, setConfirmandoExclusaoId] = useState<string | null>(null);
  const [confirmandoExclusaoPastaId, setConfirmandoExclusaoPastaId] = useState<string | null>(null);
  const [movendoCodigoId, setMovendoCodigoId] = useState<string | null>(null);
  const [dropAlvoId, setDropAlvoId] = useState<string | null>(null);

  const [novaColecaoNome, setNovaColecaoNome] = useState('');
  const [novaColecaoDesc, setNovaColecaoDesc] = useState('');

  const mapaPastas = useMemo(() => new Map(pastas.map((p) => [p.id, p])), [pastas]);
  const mapaArtigos = useMemo(() => new Map(artigos.map((a) => [a.id, a])), [artigos]);

  const progressoPorCodigo = useMemo(() => {
    const map = new Map<string, { concluidos: number; revisar: number }>();
    for (const p of progressos) {
      const cur = map.get(p.codigoId) || { concluidos: 0, revisar: 0 };
      if (p.status === 'estudado' || p.status === 'dominado') cur.concluidos += 1;
      if (p.status === 'revisar') cur.revisar += 1;
      map.set(p.codigoId, cur);
    }
    return map;
  }, [progressos]);

  // Conta documentos recursivamente por pasta
  const contagemDocsPorPasta = useMemo(() => {
    const mapa = new Map<string, number>();
    const diretos = new Map<string, number>();
    for (const c of codigos) {
      if (c.pastaId) diretos.set(c.pastaId, (diretos.get(c.pastaId) || 0) + 1);
    }
    const filhasMap = new Map<string, Pasta[]>();
    for (const p of pastas) {
      if (p.parentId) {
        const arr = filhasMap.get(p.parentId) || [];
        arr.push(p);
        filhasMap.set(p.parentId, arr);
      }
    }
    const contar = (id: string): number => {
      if (mapa.has(id)) return mapa.get(id)!;
      let total = diretos.get(id) || 0;
      for (const f of filhasMap.get(id) || []) {
        total += contar(f.id);
      }
      mapa.set(id, total);
      return total;
    };
    for (const p of pastas) contar(p.id);
    return mapa;
  }, [pastas, codigos]);

  const breadcrumb = useMemo(() => {
    const trilha: Pasta[] = [];
    let cur = pastaAtualId ? mapaPastas.get(pastaAtualId) : undefined;
    let guarda = 0;
    while (cur && guarda < 10) {
      trilha.unshift(cur);
      cur = cur.parentId ? mapaPastas.get(cur.parentId) : undefined;
      guarda += 1;
    }
    return trilha;
  }, [pastaAtualId, mapaPastas]);

  const subpastasAtuais = useMemo(
    () => pastas.filter((p) => (p.parentId || null) === pastaAtualId),
    [pastas, pastaAtualId]
  );

  const documentosAtuais = useMemo(() => {
    if (pastaAtualId === null) {
      // Na raiz "Biblioteca", exibe documentos sem pasta (se houver algum legado) ou nada porque ficam nas pastas raiz
      return codigos.filter((c) => !c.pastaId || !mapaPastas.has(c.pastaId));
    }
    return codigos.filter((c) => c.pastaId === pastaAtualId);
  }, [codigos, pastaAtualId, mapaPastas]);

  const handleDragStartItem = (
    e: React.DragEvent,
    tipo: 'codigo' | 'pasta',
    id: string
  ) => {
    e.dataTransfer.setData('application/leiseca-tipo', tipo);
    e.dataTransfer.setData('application/leiseca-id', id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDropEmPasta = async (e: React.DragEvent, destinoPastaId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDropAlvoId(null);
    const tipo = e.dataTransfer.getData('application/leiseca-tipo');
    const id = e.dataTransfer.getData('application/leiseca-id');
    if (!id) return;
    if (tipo === 'codigo') {
      await moverCodigoParaPasta(id, destinoPastaId);
    } else if (tipo === 'pasta') {
      await moverPasta(id, destinoPastaId);
    }
  };

  const renderArvoreLateral = (parentId: string | null, nivel = 0): React.ReactNode => {
    const filhas = pastas.filter((p) => (p.parentId || null) === parentId);
    if (filhas.length === 0) return null;

    return filhas.map((pasta) => {
      const temFilhas = pastas.some((p) => p.parentId === pasta.id);
      const expandida = pastasExpandidas[pasta.id] ?? nivel === 0;
      const ativa = pastaAtualId === pasta.id;
      const qtd = contagemDocsPorPasta.get(pasta.id) || 0;

      return (
        <div key={pasta.id} className="space-y-0.5">
          <div
            draggable={!pasta.fixa}
            onDragStart={(e) => handleDragStartItem(e, 'pasta', pasta.id)}
            onDragOver={(e) => {
              e.preventDefault();
              setDropAlvoId(pasta.id);
            }}
            onDragLeave={() => {
              if (dropAlvoId === pasta.id) setDropAlvoId(null);
            }}
            onDrop={(e) => handleDropEmPasta(e, pasta.id)}
            style={{ paddingLeft: `${nivel * 12 + 6}px` }}
            className={`group flex items-center justify-between gap-1 rounded-lg py-1.5 pr-2 text-xs transition-colors ${
              dropAlvoId === pasta.id
                ? 'bg-[var(--accent-primary)]/15 ring-1 ring-[var(--accent-primary)]'
                : ativa
                ? 'bg-[var(--bg-subtle)] font-semibold text-[var(--text-primary)]'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]/60'
            }`}
          >
            <div className="flex items-center gap-1 min-w-0 flex-1">
              {temFilhas ? (
                <button
                  type="button"
                  onClick={() =>
                    setPastasExpandidas((prev) => ({ ...prev, [pasta.id]: !expandida }))
                  }
                  className="p-0.5 text-[var(--text-muted)] cursor-pointer"
                  aria-label={expandida ? 'Recolher subpastas' : 'Expandir subpastas'}
                >
                  {expandida ? (
                    <ChevronDown className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5" />
                  )}
                </button>
              ) : (
                <span className="w-4 shrink-0" />
              )}

              <button
                type="button"
                onClick={() => setPastaAtualId(pasta.id)}
                className="flex items-center gap-1.5 min-w-0 flex-1 text-left cursor-pointer"
              >
                {ativa ? (
                  <FolderOpen className="h-3.5 w-3.5 shrink-0 text-[var(--accent-primary)]" />
                ) : (
                  <Folder className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
                )}
                <span className="truncate">{pasta.nome}</span>
              </button>
            </div>

            <span className="text-xs font-mono-tabular text-[var(--text-muted)] shrink-0">
              {qtd}
            </span>
          </div>

          {temFilhas && expandida && renderArvoreLateral(pasta.id, nivel + 1)}
        </div>
      );
    });
  };

  const renderCartaoDocumento = (cod: Codigo) => {
    const stats = progressoPorCodigo.get(cod.id) || { concluidos: 0, revisar: 0 };
    const pct =
      cod.totalArtigos > 0
        ? Math.min(100, Math.round((stats.concluidos / cod.totalArtigos) * 100))
        : 0;
    const confirmando = confirmandoExclusaoId === cod.id;
    const movendo = movendoCodigoId === cod.id;

    return (
      <div
        key={cod.id}
        draggable
        onDragStart={(e) => handleDragStartItem(e, 'codigo', cod.id)}
        className="flex flex-col justify-between rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5 space-y-4 cursor-grab active:cursor-grabbing"
      >
        <div>
          <div className="flex items-center justify-between gap-2 text-xs text-[var(--text-muted)]">
            <span className="font-mono-tabular font-semibold text-[var(--text-primary)]">
              {cod.sigla}
              {cod.tipoDocumento ? ` · ${ROTULOS_TIPO_DOCUMENTO[cod.tipoDocumento]}` : ''}
            </span>
            <span className="tabular-nums">
              {formatarContagemUnidades(cod.totalArtigos, cod.tipoDocumento)}
            </span>
          </div>
          <h3 className="mt-1.5 text-base font-semibold text-[var(--text-primary)] line-clamp-2">
            {cod.nome}
          </h3>
          {cod.fonteArquivo && (
            <p className="mt-1 truncate text-xs text-[var(--text-muted)]">
              {cod.fonteArquivo} · {formatarDataBR(cod.criadoEm)}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
            <span>Progresso de estudo</span>
            <span className="font-mono-tabular">
              {stats.concluidos}/{cod.totalArtigos} ({pct}%)
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-subtle)]">
            <div
              className="h-full bg-[var(--accent-primary)] transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {movendo && (
          <div className="rounded-lg bg-[var(--bg-canvas)] p-2.5 space-y-1.5">
            <label className="block text-xs font-medium text-[var(--text-muted)]">
              Mover para a pasta:
            </label>
            <select
              value={cod.pastaId || ''}
              onChange={async (e) => {
                if (e.target.value) {
                  await moverCodigoParaPasta(cod.id, e.target.value);
                  setMovendoCodigoId(null);
                }
              }}
              className="w-full rounded border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2 py-1 text-xs text-[var(--text-primary)]"
            >
              {pastas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 border-t border-[var(--border-hairline)] pt-3">
          <button
            type="button"
            onClick={() => abrirArtigoNoLeitor(cod.id)}
            className="rounded-lg bg-[var(--accent-primary)] px-3.5 py-1.5 text-xs font-medium text-white hover:opacity-90 cursor-pointer"
          >
            Estudar
          </button>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setMovendoCodigoId(movendo ? null : cod.id)}
              title="Mover para outra pasta"
              aria-label={`Mover ${cod.nome}`}
              className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] cursor-pointer"
            >
              <MoveRight className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() => {
                useLeiSecaStore.setState({ codigoAtivoId: cod.id });
                navegarPara('exportar');
              }}
              title="Exportar"
              aria-label={`Exportar ${cod.nome}`}
              className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] cursor-pointer"
            >
              <Download className="h-4 w-4" />
            </button>

            {confirmando ? (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={async () => {
                    await excluirCodigo(cod.id);
                    setConfirmandoExclusaoId(null);
                  }}
                  className="rounded px-2 py-1 text-xs font-medium bg-red-600 text-white cursor-pointer"
                >
                  Confirmar
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmandoExclusaoId(null)}
                  className="rounded px-2 py-1 text-xs text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmandoExclusaoId(cod.id)}
                title="Excluir documento"
                aria-label={`Excluir ${cod.nome}`}
                className="rounded-lg p-1.5 text-[var(--text-muted)] hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8 space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
            Biblioteca de Estudos
          </h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Organize Vade Mecum, leis avulsas, jurisprudência, súmulas e doutrina em pastas. Arraste documentos ou subpastas para reorganizar.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={carregarAmostraDemonstracao}
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3.5 py-2 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] cursor-pointer whitespace-nowrap"
          >
            <BookOpen className="h-4 w-4" aria-hidden="true" />
            Carregar amostra oficial
          </button>

          <button
            type="button"
            onClick={onAbrirUpload}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent-primary)] px-4 py-2 text-xs font-medium text-white hover:opacity-90 cursor-pointer whitespace-nowrap"
          >
            <Upload className="h-4 w-4" aria-hidden="true" />
            Importar arquivo
          </button>
        </div>
      </div>

      {/* Explorador de Pastas */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Árvore lateral de pastas */}
        <aside className="lg:col-span-4 xl:col-span-3 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-3 space-y-2 self-start">
          <div className="flex items-center justify-between px-2 py-1">
            <span className="text-xs font-semibold text-[var(--text-primary)]">
              Pastas
            </span>
            <button
              type="button"
              onClick={() => setCriandoPasta((v) => !v)}
              className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-[var(--accent-primary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
            >
              <FolderPlus className="h-3.5 w-3.5" />
              Nova pasta
            </button>
          </div>

          <button
            type="button"
            onClick={() => setPastaAtualId(null)}
            className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs cursor-pointer ${
              pastaAtualId === null
                ? 'bg-[var(--bg-subtle)] font-semibold text-[var(--text-primary)]'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]/60'
            }`}
          >
            <span className="inline-flex items-center gap-1.5">
              <Home className="h-3.5 w-3.5" aria-hidden="true" />
              Todas as pastas
            </span>
            <span className="font-mono-tabular text-xs text-[var(--text-muted)]">
              {codigos.length}
            </span>
          </button>

          <div className="space-y-0.5">{renderArvoreLateral(null)}</div>
        </aside>

        {/* Conteúdo da pasta selecionada */}
        <div className="lg:col-span-8 xl:col-span-9 space-y-4">
          {/* Breadcrumb + Ações da pasta */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-4 py-3">
            <nav aria-label="Caminho de pastas" className="flex flex-wrap items-center gap-1.5 text-xs">
              <button
                type="button"
                onClick={() => setPastaAtualId(null)}
                className={`hover:underline cursor-pointer ${
                  pastaAtualId === null
                    ? 'font-semibold text-[var(--text-primary)]'
                    : 'text-[var(--text-muted)]'
                }`}
              >
                Biblioteca
              </button>
              {breadcrumb.map((p, idx) => (
                <React.Fragment key={p.id}>
                  <span className="text-[var(--text-muted)]" aria-hidden="true">
                    ›
                  </span>
                  <button
                    type="button"
                    onClick={() => setPastaAtualId(p.id)}
                    className={`hover:underline cursor-pointer ${
                      idx === breadcrumb.length - 1
                        ? 'font-semibold text-[var(--text-primary)]'
                        : 'text-[var(--text-muted)]'
                    }`}
                  >
                    {p.nome}
                  </button>
                </React.Fragment>
              ))}
            </nav>

            <button
              type="button"
              onClick={() => setCriandoPasta((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
            >
              <FolderPlus className="h-3.5 w-3.5" />
              {pastaAtualId ? 'Nova subpasta aqui' : 'Nova pasta'}
            </button>
          </div>

          {criandoPasta && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!novoNomePasta.trim()) return;
                await criarPasta(novoNomePasta, pastaAtualId);
                setNovoNomePasta('');
                setCriandoPasta(false);
              }}
              className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-3"
            >
              <input
                type="text"
                autoFocus
                value={novoNomePasta}
                onChange={(e) => setNovoNomePasta(e.target.value)}
                placeholder={
                  pastaAtualId
                    ? `Nome da subpasta dentro de ${mapaPastas.get(pastaAtualId)?.nome}...`
                    : 'Nome da nova pasta...'
                }
                className="w-full min-w-0 sm:w-auto sm:flex-1 sm:min-w-[200px] rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3 py-1.5 text-xs text-[var(--text-primary)]"
              />
              <button
                type="submit"
                className="rounded-lg bg-[var(--accent-primary)] px-3 py-1.5 text-xs font-medium text-white cursor-pointer"
              >
                Criar pasta
              </button>
              <button
                type="button"
                onClick={() => setCriandoPasta(false)}
                className="rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] cursor-pointer"
              >
                Cancelar
              </button>
            </form>
          )}

          {/* Subpastas visíveis */}
          {subpastasAtuais.length > 0 && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {subpastasAtuais.map((pasta) => {
                const qtd = contagemDocsPorPasta.get(pasta.id) || 0;
                const renomeando = renomeandoPastaId === pasta.id;
                const confirmandoExcluirPasta = confirmandoExclusaoPastaId === pasta.id;

                return (
                  <div
                    key={pasta.id}
                    draggable={!pasta.fixa}
                    onDragStart={(e) => handleDragStartItem(e, 'pasta', pasta.id)}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDropAlvoId(pasta.id);
                    }}
                    onDragLeave={() => {
                      if (dropAlvoId === pasta.id) setDropAlvoId(null);
                    }}
                    onDrop={(e) => handleDropEmPasta(e, pasta.id)}
                    className={`rounded-xl border bg-[var(--bg-surface)] p-4 transition-colors ${
                      dropAlvoId === pasta.id
                        ? 'border-[var(--accent-primary)] ring-2 ring-[var(--accent-primary)]/30'
                        : 'border-[var(--border-hairline)] hover:border-[var(--accent-primary)]/50'
                    }`}
                  >
                    {renomeando ? (
                      <form
                        onSubmit={async (e) => {
                          e.preventDefault();
                          await renomearPasta(pasta.id, nomeRenomear);
                          setRenomeandoPastaId(null);
                        }}
                        className="flex items-center gap-1.5"
                      >
                        <input
                          type="text"
                          autoFocus
                          value={nomeRenomear}
                          onChange={(e) => setNomeRenomear(e.target.value)}
                          className="flex-1 rounded border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-2 py-1 text-xs"
                        />
                        <button
                          type="submit"
                          className="rounded bg-[var(--accent-primary)] px-2 py-1 text-xs text-white cursor-pointer"
                        >
                          Salvar
                        </button>
                      </form>
                    ) : (
                      <div className="flex items-start justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => setPastaAtualId(pasta.id)}
                          className="flex items-center gap-2.5 text-left min-w-0 flex-1 cursor-pointer"
                        >
                          <Folder className="h-5 w-5 shrink-0 text-[var(--accent-primary)]" />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
                              {pasta.nome}
                            </p>
                            <p className="text-xs font-mono-tabular text-[var(--text-muted)]">
                              {qtd} {qtd === 1 ? 'documento' : 'documentos'}
                            </p>
                          </div>
                        </button>

                        {!pasta.fixa && (
                          <div className="flex items-center gap-0.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                setRenomeandoPastaId(pasta.id);
                                setNomeRenomear(pasta.nome);
                              }}
                              title="Renomear pasta"
                              aria-label={`Renomear ${pasta.nome}`}
                              className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] cursor-pointer"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setConfirmandoExclusaoPastaId(
                                  confirmandoExcluirPasta ? null : pasta.id
                                )
                              }
                              title="Excluir pasta"
                              aria-label={`Excluir pasta ${pasta.nome}`}
                              className="rounded p-1 text-[var(--text-muted)] hover:text-red-600 cursor-pointer"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {confirmandoExcluirPasta && (
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-red-50 dark:bg-red-950/30 px-2.5 py-2 text-xs">
                        <span className="text-red-800 dark:text-red-200">
                          Excluir pasta e todo o conteúdo?
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={async () => {
                              await excluirPasta(pasta.id);
                              setConfirmandoExclusaoPastaId(null);
                            }}
                            className="rounded bg-red-600 px-2 py-0.5 font-medium text-white cursor-pointer"
                          >
                            Excluir
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmandoExclusaoPastaId(null)}
                            className="rounded px-2 py-0.5 text-[var(--text-secondary)] cursor-pointer"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Documentos na pasta atual */}
          {documentosAtuais.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {documentosAtuais.map(renderCartaoDocumento)}
            </div>
          ) : (
            subpastasAtuais.length === 0 && (
              <div className="rounded-xl border border-dashed border-[var(--border-hairline)] bg-[var(--bg-surface)] p-8 sm:p-10 text-center">
                <BrandLogo size="lg" className="mx-auto" />
                <h2 className="mt-3 text-sm font-semibold text-[var(--text-primary)]">
                  Pasta vazia
                </h2>
                <p className="mx-auto mt-1 max-w-md text-xs text-[var(--text-muted)]">
                  Importe um arquivo (Vade Mecum, lei, jurisprudência, súmulas ou doutrina) ou arraste documentos de outras pastas para cá.
                </p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <button
                    type="button"
                    onClick={onAbrirUpload}
                    className="rounded-lg bg-[var(--accent-primary)] px-3.5 py-1.5 text-xs font-medium text-white cursor-pointer"
                  >
                    Importar arquivo agora
                  </button>
                  {codigos.length === 0 && (
                    <button
                      type="button"
                      onClick={carregarAmostraDemonstracao}
                      className="rounded-lg border border-[var(--border-hairline)] px-3.5 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
                    >
                      Testar com CF/88, CP e CDC
                    </button>
                  )}
                </div>
              </div>
            )
          )}
        </div>
      </div>

      {/* Coleções Personalizadas */}
      <section className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-[var(--text-primary)]">
              Coleções personalizadas
            </h2>
            <p className="text-xs text-[var(--text-muted)]">
              Agrupe artigos, súmulas ou decisões estratégicas de vários documentos (ex.: “Mais cobrados na OAB”).
            </p>
          </div>
          <FolderPlus className="h-5 w-5 text-[var(--text-muted)]" aria-hidden="true" />
        </div>

        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!novaColecaoNome.trim()) return;
            await criarColecao(novaColecaoNome, novaColecaoDesc);
            setNovaColecaoNome('');
            setNovaColecaoDesc('');
          }}
          className="flex flex-wrap gap-2"
        >
          <input
            type="text"
            value={novaColecaoNome}
            onChange={(e) => setNovaColecaoNome(e.target.value)}
            placeholder="Nome da coleção (ex: Artigos mais cobrados)"
            className="w-full min-w-0 sm:w-auto sm:flex-1 sm:min-w-[200px] rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3 py-1.5 text-xs text-[var(--text-primary)]"
          />
          <input
            type="text"
            value={novaColecaoDesc}
            onChange={(e) => setNovaColecaoDesc(e.target.value)}
            placeholder="Descrição breve (opcional)"
            className="w-full min-w-0 sm:w-auto sm:flex-1 sm:min-w-[200px] rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3 py-1.5 text-xs text-[var(--text-primary)]"
          />
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent-primary)] px-3.5 py-1.5 text-xs font-medium text-white hover:opacity-90 cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Criar coleção
          </button>
        </form>

        {colecoes.length > 0 && (
          <div className="divide-y divide-[var(--border-hairline)] rounded-lg border border-[var(--border-hairline)]">
            {colecoes.map((col) => (
              <div key={col.id} className="p-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                      {col.nome}
                    </h3>
                    {col.descricao && (
                      <p className="text-xs text-[var(--text-muted)]">{col.descricao}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono-tabular text-[var(--text-muted)]">
                      {col.artigoIds.length} item(ns)
                    </span>
                    <button
                      type="button"
                      onClick={() => excluirColecao(col.id)}
                      className="rounded p-1 text-[var(--text-muted)] hover:text-red-600 cursor-pointer"
                      aria-label={`Excluir coleção ${col.nome}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {col.artigoIds.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {col.artigoIds.map((artId) => {
                      const art = mapaArtigos.get(artId);
                      if (!art) return null;
                      return (
                        <button
                          key={artId}
                          type="button"
                          onClick={() => abrirArtigoNoLeitor(art.codigoId, art.id)}
                          className="rounded-md border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-2.5 py-1 text-xs font-mono-tabular text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
                        >
                          {art.tipoUnidade && art.tipoUnidade !== 'artigo'
                            ? art.epigrafe || art.numero
                            : `Art. ${art.numero}`}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
