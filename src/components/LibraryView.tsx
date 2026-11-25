import {
  ArrowLeft,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Download,
  Edit2,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  Home,
  List,
  MoveRight,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { BrandLogo } from '@/src/components/BrandLogo';
import { db } from '@/src/db/database';
import { useLeiSecaStore } from '@/src/store/useLeiSecaStore';
import type { Artigo, Codigo, Pasta } from '@/src/types/domain';
import {
  buscarArtigosRankeados,
  codigoCorrespondeBusca,
  normalizarTextoBusca,
  obterCaminhoPasta,
  obterPastasDescendentes,
} from '@/src/utils/librarySearch';
import {
  formatarContagemUnidades,
  formatarDataBR,
  formatarRotuloUnidade,
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
  const [arvoreMobileAberta, setArvoreMobileAberta] = useState(false);

  const [buscaBiblioteca, setBuscaBiblioteca] = useState('');
  const [escopoBusca, setEscopoBusca] = useState<'toda' | 'pasta'>('toda');

  const [codigoArtigosAbertosId, setCodigoArtigosAbertosId] = useState<string | null>(null);
  const [filtroArtigoCard, setFiltroArtigoCard] = useState('');
  const [mostrarTodosArtigosCard, setMostrarTodosArtigosCard] = useState(false);

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

  const [suportaDragDesktop, setSuportaDragDesktop] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(hover: hover) and (pointer: fine)').matches
      : true
  );

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(hover: hover) and (pointer: fine)');
    const atualizar = () => setSuportaDragDesktop(mq.matches);
    atualizar();
    mq.addEventListener('change', atualizar);
    return () => mq.removeEventListener('change', atualizar);
  }, []);

  const mapaPastas = useMemo(() => new Map(pastas.map((p) => [p.id, p])), [pastas]);
  const mapaCodigos = useMemo(() => new Map(codigos.map((c) => [c.id, c])), [codigos]);
  const mapaArtigos = useMemo(() => new Map(artigos.map((a) => [a.id, a])), [artigos]);

  // Se a pasta selecionada deixar de existir (ex.: excluída), volta à raiz com segurança
  useEffect(() => {
    if (pastaAtualId && pastas.length > 0 && !mapaPastas.has(pastaAtualId)) {
      setPastaAtualId(null);
    }
  }, [pastaAtualId, pastas.length, mapaPastas]);

  // Se voltar à raiz, escopo volta para toda a biblioteca
  useEffect(() => {
    if (pastaAtualId === null && escopoBusca === 'pasta') {
      setEscopoBusca('toda');
    }
  }, [pastaAtualId, escopoBusca]);

  const artigosPorCodigo = useMemo(() => {
    const map = new Map<string, Artigo[]>();
    for (const art of artigos) {
      const lista = map.get(art.codigoId);
      if (lista) lista.push(art);
      else map.set(art.codigoId, [art]);
    }
    for (const lista of map.values()) {
      lista.sort((a, b) => a.ordem - b.ordem);
    }
    return map;
  }, [artigos]);

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
      return codigos.filter((c) => !c.pastaId || !mapaPastas.has(c.pastaId));
    }
    return codigos.filter((c) => c.pastaId === pastaAtualId);
  }, [codigos, pastaAtualId, mapaPastas]);

  // Resultados de busca na Biblioteca (pastas + códigos + artigos ranqueados)
  const termoBuscaLimpo = buscaBiblioteca.trim();
  const emModoBusca = termoBuscaLimpo.length > 0;

  const resultadosBusca = useMemo(() => {
    if (!emModoBusca) {
      return {
        pastas: [] as Pasta[],
        codigos: [] as Codigo[],
        artigos: [] as Artigo[],
      };
    }

    const termoNorm = normalizarTextoBusca(termoBuscaLimpo);
    const usarEscopoPasta = escopoBusca === 'pasta' && pastaAtualId !== null;
    const pastasEscopoIds = usarEscopoPasta
      ? obterPastasDescendentes(pastas, pastaAtualId!)
      : null;

    const pastasEncontradas = pastas.filter((p) => {
      if (pastasEscopoIds && (!pastasEscopoIds.has(p.id) || p.id === pastaAtualId)) {
        return false;
      }
      return normalizarTextoBusca(p.nome).includes(termoNorm);
    });

    const codigosEscopo = pastasEscopoIds
      ? codigos.filter((c) => !!c.pastaId && pastasEscopoIds.has(c.pastaId))
      : codigos;

    const codigosEncontrados = codigosEscopo.filter((c) =>
      codigoCorrespondeBusca(c, termoBuscaLimpo)
    );

    const idsCodigosEscopo = new Set(codigosEscopo.map((c) => c.id));
    const artigosEscopo = pastasEscopoIds
      ? artigos.filter((a) => idsCodigosEscopo.has(a.codigoId))
      : artigos;

    const artigosEncontrados = buscarArtigosRankeados(artigosEscopo, termoBuscaLimpo, {
      limite: 50,
    });

    return {
      pastas: pastasEncontradas,
      codigos: codigosEncontrados,
      artigos: artigosEncontrados,
    };
  }, [emModoBusca, termoBuscaLimpo, escopoBusca, pastaAtualId, pastas, codigos, artigos]);

  const selecionarPasta = (id: string | null, temFilhas?: boolean) => {
    setPastaAtualId(id);
    if (id && temFilhas) {
      setPastasExpandidas((prev) => ({ ...prev, [id]: true }));
    }
    setArvoreMobileAberta(false);
  };

  const handleDragStartItem = (
    e: React.DragEvent,
    tipo: 'codigo' | 'pasta',
    id: string
  ) => {
    if (!suportaDragDesktop) return;
    e.dataTransfer.setData('application/leiseca-tipo', tipo);
    e.dataTransfer.setData('application/leiseca-id', id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDropEmPasta = async (e: React.DragEvent, destinoPastaId: string) => {
    if (!suportaDragDesktop) return;
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
            draggable={suportaDragDesktop && !pasta.fixa}
            onDragStart={(e) => handleDragStartItem(e, 'pasta', pasta.id)}
            onDragOver={(e) => {
              if (!suportaDragDesktop) return;
              e.preventDefault();
              setDropAlvoId(pasta.id);
            }}
            onDragLeave={() => {
              if (dropAlvoId === pasta.id) setDropAlvoId(null);
            }}
            onDrop={(e) => handleDropEmPasta(e, pasta.id)}
            style={{ paddingLeft: `${nivel * 12 + 4}px` }}
            className={`group flex min-h-[40px] lg:min-h-0 items-center justify-between gap-1 rounded-lg py-1 pr-2 text-xs transition-colors ${
              dropAlvoId === pasta.id
                ? 'bg-[var(--accent-primary)]/15 ring-1 ring-[var(--accent-primary)]'
                : ativa
                ? 'bg-[var(--bg-subtle)] font-semibold text-[var(--text-primary)]'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]/60'
            }`}
          >
            <div className="flex items-center gap-0.5 min-w-0 flex-1">
              {temFilhas ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPastasExpandidas((prev) => ({ ...prev, [pasta.id]: !expandida }));
                  }}
                  className="flex min-h-[34px] min-w-[34px] lg:min-h-0 lg:min-w-0 lg:p-1 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] cursor-pointer shrink-0"
                  aria-label={expandida ? `Recolher ${pasta.nome}` : `Expandir ${pasta.nome}`}
                >
                  {expandida ? (
                    <ChevronDown className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5" />
                  )}
                </button>
              ) : (
                <span className="w-6 lg:w-5 shrink-0" />
              )}

              <button
                type="button"
                onClick={() => selecionarPasta(pasta.id, temFilhas)}
                className="flex min-h-[34px] lg:min-h-0 items-center gap-1.5 min-w-0 flex-1 py-1 text-left cursor-pointer"
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

  const renderCartaoDocumento = (cod: Codigo, exibirCaminho = false) => {
    const stats = progressoPorCodigo.get(cod.id) || { concluidos: 0, revisar: 0 };
    const pct =
      cod.totalArtigos > 0
        ? Math.min(100, Math.round((stats.concluidos / cod.totalArtigos) * 100))
        : 0;
    const confirmando = confirmandoExclusaoId === cod.id;
    const movendo = movendoCodigoId === cod.id;
    const artigosAbertos = codigoArtigosAbertosId === cod.id;
    const artigosDoc = artigosPorCodigo.get(cod.id) || [];
    const caminhoPasta = exibirCaminho ? obterCaminhoPasta(mapaPastas, cod.pastaId) : '';

    const artigosFiltradosDoc = artigosAbertos
      ? filtroArtigoCard.trim()
        ? buscarArtigosRankeados(artigosDoc, filtroArtigoCard, { limite: 120 })
        : mostrarTodosArtigosCard
        ? artigosDoc
        : artigosDoc.slice(0, 60)
      : [];

    return (
      <div
        key={cod.id}
        draggable={suportaDragDesktop}
        onDragStart={(e) => handleDragStartItem(e, 'codigo', cod.id)}
        className={`flex flex-col justify-between rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5 space-y-4 ${
          suportaDragDesktop ? 'lg:cursor-grab lg:active:cursor-grabbing' : ''
        }`}
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
          <button
            type="button"
            onClick={() => void abrirArtigoNoLeitor(cod.id)}
            className="mt-1.5 text-left text-base font-semibold text-[var(--text-primary)] line-clamp-2 hover:text-[var(--accent-primary)] transition-colors cursor-pointer"
          >
            {cod.nome}
          </button>
          {caminhoPasta && (
            <p className="mt-1 truncate text-xs text-[var(--text-muted)]">{caminhoPasta}</p>
          )}
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
              className="w-full rounded border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2 py-1.5 text-xs text-[var(--text-primary)]"
            >
              {pastas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border-hairline)] pt-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void abrirArtigoNoLeitor(cod.id)}
              className="min-h-[38px] sm:min-h-0 rounded-lg bg-[var(--accent-primary)] px-3.5 py-1.5 text-xs font-medium text-white hover:opacity-90 cursor-pointer"
            >
              Estudar
            </button>

            <button
              type="button"
              onClick={() => {
                if (artigosAbertos) {
                  setCodigoArtigosAbertosId(null);
                } else {
                  setCodigoArtigosAbertosId(cod.id);
                  setFiltroArtigoCard('');
                  setMostrarTodosArtigosCard(false);
                }
              }}
              className={`inline-flex min-h-[38px] sm:min-h-0 items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                artigosAbertos
                  ? 'border-[var(--accent-primary)] bg-[var(--bg-subtle)] text-[var(--text-primary)]'
                  : 'border-[var(--border-hairline)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]'
              }`}
              aria-expanded={artigosAbertos}
            >
              <List className="h-3.5 w-3.5" aria-hidden="true" />
              Artigos
            </button>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setMovendoCodigoId(movendo ? null : cod.id)}
              title="Mover para outra pasta"
              aria-label={`Mover ${cod.nome}`}
              className="min-h-[38px] min-w-[38px] sm:min-h-0 sm:min-w-0 inline-flex items-center justify-center rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] cursor-pointer"
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
              className="min-h-[38px] min-w-[38px] sm:min-h-0 sm:min-w-0 inline-flex items-center justify-center rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] cursor-pointer"
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
                className="min-h-[38px] min-w-[38px] sm:min-h-0 sm:min-w-0 inline-flex items-center justify-center rounded-lg p-1.5 text-[var(--text-muted)] hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Lista inline de artigos do documento para abrir direto no ponto desejado */}
        {artigosAbertos && (
          <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-canvas)] p-3 space-y-2.5">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-[var(--text-muted)]"
                aria-hidden="true"
              />
              <input
                type="text"
                value={filtroArtigoCard}
                onChange={(e) => setFiltroArtigoCard(e.target.value)}
                placeholder="Pesquisar número do artigo (ex: 5º, 121-A) ou palavra..."
                className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] py-1.5 pl-8 pr-8 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
              />
              {filtroArtigoCard && (
                <button
                  type="button"
                  onClick={() => setFiltroArtigoCard('')}
                  aria-label="Limpar filtro de artigos"
                  className="absolute right-2 top-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {artigosDoc.length === 0 ? (
              <p className="py-3 text-center text-xs text-[var(--text-muted)]">
                Nenhum artigo indexado neste documento.
              </p>
            ) : artigosFiltradosDoc.length === 0 ? (
              <p className="py-3 text-center text-xs text-[var(--text-muted)]">
                Nenhum artigo encontrado para "{filtroArtigoCard}".
              </p>
            ) : (
              <>
                <div className="touch-scroll max-h-64 overflow-y-auto divide-y divide-[var(--border-hairline)] rounded-md border border-[var(--border-hairline)] bg-[var(--bg-surface)]">
                  {artigosFiltradosDoc.map((art) => (
                    <button
                      key={art.id}
                      type="button"
                      onClick={() => void abrirArtigoNoLeitor(cod.id, art.id)}
                      className="flex min-h-[42px] w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer"
                    >
                      <div className="min-w-0 flex-1">
                        <span className="font-mono-tabular font-semibold text-[var(--text-primary)]">
                          {formatarRotuloUnidade(art, { curto: true })}
                        </span>
                        {art.epigrafe && art.tipoUnidade !== 'secao' ? (
                          <span className="ml-1.5 text-[var(--text-secondary)]">
                            · {art.epigrafe}
                          </span>
                        ) : (
                          <p className="truncate text-[0.72rem] text-[var(--text-muted)]">
                            {art.textoIntegral}
                          </p>
                        )}
                      </div>
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
                    </button>
                  ))}
                </div>

                {!filtroArtigoCard.trim() &&
                  !mostrarTodosArtigosCard &&
                  artigosDoc.length > 60 && (
                    <button
                      type="button"
                      onClick={() => setMostrarTodosArtigosCard(true)}
                      className="w-full rounded-md border border-[var(--border-hairline)] py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
                    >
                      Mostrar todos os {artigosDoc.length} itens
                    </button>
                  )}
              </>
            )}
          </div>
        )}
      </div>
    );
  };

  const pastaAtual = pastaAtualId ? mapaPastas.get(pastaAtualId) : undefined;
  const pastaPaiId = pastaAtual?.parentId || null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
            Biblioteca de Estudos
          </h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Organize Vade Mecum, leis avulsas, jurisprudência, súmulas e doutrina em pastas, ou pesquise diretamente por código ou número do artigo.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={carregarAmostraDemonstracao}
            className="inline-flex min-h-[40px] sm:min-h-0 items-center gap-2 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3.5 py-2 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] cursor-pointer whitespace-nowrap"
          >
            <BookOpen className="h-4 w-4" aria-hidden="true" />
            Carregar amostra oficial
          </button>

          <button
            type="button"
            onClick={onAbrirUpload}
            className="inline-flex min-h-[40px] sm:min-h-0 items-center gap-2 rounded-lg bg-[var(--accent-primary)] px-4 py-2 text-xs font-medium text-white hover:opacity-90 cursor-pointer whitespace-nowrap"
          >
            <Upload className="h-4 w-4" aria-hidden="true" />
            Importar arquivo
          </button>
        </div>
      </div>

      {/* Barra de Busca Direta na Biblioteca (pastas, códigos e artigos) */}
      <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-3 sm:p-4 space-y-2.5">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-muted)]"
              aria-hidden="true"
            />
            <input
              type="text"
              value={buscaBiblioteca}
              onChange={(e) => setBuscaBiblioteca(e.target.value)}
              placeholder="Buscar pasta, código ou número do artigo (ex: Art. 5º, 121-A, CF/88)..."
              aria-label="Buscar na Biblioteca de Estudos"
              className="w-full min-h-[42px] sm:min-h-[38px] rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-canvas)] py-2 pl-9 pr-9 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)]"
            />
            {buscaBiblioteca && (
              <button
                type="button"
                onClick={() => setBuscaBiblioteca('')}
                aria-label="Limpar busca"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {pastaAtualId && (
            <div className="flex items-center rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-canvas)] p-0.5 text-xs shrink-0">
              <button
                type="button"
                onClick={() => setEscopoBusca('toda')}
                className={`rounded-md px-3 py-1.5 font-medium cursor-pointer transition-colors ${
                  escopoBusca === 'toda'
                    ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xs'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                Toda a biblioteca
              </button>
              <button
                type="button"
                onClick={() => setEscopoBusca('pasta')}
                className={`rounded-md px-3 py-1.5 font-medium cursor-pointer transition-colors ${
                  escopoBusca === 'pasta'
                    ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xs'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                Nesta pasta
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Explorador de Pastas */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Árvore lateral de pastas (colapsável no celular para não ocultar os arquivos abaixo) */}
        <aside
          aria-label="Árvore de pastas"
          className={`lg:col-span-4 xl:col-span-3 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-3 space-y-2 self-start ${
            arvoreMobileAberta ? 'block' : 'hidden lg:block'
          }`}
        >
          <div className="flex items-center justify-between px-2 py-1">
            <span className="text-xs font-semibold text-[var(--text-primary)]">Pastas</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setCriandoPasta((v) => !v)}
                className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-[var(--accent-primary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
              >
                <FolderPlus className="h-3.5 w-3.5" />
                Nova pasta
              </button>
              <button
                type="button"
                onClick={() => setArvoreMobileAberta(false)}
                className="lg:hidden rounded p-1 text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] cursor-pointer"
                aria-label="Fechar lista de pastas"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={() => selecionarPasta(null)}
            className={`flex min-h-[38px] lg:min-h-0 w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs cursor-pointer ${
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

        {/* Conteúdo da pasta selecionada ou resultados de busca */}
        <div className="lg:col-span-8 xl:col-span-9 space-y-4">
          {emModoBusca ? (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-4 py-3">
                <p className="text-xs text-[var(--text-secondary)]">
                  Resultados para{' '}
                  <span className="font-semibold text-[var(--text-primary)]">
                    "{termoBuscaLimpo}"
                  </span>{' '}
                  {escopoBusca === 'pasta' && pastaAtual
                    ? `em ${pastaAtual.nome}`
                    : 'em toda a biblioteca'}
                  :{' '}
                  <span className="font-mono-tabular text-[var(--text-muted)]">
                    {resultadosBusca.pastas.length} pasta(s), {resultadosBusca.codigos.length}{' '}
                    documento(s), {resultadosBusca.artigos.length} artigo(s)
                  </span>
                </p>
                <button
                  type="button"
                  onClick={() => setBuscaBiblioteca('')}
                  className="text-xs font-medium text-[var(--accent-primary)] hover:underline cursor-pointer"
                >
                  Limpar busca
                </button>
              </div>

              {resultadosBusca.pastas.length === 0 &&
              resultadosBusca.codigos.length === 0 &&
              resultadosBusca.artigos.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[var(--border-hairline)] bg-[var(--bg-surface)] p-8 text-center space-y-3">
                  <p className="text-sm font-medium text-[var(--text-primary)]">
                    Nenhum resultado encontrado para "{termoBuscaLimpo}".
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">
                    Tente buscar pelo número do artigo (ex: 5, 121-A), pelo nome ou sigla do código, ou por palavras-chave do texto.
                  </p>
                  {escopoBusca === 'pasta' && (
                    <button
                      type="button"
                      onClick={() => setEscopoBusca('toda')}
                      className="rounded-lg bg-[var(--accent-primary)] px-3.5 py-1.5 text-xs font-medium text-white cursor-pointer"
                    >
                      Buscar em toda a biblioteca
                    </button>
                  )}
                </div>
              ) : (
                <>
                  {resultadosBusca.pastas.length > 0 && (
                    <section className="space-y-2.5">
                      <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                        Pastas encontradas
                      </h2>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {resultadosBusca.pastas.map((pasta) => {
                          const qtd = contagemDocsPorPasta.get(pasta.id) || 0;
                          const caminho = obterCaminhoPasta(mapaPastas, pasta.parentId || undefined);
                          return (
                            <button
                              key={pasta.id}
                              type="button"
                              onClick={() => {
                                selecionarPasta(pasta.id, true);
                                setBuscaBiblioteca('');
                              }}
                              className="flex items-center gap-3 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4 text-left hover:border-[var(--accent-primary)]/60 transition-colors cursor-pointer"
                            >
                              <Folder className="h-5 w-5 shrink-0 text-[var(--accent-primary)]" />
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
                                  {pasta.nome}
                                </p>
                                {caminho && (
                                  <p className="truncate text-[0.72rem] text-[var(--text-muted)]">
                                    {caminho}
                                  </p>
                                )}
                                <p className="text-xs font-mono-tabular text-[var(--text-muted)]">
                                  {qtd} {qtd === 1 ? 'documento' : 'documentos'}
                                </p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  )}

                  {resultadosBusca.codigos.length > 0 && (
                    <section className="space-y-2.5">
                      <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                        Códigos e documentos encontrados
                      </h2>
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        {resultadosBusca.codigos.map((cod) => renderCartaoDocumento(cod, true))}
                      </div>
                    </section>
                  )}

                  {resultadosBusca.artigos.length > 0 && (
                    <section className="space-y-2.5">
                      <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                        Artigos e unidades encontradas
                      </h2>
                      <div className="divide-y divide-[var(--border-hairline)] rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] overflow-hidden">
                        {resultadosBusca.artigos.map((art) => {
                          const cod = mapaCodigos.get(art.codigoId);
                          const caminho = cod?.pastaId
                            ? obterCaminhoPasta(mapaPastas, cod.pastaId)
                            : '';
                          return (
                            <button
                              key={art.id}
                              type="button"
                              onClick={() => void abrirArtigoNoLeitor(art.codigoId, art.id)}
                              className="flex w-full items-start justify-between gap-3 px-4 py-3.5 text-left hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer"
                            >
                              <div className="min-w-0 flex-1 space-y-1">
                                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                                  <span className="rounded bg-[var(--bg-subtle)] px-1.5 py-0.5 font-mono-tabular font-semibold text-[var(--text-primary)]">
                                    {cod?.sigla || 'Doc'}
                                  </span>
                                  <span className="font-mono-tabular font-semibold text-[var(--accent-primary)]">
                                    {formatarRotuloUnidade(art, { curto: true })}
                                  </span>
                                  {art.epigrafe && art.tipoUnidade !== 'secao' && (
                                    <span className="font-medium text-[var(--text-secondary)]">
                                      · {art.epigrafe}
                                    </span>
                                  )}
                                  {caminho && (
                                    <span className="truncate text-[0.72rem] text-[var(--text-muted)]">
                                      ({caminho})
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-[var(--text-secondary)] line-clamp-2 leading-relaxed">
                                  {art.textoIntegral}
                                </p>
                              </div>
                              <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-[var(--text-muted)]" />
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  )}
                </>
              )}
            </div>
          ) : (
            <>
              {/* Breadcrumb + Controles de Pasta (Mobile e Desktop) */}
              <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3.5 py-3 sm:px-4">
                <div className="flex flex-wrap items-center gap-2 min-w-0">
                  <button
                    type="button"
                    onClick={() => setArvoreMobileAberta((v) => !v)}
                    className="lg:hidden inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
                    aria-expanded={arvoreMobileAberta}
                  >
                    <Folder className="h-3.5 w-3.5" aria-hidden="true" />
                    Pastas
                  </button>

                  {pastaAtualId && (
                    <button
                      type="button"
                      onClick={() => selecionarPasta(pastaPaiId)}
                      className="inline-flex min-h-[36px] sm:min-h-0 items-center gap-1 rounded-lg border border-[var(--border-hairline)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
                      aria-label="Voltar para pasta anterior"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                      Voltar
                    </button>
                  )}

                  <nav aria-label="Caminho de pastas" className="flex flex-wrap items-center gap-1.5 text-xs">
                    <button
                      type="button"
                      onClick={() => selecionarPasta(null)}
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
                          onClick={() => selecionarPasta(p.id)}
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
                </div>

                <button
                  type="button"
                  onClick={() => setCriandoPasta((v) => !v)}
                  className="inline-flex min-h-[36px] sm:min-h-0 items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
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
                    const temFilhas = pastas.some((p) => p.parentId === pasta.id);

                    return (
                      <div
                        key={pasta.id}
                        draggable={suportaDragDesktop && !pasta.fixa}
                        onDragStart={(e) => handleDragStartItem(e, 'pasta', pasta.id)}
                        onDragOver={(e) => {
                          if (!suportaDragDesktop) return;
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
                              onClick={() => selecionarPasta(pasta.id, temFilhas)}
                              className="flex min-h-[40px] items-center gap-2.5 text-left min-w-0 flex-1 cursor-pointer"
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
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setRenomeandoPastaId(pasta.id);
                                    setNomeRenomear(pasta.nome);
                                  }}
                                  title="Renomear pasta"
                                  aria-label={`Renomear ${pasta.nome}`}
                                  className="min-h-[36px] min-w-[36px] sm:min-h-0 sm:min-w-0 inline-flex items-center justify-center rounded p-1 text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] cursor-pointer"
                                >
                                  <Edit2 className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setConfirmandoExclusaoPastaId(
                                      confirmandoExcluirPasta ? null : pasta.id
                                    );
                                  }}
                                  title="Excluir pasta"
                                  aria-label={`Excluir pasta ${pasta.nome}`}
                                  className="min-h-[36px] min-w-[36px] sm:min-h-0 sm:min-w-0 inline-flex items-center justify-center rounded p-1 text-[var(--text-muted)] hover:text-red-600 cursor-pointer"
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
                  {documentosAtuais.map((cod) => renderCartaoDocumento(cod))}
                </div>
              ) : (
                subpastasAtuais.length === 0 && (
                  <div className="rounded-xl border border-dashed border-[var(--border-hairline)] bg-[var(--bg-surface)] p-8 sm:p-10 text-center">
                    <BrandLogo size="lg" className="mx-auto" />
                    <h2 className="mt-3 text-sm font-semibold text-[var(--text-primary)]">
                      Pasta vazia
                    </h2>
                    <p className="mx-auto mt-1 max-w-md text-xs text-[var(--text-muted)]">
                      Importe um arquivo (Vade Mecum, lei, jurisprudência, súmulas ou doutrina) ou mova documentos de outras pastas para cá.
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
            </>
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
          <FileText className="h-5 w-5 text-[var(--text-muted)]" aria-hidden="true" />
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
                          onClick={() => void abrirArtigoNoLeitor(art.codigoId, art.id)}
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
