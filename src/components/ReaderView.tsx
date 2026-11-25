import { useVirtualizer } from '@tanstack/react-virtual';
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  Edit3,
  Eye,
  EyeOff,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  Highlighter,
  Layers,
  List,
  Maximize2,
  MessageSquarePlus,
  Minimize2,
  PanelLeft,
  PanelRight,
  Redo2,
  Search,
  SlidersHorizontal,
  Star,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/src/db/database';
import { formatarHierarquiaResumo } from '@/src/parser/legalParser';
import { useLeiSecaStore } from '@/src/store/useLeiSecaStore';
import type {
  Anotacao,
  Artigo,
  Codigo,
  Grifo,
  Pasta,
  Progresso,
  StatusEstudo,
} from '@/src/types/domain';
import {
  buscarArtigosRankeados,
  codigoCorrespondeBusca,
  normalizarTextoBusca,
  pontuarArtigoParaBusca,
} from '@/src/utils/librarySearch';
import { formatarRotuloUnidade } from '@/src/utils/studyHelpers';
import { ArticleBlockRenderer } from './ArticleBlockRenderer';
import { ArticleEditorModal } from './ArticleEditorModal';
import { BrandLogo } from './BrandLogo';
import { RichNoteEditor } from './RichNoteEditor';

interface SelecaoPendente {
  artigoId: string;
  codigoId: string;
  blocoId: string;
  inicio: number;
  fim: number;
  trecho: string;
  contextoAntes: string;
  contextoDepois: string;
  x: number;
  y: number;
  acima: boolean;
}

interface GrifoAtivoPopover {
  grifo: Grifo;
  x: number;
  y: number;
  acima: boolean;
}

interface GrupoArvore {
  chave: string;
  titulo: string;
  artigos: Artigo[];
}

function calcularPosicaoPopoverFlutuante(rect: DOMRect): {
  x: number;
  y: number;
  acima: boolean;
} {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const margemLateral = 8;
  const larguraEstimada = Math.min(340, vw - margemLateral * 2);
  const metade = larguraEstimada / 2;

  const centroAlvo = rect.left + rect.width / 2;
  const x = Math.min(
    vw - metade - margemLateral,
    Math.max(metade + margemLateral, centroAlvo)
  );

  const acima = rect.top >= 150;
  const y = acima
    ? Math.min(vh - 24, Math.max(72, rect.top - 10))
    : Math.min(vh - 96, Math.max(64, rect.bottom + 10));

  return { x, y, acima };
}

function obterOffsetNoBloco(blocoEl: HTMLElement, container: Node, offset: number): number {
  let cursor: Node | null = container;
  while (cursor && cursor !== blocoEl) {
    if (cursor instanceof HTMLElement && cursor.dataset.segOffset !== undefined) {
      const base = parseInt(cursor.dataset.segOffset, 10);
      const range = document.createRange();
      range.selectNodeContents(cursor);
      range.setEnd(container, offset);
      return base + range.toString().length;
    }
    cursor = cursor.parentNode;
  }

  const range = document.createRange();
  range.selectNodeContents(blocoEl);
  range.setEnd(container, offset);
  return range.toString().length;
}

export const ReaderView: React.FC = () => {
  const {
    codigoAtivoId,
    artigoAtivoId,
    configuracao,
    sidebarLeitorAberta,
    painelNotasAberto,
    modoMemorizacao,
    undoStack,
    redoStack,
    setSidebarLeitorAberta,
    setPainelNotasAberto,
    setModoMemorizacao,
    definirLarguraSidebarLeitor,
    definirLarguraPainelNotas,
    alternarModoFocoTotal,
    abrirArtigoNoLeitor,
    definirArtigoAtivo,
    atualizarPreferencias,
    criarGrifo,
    alterarCorGrifo,
    removerGrifo,
    salvarAnotacao,
    removerAnotacao,
    alternarFavorito,
    definirStatusEstudo,
    alternarArtigoEmColecao,
    criarColecao,
    desfazer,
    refazer,
    navegarPara,
    mostrarToast,
  } = useLeiSecaStore();

  const { preferencias, cores } = configuracao;
  const temaEscuro = preferencias.tema === 'escuro';
  const modoFocoTotal = !!preferencias.modoFocoTotal;
  const larguraSalvaLeitor = preferencias.sidebarLeitorLargura ?? 312;
  const larguraSalvaNotas = preferencias.painelNotasLargura ?? 360;

  const [larguraLeitorTemp, setLarguraLeitorTemp] = useState(larguraSalvaLeitor);
  const [redimensionandoLeitor, setRedimensionandoLeitor] = useState(false);
  const larguraLeitorRef = useRef(larguraSalvaLeitor);

  const [larguraNotasTemp, setLarguraNotasTemp] = useState(larguraSalvaNotas);
  const [redimensionandoNotas, setRedimensionandoNotas] = useState(false);
  const larguraNotasRef = useRef(larguraSalvaNotas);

  useEffect(() => {
    setLarguraLeitorTemp(larguraSalvaLeitor);
    larguraLeitorRef.current = larguraSalvaLeitor;
  }, [larguraSalvaLeitor]);

  useEffect(() => {
    setLarguraNotasTemp(larguraSalvaNotas);
    larguraNotasRef.current = larguraSalvaNotas;
  }, [larguraSalvaNotas]);

  const pastas = useLiveQuery(() => db.pastas.orderBy('ordem').toArray(), []) || [];
  const codigos = useLiveQuery(() => db.codigos.orderBy('ordem').toArray(), []) || [];
  const codigoAtivo = useMemo(
    () => codigos.find((c) => c.id === codigoAtivoId) || codigos[0] || null,
    [codigos, codigoAtivoId]
  );

  const artigosResultado = useLiveQuery(
    async () => {
      if (!codigoAtivo) {
        return { codigoId: null as string | null, lista: [] as Artigo[] };
      }
      const lista = await db.artigos
        .where('codigoId')
        .equals(codigoAtivo.id)
        .sortBy('ordem');
      return { codigoId: codigoAtivo.id, lista };
    },
    [codigoAtivo?.id]
  );

  const artigosProntos =
    !!codigoAtivo &&
    artigosResultado !== undefined &&
    artigosResultado.codigoId === codigoAtivo.id;

  const artigos = artigosProntos ? artigosResultado.lista : [];

  const grifosCodigo =
    useLiveQuery(
      async () => {
        if (!codigoAtivo) return [];
        return db.grifos.where('codigoId').equals(codigoAtivo.id).toArray();
      },
      [codigoAtivo?.id]
    ) || [];

  const anotacoesCodigo =
    useLiveQuery(
      async () => {
        if (!codigoAtivo) return [];
        return db.anotacoes.where('codigoId').equals(codigoAtivo.id).toArray();
      },
      [codigoAtivo?.id]
    ) || [];

  const progressosCodigo =
    useLiveQuery(
      async () => {
        if (!codigoAtivo) return [];
        return db.progressos.where('codigoId').equals(codigoAtivo.id).toArray();
      },
      [codigoAtivo?.id]
    ) || [];

  const colecoes = useLiveQuery(() => db.colecoes.toArray(), []) || [];

  const mapaPastas = useMemo(() => new Map(pastas.map((p) => [p.id, p])), [pastas]);

  const mapaGrifosPorArtigo = useMemo(() => {
    const map = new Map<string, Grifo[]>();
    for (const g of grifosCodigo) {
      const arr = map.get(g.artigoId) || [];
      arr.push(g);
      map.set(g.artigoId, arr);
    }
    return map;
  }, [grifosCodigo]);

  const mapaAnotacoesPorArtigo = useMemo(() => {
    const map = new Map<string, Anotacao[]>();
    for (const n of anotacoesCodigo) {
      const arr = map.get(n.artigoId) || [];
      arr.push(n);
      map.set(n.artigoId, arr);
    }
    return map;
  }, [anotacoesCodigo]);

  const mapaProgresso = useMemo(() => {
    const map = new Map<string, Progresso>();
    for (const p of progressosCodigo) map.set(p.artigoId, p);
    return map;
  }, [progressosCodigo]);

  const indiceAtivo = useMemo(() => {
    if (artigos.length === 0) return -1;
    const idx = artigos.findIndex((a) => a.id === artigoAtivoId);
    return idx !== -1 ? idx : 0;
  }, [artigos, artigoAtivoId]);

  const artigoAtivo = indiceAtivo >= 0 ? artigos[indiceAtivo] : null;

  // Estados locais de UI do leitor
  const [buscaArvore, setBuscaArvore] = useState('');
  const [filtroArvore, setFiltroArvore] = useState<'todos' | 'favoritos' | 'revisar'>('todos');
  const [pastasExpandidas, setPastasExpandidas] = useState<Record<string, boolean>>({});
  const [gruposColapsados, setGruposColapsados] = useState<Record<string, boolean>>({});
  const [irParaNumero, setIrParaNumero] = useState('');
  const [popoverTipografia, setPopoverTipografia] = useState(false);
  const [popoverColecao, setPopoverColecao] = useState(false);
  const [novaColecaoNome, setNovaColecaoNome] = useState('');
  const [artigoEmEdicao, setArtigoEmEdicao] = useState<Artigo | null>(null);
  const [revelarTudoCloze, setRevelarTudoCloze] = useState(false);

  const [selecaoPendente, setSelecaoPendente] = useState<SelecaoPendente | null>(null);
  const [grifoPopover, setGrifoPopover] = useState<GrifoAtivoPopover | null>(null);

  // Composer de nova nota no painel direito
  const [novaNotaDados, setNovaNotaDados] = useState<{
    artigoId: string;
    blocoId?: string;
    grifoId?: string;
    inicio?: number;
    fim?: number;
    trechoSelecionado?: string;
    corId?: string;
  } | null>(null);
  const [notaDestacadaId, setNotaDestacadaId] = useState<string | null>(null);

  const irParaInputRef = useRef<HTMLInputElement>(null);
  const listaScrollRef = useRef<HTMLDivElement>(null);
  const ultimaPastaAutoExpandidaRef = useRef<string>('');
  const ultimoScrollChaveRef = useRef<string>('');
  const skipNextAutoScrollRef = useRef<boolean>(false);
  const interagindoPopoverRef = useRef<boolean>(false);

  const marcarInteracaoPopover = useCallback(() => {
    interagindoPopoverRef.current = true;
    window.setTimeout(() => {
      interagindoPopoverRef.current = false;
    }, 350);
  }, []);

  const [resultadosOutrosCodigos, setResultadosOutrosCodigos] = useState<Artigo[]>([]);

  // Garantir artigo ativo ao abrir leitor somente após os artigos do código atual carregarem
  useEffect(() => {
    if (!artigosProntos || !codigoAtivo || artigos.length === 0) return;
    if (!artigoAtivoId || !artigos.some((a) => a.id === artigoAtivoId)) {
      void definirArtigoAtivo(artigos[0].id);
    }
  }, [artigosProntos, codigoAtivo?.id, artigos, artigoAtivoId, definirArtigoAtivo]);

  // Expande automaticamente o caminho de pastas apenas quando muda o documento ativo
  useEffect(() => {
    if (!codigoAtivo?.pastaId || mapaPastas.size === 0) return;
    const chave = `${codigoAtivo.id}:${codigoAtivo.pastaId}`;
    if (ultimaPastaAutoExpandidaRef.current === chave) return;
    if (!mapaPastas.has(codigoAtivo.pastaId)) return;
    ultimaPastaAutoExpandidaRef.current = chave;

    const expandidos: Record<string, boolean> = {};
    let cur = mapaPastas.get(codigoAtivo.pastaId);
    let guarda = 0;
    while (cur && guarda < 10) {
      expandidos[cur.id] = true;
      cur = cur.parentId ? mapaPastas.get(cur.parentId) : undefined;
      guarda += 1;
    }
    setPastasExpandidas((prev) => ({ ...prev, ...expandidos }));
  }, [codigoAtivo?.id, codigoAtivo?.pastaId, mapaPastas]);

  // Caminho de pastas para breadcrumb superior
  const caminhoPastasAtivo = useMemo(() => {
    const trilha: Pasta[] = [];
    if (!codigoAtivo?.pastaId) return trilha;
    let cur = mapaPastas.get(codigoAtivo.pastaId);
    let guarda = 0;
    while (cur && guarda < 10) {
      trilha.unshift(cur);
      cur = cur.parentId ? mapaPastas.get(cur.parentId) : undefined;
      guarda += 1;
    }
    return trilha;
  }, [codigoAtivo?.pastaId, mapaPastas]);

  // Contagem recursiva de documentos por pasta
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

  const mapaCodigos = useMemo(() => new Map(codigos.map((c) => [c.id, c])), [codigos]);

  // Busca secundária em outros documentos quando usuário digita na árvore lateral
  useEffect(() => {
    const termo = buscaArvore.trim();
    if (!termo || !codigoAtivo) {
      setResultadosOutrosCodigos([]);
      return;
    }
    let cancelado = false;
    const timer = setTimeout(async () => {
      try {
        const outros = await db.artigos
          .where('codigoId')
          .notEqual(codigoAtivo.id)
          .toArray();
        const ranqueados = buscarArtigosRankeados(outros, termo, { limite: 20 });
        if (!cancelado) setResultadosOutrosCodigos(ranqueados);
      } catch {
        if (!cancelado) setResultadosOutrosCodigos([]);
      }
    }, 150);

    return () => {
      cancelado = true;
      clearTimeout(timer);
    };
  }, [buscaArvore, codigoAtivo?.id]);

  // Agrupamento hierárquico dos itens/artigos do documento ativo
  const gruposArvore = useMemo<GrupoArvore[]>(() => {
    const termo = buscaArvore.trim();

    const filtradosComScore: Array<{ art: Artigo; score: number }> = [];
    for (const art of artigos) {
      if (filtroArvore === 'favoritos' && !art.favorito) continue;
      if (filtroArvore === 'revisar') {
        const st = mapaProgresso.get(art.id)?.status;
        if (st !== 'revisar') continue;
      }
      if (!termo) {
        filtradosComScore.push({ art, score: 0 });
      } else {
        const score = pontuarArtigoParaBusca(art, termo);
        if (score !== null) {
          filtradosComScore.push({ art, score });
        }
      }
    }

    if (termo) {
      filtradosComScore.sort((a, b) => {
        if (a.score !== b.score) return a.score - b.score;
        return a.art.ordem - b.art.ordem;
      });
    }

    const grupos: GrupoArvore[] = [];
    const mapa = new Map<string, GrupoArvore>();

    for (const { art } of filtradosComScore) {
      const titulo =
        formatarHierarquiaResumo(art.hierarquia) ||
        (art.tipoUnidade === 'sumula'
          ? 'Súmulas'
          : art.tipoUnidade === 'decisao'
          ? 'Decisões'
          : art.tipoUnidade === 'secao'
          ? 'Seções'
          : 'Disposições Gerais');
      let grupo = mapa.get(titulo);
      if (!grupo) {
        grupo = { chave: titulo, titulo, artigos: [] };
        mapa.set(titulo, grupo);
        grupos.push(grupo);
      }
      grupo.artigos.push(art);
    }

    return grupos;
  }, [artigos, buscaArvore, filtroArvore, mapaProgresso]);

  // Virtualizer para Modo Lista Contínua
  const virtualizer = useVirtualizer({
    count: artigos.length,
    getScrollElement: () => listaScrollRef.current,
    estimateSize: () => 220,
    overscan: 6,
  });

  // Garante rolagem até o artigo alvo no Modo Lista ao abrir via Biblioteca ou Busca
  useEffect(() => {
    if (
      !artigosProntos ||
      preferencias.modoVisualizacao !== 'lista' ||
      indiceAtivo < 0 ||
      !codigoAtivo
    ) {
      return;
    }
    const alvo = artigos[indiceAtivo];
    if (!alvo) return;
    const chave = `${codigoAtivo.id}:${alvo.id}:${preferencias.modoVisualizacao}`;
    if (ultimoScrollChaveRef.current === chave) return;
    ultimoScrollChaveRef.current = chave;

    if (skipNextAutoScrollRef.current) {
      skipNextAutoScrollRef.current = false;
      return;
    }

    const raf = requestAnimationFrame(() => {
      virtualizer.scrollToIndex(indiceAtivo, { align: 'start' });
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artigosProntos, codigoAtivo?.id, artigoAtivoId, preferencias.modoVisualizacao, indiceAtivo]);

  const navegarParaIndice = useCallback(
    async (novoIdx: number) => {
      if (novoIdx < 0 || novoIdx >= artigos.length) return;
      const alvo = artigos[novoIdx];
      await definirArtigoAtivo(alvo.id);
      if (preferencias.modoVisualizacao === 'lista') {
        virtualizer.scrollToIndex(novoIdx, { align: 'start' });
      }
    },
    [artigos, definirArtigoAtivo, preferencias.modoVisualizacao, virtualizer]
  );

  const handleIrParaArtigo = async (e: React.FormEvent) => {
    e.preventDefault();
    const consultaLimpa = irParaNumero.trim();
    if (!consultaLimpa) return;
    const melhor = buscarArtigosRankeados(artigos, consultaLimpa, { limite: 1 })[0];
    const idxAprox = melhor ? artigos.findIndex((a) => a.id === melhor.id) : -1;
    if (idxAprox === -1) {
      mostrarToast(`Item "${irParaNumero}" não encontrado neste documento.`, 'erro');
      return;
    }
    await navegarParaIndice(idxAprox);
    setIrParaNumero('');
  };

  // Redimensionamento por arrasto da sidebar do leitor
  const iniciarResizeLeitor = (e: React.MouseEvent) => {
    e.preventDefault();
    setRedimensionandoLeitor(true);
    const inicioX = e.clientX;
    const larguraInicial = larguraLeitorTemp;

    const onMouseMove = (ev: MouseEvent) => {
      const delta = ev.clientX - inicioX;
      const nova = Math.max(220, Math.min(440, larguraInicial + delta));
      larguraLeitorRef.current = nova;
      setLarguraLeitorTemp(nova);
    };
    const onMouseUp = () => {
      setRedimensionandoLeitor(false);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      void definirLarguraSidebarLeitor(larguraLeitorRef.current);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // Redimensionamento por arrasto do painel direito de anotações (desktop)
  const iniciarResizeNotas = (e: React.MouseEvent) => {
    e.preventDefault();
    setRedimensionandoNotas(true);
    const inicioX = e.clientX;
    const larguraInicial = larguraNotasTemp;

    const onMouseMove = (ev: MouseEvent) => {
      const delta = inicioX - ev.clientX;
      const nova = Math.max(280, Math.min(520, larguraInicial + delta));
      larguraNotasRef.current = nova;
      setLarguraNotasTemp(nova);
    };
    const onMouseUp = () => {
      setRedimensionandoNotas(false);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      void definirLarguraPainelNotas(larguraNotasRef.current);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // Captura seleção de texto (Desktop e Mobile) e oculta balão se a seleção foi desfeita
  const processarSelecaoTexto = useCallback(() => {
    if (modoMemorizacao) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      if (!interagindoPopoverRef.current) {
        setSelecaoPendente(null);
      }
      return;
    }
    const range = sel.getRangeAt(0);
    const textoSel = sel.toString().trim();
    if (textoSel.length < 2) {
      if (!interagindoPopoverRef.current) {
        setSelecaoPendente(null);
      }
      return;
    }

    let node: Node | null = range.commonAncestorContainer;
    let blocoEl: HTMLElement | null = null;
    let artigoEl: HTMLElement | null = null;

    while (node) {
      if (node instanceof HTMLElement) {
        if (!blocoEl && node.dataset.blocoId) blocoEl = node;
        if (!artigoEl && node.dataset.artigoId) artigoEl = node;
      }
      node = node.parentNode;
    }

    if (!blocoEl || !artigoEl) {
      if (!interagindoPopoverRef.current) {
        setSelecaoPendente(null);
      }
      return;
    }

    const blocoId = blocoEl.dataset.blocoId!;
    const artigoId = artigoEl.dataset.artigoId!;
    const art = artigos.find((a) => a.id === artigoId);
    const bloco = art?.blocos.find((b) => b.id === blocoId);
    if (!art || !bloco) return;

    const offA = obterOffsetNoBloco(blocoEl, range.startContainer, range.startOffset);
    const offB = obterOffsetNoBloco(blocoEl, range.endContainer, range.endOffset);
    const inicio = Math.max(0, Math.min(offA, offB));
    const fim = Math.min(bloco.texto.length, Math.max(offA, offB));
    if (fim <= inicio) return;

    const trechoLiteral = bloco.texto.slice(inicio, fim);
    const rect = range.getBoundingClientRect();
    const pos = calcularPosicaoPopoverFlutuante(rect);

    setGrifoPopover(null);
    setSelecaoPendente({
      artigoId: art.id,
      codigoId: art.codigoId,
      blocoId,
      inicio,
      fim,
      trecho: trechoLiteral,
      contextoAntes: bloco.texto.slice(Math.max(0, inicio - 24), inicio),
      contextoDepois: bloco.texto.slice(fim, Math.min(bloco.texto.length, fim + 24)),
      x: pos.x,
      y: pos.y,
      acima: pos.acima,
    });
  }, [artigos, modoMemorizacao]);

  useEffect(() => {
    let timer: number | null = null;
    const onSelectionChange = () => {
      if (timer) window.clearTimeout(timer);
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.toString().trim().length < 2) {
        timer = window.setTimeout(() => {
          if (interagindoPopoverRef.current) return;
          const atual = window.getSelection();
          if (!atual || atual.isCollapsed || atual.toString().trim().length < 2) {
            setSelecaoPendente(null);
          }
        }, 70);
        return;
      }
      timer = window.setTimeout(() => {
        const atual = window.getSelection();
        if (!atual || atual.isCollapsed || atual.toString().trim().length < 2) {
          if (!interagindoPopoverRef.current) setSelecaoPendente(null);
          return;
        }
        processarSelecaoTexto();
      }, 240);
    };
    document.addEventListener('selectionchange', onSelectionChange);
    return () => {
      if (timer) window.clearTimeout(timer);
      document.removeEventListener('selectionchange', onSelectionChange);
    };
  }, [processarSelecaoTexto]);

  // Fecha o balão automaticamente ao clicar/tocar em outra parte fora do balão
  useEffect(() => {
    if (!selecaoPendente && !grifoPopover) return;
    const onPointerDownFora = (e: PointerEvent) => {
      const alvo = e.target as HTMLElement | null;
      if (!alvo) return;
      if (alvo.closest('[data-popover-grifo="true"]')) return;

      if (grifoPopover && !alvo.closest('[data-grifo-id]')) {
        setGrifoPopover(null);
      }

      if (selecaoPendente) {
        window.setTimeout(() => {
          if (interagindoPopoverRef.current) return;
          const sel = window.getSelection();
          if (!sel || sel.isCollapsed || sel.toString().trim().length < 2) {
            setSelecaoPendente(null);
          }
        }, 60);
      }
    };
    document.addEventListener('pointerdown', onPointerDownFora, true);
    return () => document.removeEventListener('pointerdown', onPointerDownFora, true);
  }, [selecaoPendente, grifoPopover]);

  // Fecha popovers abertos ao trocar de artigo ou documento
  useEffect(() => {
    setSelecaoPendente(null);
    setGrifoPopover(null);
  }, [codigoAtivo?.id, artigoAtivoId]);

  const aplicarGrifoComCor = useCallback(
    async (corId: string) => {
      if (!selecaoPendente) return;
      await criarGrifo({
        codigoId: selecaoPendente.codigoId,
        artigoId: selecaoPendente.artigoId,
        blocoId: selecaoPendente.blocoId,
        corId,
        inicio: selecaoPendente.inicio,
        fim: selecaoPendente.fim,
        trecho: selecaoPendente.trecho,
        contextoAntes: selecaoPendente.contextoAntes,
        contextoDepois: selecaoPendente.contextoDepois,
      });
      window.getSelection()?.removeAllRanges();
      setSelecaoPendente(null);
    },
    [selecaoPendente, criarGrifo]
  );

  const iniciarNotaDeSelecao = async () => {
    if (!selecaoPendente) return;
    const grifoCriado = await criarGrifo({
      codigoId: selecaoPendente.codigoId,
      artigoId: selecaoPendente.artigoId,
      blocoId: selecaoPendente.blocoId,
      corId: cores[0]?.id || 'amarelo',
      inicio: selecaoPendente.inicio,
      fim: selecaoPendente.fim,
      trecho: selecaoPendente.trecho,
      contextoAntes: selecaoPendente.contextoAntes,
      contextoDepois: selecaoPendente.contextoDepois,
    });
    setPainelNotasAberto(true);
    setNovaNotaDados({
      artigoId: selecaoPendente.artigoId,
      blocoId: selecaoPendente.blocoId,
      grifoId: grifoCriado.id,
      inicio: selecaoPendente.inicio,
      fim: selecaoPendente.fim,
      trechoSelecionado: selecaoPendente.trecho,
      corId: grifoCriado.corId,
    });
    window.getSelection()?.removeAllRanges();
    setSelecaoPendente(null);
  };

  // Atalhos de teclado globais no leitor
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement | null;
      const emInput =
        alvo &&
        (alvo.tagName === 'INPUT' ||
          alvo.tagName === 'TEXTAREA' ||
          alvo.isContentEditable);

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        irParaInputRef.current?.focus();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !emInput) {
        e.preventDefault();
        if (e.shiftKey) refazer();
        else desfazer();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y' && !emInput) {
        e.preventDefault();
        refazer();
        return;
      }

      if (emInput) return;

      if (selecaoPendente) {
        const corAtalho = cores.find((c) => c.atalho && c.atalho === e.key);
        if (corAtalho) {
          e.preventDefault();
          aplicarGrifoComCor(corAtalho.id);
          return;
        }
      }

      if (e.key === 'ArrowRight' && preferencias.modoVisualizacao === 'foco') {
        e.preventDefault();
        navegarParaIndice(indiceAtivo + 1);
      } else if (e.key === 'ArrowLeft' && preferencias.modoVisualizacao === 'foco') {
        e.preventDefault();
        navegarParaIndice(indiceAtivo - 1);
      } else if (e.key === 'Escape') {
        setSelecaoPendente(null);
        setGrifoPopover(null);
        if (modoFocoTotal) {
          void alternarModoFocoTotal();
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    selecaoPendente,
    cores,
    aplicarGrifoComCor,
    preferencias.modoVisualizacao,
    indiceAtivo,
    navegarParaIndice,
    desfazer,
    refazer,
    modoFocoTotal,
    alternarModoFocoTotal,
  ]);

  // Determina quais pastas têm correspondência na busca atual (deve ficar antes de qualquer return condicional)
  const pastasComMatch = useMemo(() => {
    const termoNorm = normalizarTextoBusca(buscaArvore);
    if (!termoNorm) return null;

    const visiveis = new Set<string>();
    const marcarAncestrais = (pastaId?: string) => {
      let cur = pastaId;
      let guarda = 0;
      while (cur && guarda < 10) {
        if (visiveis.has(cur)) break;
        visiveis.add(cur);
        cur = mapaPastas.get(cur)?.parentId || undefined;
        guarda += 1;
      }
    };

    for (const p of pastas) {
      if (normalizarTextoBusca(p.nome).includes(termoNorm)) {
        marcarAncestrais(p.id);
      }
    }

    for (const doc of codigos) {
      const docBate =
        codigoCorrespondeBusca(doc, buscaArvore) ||
        (!!codigoAtivo && doc.id === codigoAtivo.id && gruposArvore.length > 0);
      if (docBate && doc.pastaId) {
        marcarAncestrais(doc.pastaId);
      }
    }

    return visiveis;
  }, [buscaArvore, pastas, codigos, codigoAtivo?.id, gruposArvore.length, mapaPastas]);

  if (!codigoAtivo) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6 sm:p-8 text-center">
        <BrandLogo size="xl" />
        <h2 className="mt-4 text-lg font-semibold text-[var(--text-primary)]">
          Nenhum documento selecionado para leitura
        </h2>
        <p className="mt-1.5 max-w-md text-sm text-[var(--text-muted)]">
          Importe um Vade Mecum, lei, jurisprudência, súmulas ou doutrina na sua Biblioteca, ou carregue o material de demonstração.
        </p>
        <button
          type="button"
          onClick={() => navegarPara('biblioteca')}
          className="mt-5 min-h-[44px] rounded-lg bg-[var(--accent-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 cursor-pointer"
        >
          Ir para a Biblioteca
        </button>
      </div>
    );
  }

  const notasDoArtigoAtivo = artigoAtivo
    ? (mapaAnotacoesPorArtigo.get(artigoAtivo.id) || []).sort((a, b) => b.atualizadoEm - a.atualizadoEm)
    : [];
  const progressoAtual = artigoAtivo
    ? mapaProgresso.get(artigoAtivo.id)?.status || 'nao_estudado'
    : 'nao_estudado';

  // Renderiza árvore de pastas + documentos dentro da barra lateral do leitor
  const renderPastasLeitor = (parentId: string | null, nivel = 0): React.ReactNode => {
    const termo = buscaArvore.trim();
    const termoNorm = normalizarTextoBusca(termo);
    const filhas = pastas.filter((p) => (p.parentId || null) === parentId);
    const docsDiretos = parentId
      ? codigos.filter((c) => c.pastaId === parentId)
      : codigos.filter((c) => !c.pastaId || !mapaPastas.has(c.pastaId));

    return (
      <>
        {filhas.map((pasta) => {
          const qtdDocs = contagemDocsPorPasta.get(pasta.id) || 0;
          if (!termo && qtdDocs === 0) return null;
          if (termo && pastasComMatch && !pastasComMatch.has(pasta.id)) return null;
          const expandida = !!termo || !!pastasExpandidas[pasta.id];

          return (
            <div key={pasta.id} className="space-y-0.5">
              <button
                type="button"
                onClick={() =>
                  setPastasExpandidas((prev) => ({ ...prev, [pasta.id]: !prev[pasta.id] }))
                }
                style={{ paddingLeft: `${nivel * 10 + 6}px` }}
                className="flex min-h-[38px] lg:min-h-0 w-full items-center justify-between gap-1.5 rounded-md py-1.5 pr-2 text-left text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
              >
                <span className="flex items-center gap-1.5 min-w-0">
                  {expandida ? (
                    <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
                  )}
                  {expandida ? (
                    <FolderOpen className="h-3.5 w-3.5 shrink-0 text-[var(--accent-primary)]" />
                  ) : (
                    <Folder className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
                  )}
                  <span className="truncate">{pasta.nome}</span>
                </span>
                <span className="font-mono-tabular text-[0.72rem] text-[var(--text-muted)] shrink-0">
                  {qtdDocs}
                </span>
              </button>

              {expandida && (
                <div className="space-y-0.5">{renderPastasLeitor(pasta.id, nivel + 1)}</div>
              )}
            </div>
          );
        })}

        {docsDiretos.map((doc) => {
          const ativoDoc = doc.id === codigoAtivo.id;
          const pastaPaiBate =
            !!termoNorm &&
            !!doc.pastaId &&
            normalizarTextoBusca(mapaPastas.get(doc.pastaId)?.nome || '').includes(termoNorm);
          const bateBuscaDoc =
            !termo ||
            codigoCorrespondeBusca(doc, termo) ||
            pastaPaiBate ||
            (ativoDoc && gruposArvore.length > 0);
          if (!bateBuscaDoc) return null;

          return (
            <div key={doc.id} className="space-y-1">
              <button
                type="button"
                onClick={() => {
                  void abrirArtigoNoLeitor(doc.id);
                  if (window.innerWidth < 1024 && doc.id === codigoAtivo.id) {
                    setSidebarLeitorAberta(false);
                  }
                }}
                style={{ paddingLeft: `${nivel * 10 + 18}px` }}
                className={`flex min-h-[38px] lg:min-h-0 w-full items-center justify-between gap-1.5 rounded-md py-1.5 pr-2 text-left text-xs transition-colors cursor-pointer ${
                  ativoDoc
                    ? 'bg-[var(--bg-subtle)] font-semibold text-[var(--text-primary)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]/60'
                }`}
              >
                <span className="flex items-center gap-1.5 min-w-0">
                  <FileText className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
                  <span className="truncate">{doc.nome}</span>
                </span>
                <span className="font-mono-tabular text-[0.72rem] text-[var(--text-muted)] shrink-0">
                  {doc.totalArtigos}
                </span>
              </button>

              {/* Se este documento está ativo, exibe sua árvore hierárquica de seções e artigos/itens */}
              {ativoDoc && (
                <div
                  style={{ paddingLeft: `${nivel * 10 + 22}px` }}
                  className="space-y-1 border-l border-[var(--border-hairline)] ml-3 pl-2 py-1"
                >
                  {!artigosProntos ? (
                    <p className="px-2 py-2 text-xs text-[var(--text-muted)]">
                      Carregando itens...
                    </p>
                  ) : gruposArvore.length === 0 ? (
                    <p className="px-2 py-2 text-xs text-[var(--text-muted)]">
                      Nenhum item encontrado neste documento.
                    </p>
                  ) : (
                    gruposArvore.map((grupo) => {
                      const colapsado = !termo && !!gruposColapsados[grupo.chave];
                      return (
                        <div key={grupo.chave} className="space-y-0.5">
                          <button
                            type="button"
                            onClick={() =>
                              setGruposColapsados((prev) => ({
                                ...prev,
                                [grupo.chave]: !prev[grupo.chave],
                              }))
                            }
                            className="flex w-full items-start justify-between gap-1.5 rounded-md px-1.5 py-1 text-left text-xs font-semibold text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] cursor-pointer"
                          >
                            <span className="flex items-start gap-1 min-w-0">
                              {colapsado ? (
                                <ChevronRight className="mt-0.5 h-3 w-3 shrink-0" />
                              ) : (
                                <ChevronDown className="mt-0.5 h-3 w-3 shrink-0" />
                              )}
                              <span className="line-clamp-2">{grupo.titulo}</span>
                            </span>
                            <span className="font-mono-tabular text-[0.72rem] shrink-0">
                              {grupo.artigos.length}
                            </span>
                          </button>

                          {!colapsado && (
                            <div className="pl-3 space-y-0.5">
                              {grupo.artigos.map((art) => {
                                const ativo = art.id === artigoAtivo?.id;
                                const st = mapaProgresso.get(art.id)?.status;
                                const qtdGrifos = mapaGrifosPorArtigo.get(art.id)?.length || 0;
                                const qtdNotas = mapaAnotacoesPorArtigo.get(art.id)?.length || 0;
                                return (
                                  <button
                                    key={art.id}
                                    type="button"
                                    onClick={() => {
                                      const idx = artigos.findIndex((a) => a.id === art.id);
                                      if (idx !== -1) void navegarParaIndice(idx);
                                      if (window.innerWidth < 1024) {
                                        setSidebarLeitorAberta(false);
                                      }
                                    }}
                                    className={`flex min-h-[36px] lg:min-h-0 w-full items-center justify-between gap-2 rounded-md px-2 py-1 text-left text-xs transition-colors cursor-pointer ${
                                      ativo
                                        ? 'bg-[var(--bg-subtle)] font-semibold text-[var(--text-primary)]'
                                        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]/60'
                                    }`}
                                  >
                                    <span className="truncate font-mono-tabular">
                                      {formatarRotuloUnidade(art, { curto: true })}
                                      {art.tipoUnidade !== 'secao' && art.epigrafe
                                        ? ` · ${art.epigrafe}`
                                        : ''}
                                    </span>
                                    <span className="shrink-0 text-[0.72rem] text-[var(--text-muted)] tabular-nums">
                                      {st === 'dominado'
                                        ? 'Dom'
                                        : st === 'revisar'
                                        ? 'Rev'
                                        : st === 'estudado'
                                        ? 'Est'
                                        : ''}
                                      {(qtdGrifos > 0 || qtdNotas > 0) &&
                                        ` ${qtdGrifos + qtdNotas}`}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          );
        })}
      </>
    );
  };

  const renderCartaoArtigo = (art: Artigo) => {
    const grifosArt = mapaGrifosPorArtigo.get(art.id) || [];
    const anotacoesArt = mapaAnotacoesPorArtigo.get(art.id) || [];
    const hier = formatarHierarquiaResumo(art.hierarquia);
    const statusArt = mapaProgresso.get(art.id)?.status || 'nao_estudado';
    const metaExtra = [
      art.subtipoMeta?.relator ? `Rel. ${art.subtipoMeta.relator}` : undefined,
      art.subtipoMeta?.dataJulgamento,
    ]
      .filter(Boolean)
      .join(' · ');

    return (
      <article
        key={art.id}
        data-artigo-id={art.id}
        onClick={() => {
          if (art.id !== artigoAtivoId && preferencias.modoVisualizacao === 'lista') {
            skipNextAutoScrollRef.current = true;
            void definirArtigoAtivo(art.id);
          }
        }}
        className={`rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-4 py-5 sm:px-9 sm:py-8 transition-colors ${
          preferencias.modoVisualizacao === 'lista' && art.id === artigoAtivoId
            ? 'ring-1 ring-[var(--accent-primary)]/40'
            : ''
        }`}
      >
        {hier && (
          <p className="mb-2 text-xs font-medium tracking-wide text-[var(--text-muted)]">
            {hier}
          </p>
        )}

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-hairline)] pb-3">
          <div>
            <h2 className="text-lg font-semibold text-[var(--text-primary)] font-mono-tabular">
              {formatarRotuloUnidade(art)}
            </h2>
            {art.epigrafe && art.tipoUnidade !== 'secao' && (
              <p className="mt-0.5 text-sm font-medium text-[var(--text-secondary)]">
                {art.epigrafe}
              </p>
            )}
            {metaExtra && (
              <p className="mt-0.5 text-xs text-[var(--text-muted)]">{metaExtra}</p>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {(['estudado', 'revisar', 'dominado'] as StatusEstudo[]).map((st) => {
              const ativo = statusArt === st;
              const rotulos: Record<StatusEstudo, string> = {
                nao_estudado: 'Pendente',
                estudado: 'Estudado',
                revisar: 'Revisar',
                dominado: 'Dominado',
              };
              const estiloAtivo =
                st === 'dominado'
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : st === 'revisar'
                  ? 'bg-amber-600 text-white border-amber-600'
                  : 'bg-[var(--accent-primary)] text-white border-[var(--accent-primary)]';
              return (
                <button
                  key={st}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    definirStatusEstudo(art.id, art.codigoId, ativo ? 'nao_estudado' : st);
                  }}
                  className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    ativo
                      ? estiloAtivo
                      : 'border-[var(--border-hairline)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]'
                  }`}
                >
                  {rotulos[st]}
                </button>
              );
            })}

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                alternarFavorito(art.id);
              }}
              aria-label={art.favorito ? 'Remover dos favoritos' : 'Favoritar item'}
              title={art.favorito ? 'Remover dos favoritos' : 'Favoritar item'}
              className={`rounded-md p-1.5 transition-colors cursor-pointer ${
                art.favorito
                  ? 'text-amber-500'
                  : 'text-[var(--text-muted)] hover:bg-[var(--bg-subtle)]'
              }`}
            >
              <Star className="h-4 w-4" fill={art.favorito ? 'currentColor' : 'none'} />
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setArtigoEmEdicao(art);
              }}
              title="Corrigir estrutura ou texto deste item"
              aria-label="Corrigir item manualmente"
              className="rounded-md p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] cursor-pointer"
            >
              <Edit3 className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div
          onMouseUp={processarSelecaoTexto}
          onTouchEnd={() => setTimeout(processarSelecaoTexto, 120)}
          style={{
            fontSize: `calc(${preferencias.tamanhoFonte}px * var(--app-font-scale, 1))`,
            lineHeight: preferencias.espacamentoLinha,
          }}
          className={`legal-prose-wrap space-y-3.5 selection:bg-amber-200 selection:text-slate-900 ${
            preferencias.familiaFonte === 'serif' ? 'font-legal-serif' : 'font-legal-sans'
          }`}
        >
          {art.blocos.map((bloco) => (
            <ArticleBlockRenderer
              key={bloco.id}
              artigoNumero={art.numero}
              tipoUnidade={art.tipoUnidade}
              bloco={bloco}
              grifos={grifosArt}
              anotacoes={anotacoesArt}
              cores={cores}
              temaEscuro={temaEscuro}
              ocultarRemissoes={preferencias.ocultarRemissoes}
              modoMemorizacao={modoMemorizacao}
              revelarTudo={revelarTudoCloze}
              onClicarGrifo={(grifo, rect) => {
                setSelecaoPendente(null);
                const pos = calcularPosicaoPopoverFlutuante(rect);
                setGrifoPopover({
                  grifo,
                  x: pos.x,
                  y: pos.y,
                  acima: pos.acima,
                });
              }}
              onClicarIconeNota={(nota) => {
                setPainelNotasAberto(true);
                setNotaDestacadaId(nota.id);
              }}
            />
          ))}
        </div>
      </article>
    );
  };

  return (
    <div
      className={`flex flex-col overflow-hidden ${
        modoFocoTotal ? 'app-shell-height' : 'reader-shell-height'
      }`}
    >
      {/* Barra de ferramentas superior do Leitor */}
      {!modoFocoTotal ? (
        <>
          <div className="print-hidden flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 sm:px-4 py-2">
            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
              <button
                type="button"
                onClick={() => setSidebarLeitorAberta(!sidebarLeitorAberta)}
                className="inline-flex min-h-[40px] min-w-[40px] sm:min-h-0 sm:min-w-0 items-center justify-center gap-1.5 rounded-lg border border-[var(--border-hairline)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] cursor-pointer whitespace-nowrap"
                aria-label="Alternar pastas e índice"
              >
                <PanelLeft className="h-4 w-4 sm:h-3.5 sm:w-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">Pastas e índice</span>
              </button>

              <select
                value={codigoAtivo.id}
                onChange={(e) => abrirArtigoNoLeitor(e.target.value)}
                aria-label="Selecionar documento"
                className="max-w-[140px] sm:max-w-[240px] truncate rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-2.5 py-1.5 text-xs font-semibold text-[var(--text-primary)]"
              >
                {codigos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.sigla} — {c.nome}
                  </option>
                ))}
              </select>

              <form onSubmit={handleIrParaArtigo} className="flex items-center gap-1">
                <input
                  ref={irParaInputRef}
                  type="text"
                  value={irParaNumero}
                  onChange={(e) => setIrParaNumero(e.target.value)}
                  placeholder="Ir p/ nº"
                  aria-label="Ir para número do artigo"
                  className="w-20 sm:w-32 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-2 sm:px-2.5 py-1.5 sm:py-1 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
                />
              </form>
            </div>

            <div className="flex items-center gap-1.5">
              {/* Modo de visualização: Foco | Lista */}
              <div className="flex items-center rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-canvas)] p-0.5">
                <button
                  type="button"
                  onClick={() => atualizarPreferencias({ modoVisualizacao: 'foco' })}
                  className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium cursor-pointer whitespace-nowrap ${
                    preferencias.modoVisualizacao === 'foco'
                      ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xs'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <Layers className="h-3 w-3" aria-hidden="true" />
                  Isolado
                </button>
                <button
                  type="button"
                  onClick={() => atualizarPreferencias({ modoVisualizacao: 'lista' })}
                  className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium cursor-pointer whitespace-nowrap ${
                    preferencias.modoVisualizacao === 'lista'
                      ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xs'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <List className="h-3 w-3" aria-hidden="true" />
                  Lista
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  setModoMemorizacao(!modoMemorizacao);
                  setRevelarTudoCloze(false);
                }}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium cursor-pointer whitespace-nowrap ${
                  modoMemorizacao
                    ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)] text-white'
                    : 'border-[var(--border-hairline)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]'
                }`}
                title="Ocultar palavras-chave e grifos para treinar memorização"
              >
                {modoMemorizacao ? (
                  <EyeOff className="h-3.5 w-3.5" />
                ) : (
                  <Eye className="h-3.5 w-3.5" />
                )}
                <span className="hidden sm:inline">Memorizar</span>
              </button>

              {modoMemorizacao && (
                <button
                  type="button"
                  onClick={() => setRevelarTudoCloze(!revelarTudoCloze)}
                  className="rounded-lg border border-[var(--border-hairline)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] cursor-pointer whitespace-nowrap"
                >
                  {revelarTudoCloze ? 'Ocultar lacunas' : 'Revelar tudo'}
                </button>
              )}

              <button
                type="button"
                onClick={() => void alternarModoFocoTotal()}
                title="Modo foco total (oculta todas as barras laterais e painéis)"
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] cursor-pointer whitespace-nowrap"
              >
                <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="hidden md:inline">Modo foco</span>
              </button>

              <button
                type="button"
                onClick={desfazer}
                disabled={undoStack.length === 0}
                title="Desfazer (Ctrl+Z)"
                aria-label="Desfazer"
                className="hidden sm:inline-flex rounded-lg border border-[var(--border-hairline)] p-1.5 text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] disabled:opacity-40 cursor-pointer"
              >
                <Undo2 className="h-3.5 w-3.5" />
              </button>

              <button
                type="button"
                onClick={refazer}
                disabled={redoStack.length === 0}
                title="Refazer (Ctrl+Y)"
                aria-label="Refazer"
                className="hidden sm:inline-flex rounded-lg border border-[var(--border-hairline)] p-1.5 text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] disabled:opacity-40 cursor-pointer"
              >
                <Redo2 className="h-3.5 w-3.5" />
              </button>

              {/* Popover de Tipografia e Tema */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setPopoverTipografia(!popoverTipografia)}
                  className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-hairline)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] cursor-pointer whitespace-nowrap"
                  title="Tipografia e tema de leitura"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="hidden md:inline">Leitura</span>
                </button>

                {popoverTipografia && (
                  <div className="absolute right-0 top-full z-40 mt-2 w-72 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4 shadow-xl space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-[var(--text-primary)]">
                        Aparência da leitura
                      </span>
                      <button
                        type="button"
                        onClick={() => setPopoverTipografia(false)}
                        className="rounded p-0.5 text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] cursor-pointer"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <div>
                      <span className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">
                        Tema
                      </span>
                      <div className="grid grid-cols-3 gap-1.5">
                        {(['claro', 'sepia', 'escuro'] as const).map((t) => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => atualizarPreferencias({ tema: t })}
                            className={`rounded-lg border py-1.5 text-xs font-medium capitalize cursor-pointer ${
                              preferencias.tema === t
                                ? 'border-[var(--accent-primary)] bg-[var(--bg-subtle)] text-[var(--text-primary)]'
                                : 'border-[var(--border-hairline)] text-[var(--text-secondary)]'
                            }`}
                          >
                            {t === 'sepia' ? 'Sépia' : t === 'claro' ? 'Claro' : 'Escuro'}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <span className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">
                        Fonte
                      </span>
                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          onClick={() => atualizarPreferencias({ familiaFonte: 'serif' })}
                          className={`rounded-lg border py-1.5 text-xs font-legal-serif cursor-pointer ${
                            preferencias.familiaFonte === 'serif'
                              ? 'border-[var(--accent-primary)] bg-[var(--bg-subtle)] text-[var(--text-primary)]'
                              : 'border-[var(--border-hairline)] text-[var(--text-secondary)]'
                          }`}
                        >
                          Serifa (Lora)
                        </button>
                        <button
                          type="button"
                          onClick={() => atualizarPreferencias({ familiaFonte: 'sans' })}
                          className={`rounded-lg border py-1.5 text-xs cursor-pointer ${
                            preferencias.familiaFonte === 'sans'
                              ? 'border-[var(--accent-primary)] bg-[var(--bg-subtle)] text-[var(--text-primary)]'
                              : 'border-[var(--border-hairline)] text-[var(--text-secondary)]'
                          }`}
                        >
                          Sem serifa
                        </button>
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-xs text-[var(--text-muted)] mb-1">
                        <span>Tamanho do texto</span>
                        <span className="font-mono-tabular">{preferencias.tamanhoFonte}px</span>
                      </div>
                      <input
                        type="range"
                        min={16}
                        max={26}
                        step={1}
                        value={preferencias.tamanhoFonte}
                        onChange={(e) =>
                          atualizarPreferencias({ tamanhoFonte: Number(e.target.value) })
                        }
                        className="w-full"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-xs text-[var(--text-muted)] mb-1">
                        <span>Espaçamento entre linhas</span>
                        <span className="font-mono-tabular">
                          {preferencias.espacamentoLinha.toFixed(2)}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={1.4}
                        max={2.1}
                        step={0.05}
                        value={preferencias.espacamentoLinha}
                        onChange={(e) =>
                          atualizarPreferencias({ espacamentoLinha: Number(e.target.value) })
                        }
                        className="w-full"
                      />
                    </div>

                    <label className="flex items-center justify-between gap-2 text-xs text-[var(--text-secondary)] cursor-pointer">
                      <span>Ocultar remissões legislativas</span>
                      <input
                        type="checkbox"
                        checked={preferencias.ocultarRemissoes}
                        onChange={(e) =>
                          atualizarPreferencias({ ocultarRemissoes: e.target.checked })
                        }
                      />
                    </label>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => setPainelNotasAberto(!painelNotasAberto)}
                className="inline-flex min-h-[40px] min-w-[40px] sm:min-h-0 sm:min-w-0 items-center justify-center gap-1.5 rounded-lg border border-[var(--border-hairline)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] cursor-pointer whitespace-nowrap"
                aria-label="Alternar painel de anotações"
              >
                <PanelRight className="h-4 w-4 sm:h-3.5 sm:w-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">Notas</span>
              </button>
            </div>
          </div>

          {/* Breadcrumb de localização + navegação rápida (rolagem horizontal interna no celular) */}
          <div className="print-hidden flex items-center justify-between gap-2 border-b border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3 sm:px-4 py-1.5 text-xs text-[var(--text-muted)]">
            <nav
              aria-label="Localização do documento"
              className="no-scrollbar flex flex-1 items-center gap-1.5 min-w-0 overflow-x-auto whitespace-nowrap"
            >
              {caminhoPastasAtivo.map((p) => (
                <React.Fragment key={p.id}>
                  <span className="shrink-0 max-w-[140px] truncate">{p.nome}</span>
                  <span className="shrink-0" aria-hidden="true">›</span>
                </React.Fragment>
              ))}
              <span className="shrink-0 font-medium text-[var(--text-secondary)] max-w-[180px] sm:max-w-[240px] truncate">
                {codigoAtivo.nome}
              </span>
              {artigoAtivo && (
                <>
                  {artigoAtivo.hierarquia.titulo && (
                    <>
                      <span className="hidden sm:inline shrink-0" aria-hidden="true">›</span>
                      <span className="hidden sm:inline shrink-0 truncate max-w-[180px]">
                        {artigoAtivo.hierarquia.titulo}
                      </span>
                    </>
                  )}
                  <span className="shrink-0" aria-hidden="true">›</span>
                  <span className="shrink-0 font-mono-tabular font-semibold text-[var(--text-primary)]">
                    {formatarRotuloUnidade(artigoAtivo, { curto: true })}
                  </span>
                </>
              )}
            </nav>

            <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
              <button
                type="button"
                disabled={indiceAtivo <= 0}
                onClick={() => navegarParaIndice(indiceAtivo - 1)}
                className="inline-flex min-h-[36px] min-w-[36px] sm:min-h-0 sm:min-w-0 items-center justify-center gap-1 rounded px-2 py-0.5 hover:bg-[var(--bg-subtle)] disabled:opacity-40 cursor-pointer"
                aria-label="Item anterior"
              >
                <ArrowLeft className="h-3.5 w-3.5 sm:h-3 sm:w-3" />
                <span className="hidden sm:inline">Anterior</span>
              </button>
              <span className="font-mono-tabular text-xs">
                {indiceAtivo + 1}/{artigos.length}
              </span>
              <button
                type="button"
                disabled={indiceAtivo >= artigos.length - 1}
                onClick={() => navegarParaIndice(indiceAtivo + 1)}
                className="inline-flex min-h-[36px] min-w-[36px] sm:min-h-0 sm:min-w-0 items-center justify-center gap-1 rounded px-2 py-0.5 hover:bg-[var(--bg-subtle)] disabled:opacity-40 cursor-pointer"
                aria-label="Próximo item"
              >
                <span className="hidden sm:inline">Próximo</span>
                <ArrowRight className="h-3.5 w-3.5 sm:h-3 sm:w-3" />
              </button>
            </div>
          </div>
        </>
      ) : (
        /* Barra mínima do Modo Foco Total */
        <div className="print-hidden safe-top flex items-center justify-between border-b border-[var(--border-hairline)] bg-[var(--bg-surface)]/80 px-4 py-2 text-xs">
          <span className="font-medium text-[var(--text-secondary)] truncate">
            {codigoAtivo.sigla} · {artigoAtivo ? formatarRotuloUnidade(artigoAtivo) : ''}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={indiceAtivo <= 0}
              onClick={() => navegarParaIndice(indiceAtivo - 1)}
              className="rounded border border-[var(--border-hairline)] px-2 py-1 text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] disabled:opacity-40 cursor-pointer"
            >
              Anterior
            </button>
            <button
              type="button"
              disabled={indiceAtivo >= artigos.length - 1}
              onClick={() => navegarParaIndice(indiceAtivo + 1)}
              className="rounded border border-[var(--border-hairline)] px-2 py-1 text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] disabled:opacity-40 cursor-pointer"
            >
              Próximo
            </button>
            <button
              type="button"
              onClick={() => void alternarModoFocoTotal()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent-primary)] px-3 py-1 font-medium text-white hover:opacity-90 cursor-pointer"
            >
              <Minimize2 className="h-3.5 w-3.5" aria-hidden="true" />
              Sair do foco (Esc)
            </button>
          </div>
        </div>
      )}

      {/* Área Principal 3 Colunas */}
      <div className="relative flex flex-1 overflow-hidden">
        {/* Backdrop Drawer Mobile/Tablet para sidebar do leitor */}
        {!modoFocoTotal && sidebarLeitorAberta && (
          <div
            className="print-hidden fixed inset-0 z-10 bg-black/40 lg:hidden"
            onClick={() => setSidebarLeitorAberta(false)}
          />
        )}

        {/* Coluna 1: Barra Lateral em Árvore (Pastas + Hierarquia do Documento), retrátil e redimensionável */}
        {!modoFocoTotal && (
          <aside
            aria-label="Árvore de pastas e índice"
            style={
              {
                '--leitor-w': `${larguraLeitorTemp}px`,
              } as React.CSSProperties
            }
            className={`print-hidden relative z-20 flex shrink-0 flex-col bg-[var(--bg-surface)] overflow-hidden max-lg:fixed max-lg:top-14 max-lg:bottom-0 max-lg:left-0 max-lg:w-[min(85vw,21rem)] max-lg:shadow-2xl ${
              sidebarLeitorAberta
                ? 'lg:w-[var(--leitor-w)] border-r border-[var(--border-hairline)]'
                : 'lg:w-0 border-r-0 max-lg:hidden'
            } ${redimensionandoLeitor ? '' : 'transition-[width] duration-200 ease-out'}`}
          >
            <div className="flex h-full w-full lg:w-[var(--leitor-w)] flex-col">
              <div className="border-b border-[var(--border-hairline)] p-3 space-y-2">
                <div className="flex items-center justify-between lg:hidden pb-1">
                  <span className="text-xs font-semibold text-[var(--text-primary)]">
                    Índice e pastas
                  </span>
                  <button
                    type="button"
                    onClick={() => setSidebarLeitorAberta(false)}
                    className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] cursor-pointer"
                    aria-label="Fechar índice"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-[var(--text-muted)]"
                    aria-hidden="true"
                  />
                  <input
                    type="text"
                    value={buscaArvore}
                    onChange={(e) => setBuscaArvore(e.target.value)}
                    placeholder="Filtrar pasta, código ou item..."
                    className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-canvas)] py-1.5 pl-8 pr-2.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-3 gap-1 rounded-lg bg-[var(--bg-canvas)] p-0.5 text-xs">
                  {(['todos', 'favoritos', 'revisar'] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setFiltroArvore(f)}
                      className={`rounded-md py-1 font-medium capitalize cursor-pointer ${
                        filtroArvore === f
                          ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xs'
                          : 'text-[var(--text-muted)]'
                      }`}
                    >
                      {f === 'todos' ? 'Todos' : f === 'favoritos' ? 'Favoritos' : 'Revisar'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="touch-scroll flex-1 overflow-y-auto p-2 space-y-2">
                <div>{renderPastasLeitor(null)}</div>

                {buscaArvore.trim() && resultadosOutrosCodigos.length > 0 && (
                  <div className="border-t border-[var(--border-hairline)] pt-2 space-y-1">
                    <p className="px-2 text-[0.7rem] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                      Em outros documentos
                    </p>
                    {resultadosOutrosCodigos.map((art) => {
                      const cod = mapaCodigos.get(art.codigoId);
                      return (
                        <button
                          key={art.id}
                          type="button"
                          onClick={async () => {
                            await abrirArtigoNoLeitor(art.codigoId, art.id);
                            if (window.innerWidth < 1024) {
                              setSidebarLeitorAberta(false);
                            }
                          }}
                          className="flex min-h-[36px] lg:min-h-0 w-full flex-col rounded-md px-2 py-1.5 text-left text-xs hover:bg-[var(--bg-subtle)] cursor-pointer"
                        >
                          <span className="font-mono-tabular font-semibold text-[var(--text-primary)] truncate">
                            {cod?.sigla || 'Doc'} · {formatarRotuloUnidade(art, { curto: true })}
                          </span>
                          <span className="truncate text-[0.72rem] text-[var(--text-muted)]">
                            {art.epigrafe || art.textoIntegral}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {sidebarLeitorAberta && (
              <div
                role="separator"
                aria-orientation="vertical"
                aria-label="Redimensionar barra do leitor"
                onMouseDown={iniciarResizeLeitor}
                className="hidden lg:block absolute inset-y-0 right-0 w-1.5 cursor-col-resize hover:bg-[var(--accent-primary)]/40 transition-colors"
              />
            )}
          </aside>
        )}

        {/* Coluna 2: Viewport Principal de Leitura (largura confortável de 65-80 caracteres em telas grandes) */}
        <main className="print-area relative flex-1 overflow-hidden bg-[var(--bg-canvas)]">
          {preferencias.modoVisualizacao === 'foco' ? (
            <div className="touch-scroll h-full overflow-y-auto px-3 py-5 sm:px-8 sm:py-10">
              <div className="mx-auto w-full max-w-[72ch] space-y-6">
                {artigoAtivo ? (
                  <>
                    {renderCartaoArtigo(artigoAtivo)}

                    {/* Barra de Navegação Anterior / Próximo + Coleções */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                      <button
                        type="button"
                        disabled={indiceAtivo <= 0}
                        onClick={() => navegarParaIndice(indiceAtivo - 1)}
                        className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-4 py-2 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] disabled:opacity-40 cursor-pointer"
                      >
                        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                        Anterior
                      </button>

                      <div className="relative flex items-center gap-3">
                        <span className="text-xs font-mono-tabular text-[var(--text-muted)]">
                          {indiceAtivo + 1} de {artigos.length}
                        </span>

                        <button
                          type="button"
                          onClick={() => setPopoverColecao(!popoverColecao)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
                        >
                          <FolderPlus className="h-3.5 w-3.5" aria-hidden="true" />
                          Coleções
                        </button>

                        {popoverColecao && (
                          <div className="absolute bottom-full right-0 z-40 mb-2 w-64 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-3 shadow-xl space-y-2">
                            <p className="text-xs font-semibold text-[var(--text-primary)]">
                              Salvar em coleção
                            </p>
                            <div className="max-h-40 overflow-y-auto space-y-1">
                              {colecoes.map((col) => {
                                const marcado = col.artigoIds.includes(artigoAtivo.id);
                                return (
                                  <label
                                    key={col.id}
                                    className="flex items-center gap-2 rounded px-1.5 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={marcado}
                                      onChange={() =>
                                        alternarArtigoEmColecao(col.id, artigoAtivo.id)
                                      }
                                    />
                                    <span className="truncate">{col.nome}</span>
                                  </label>
                                );
                              })}
                            </div>
                            <div className="flex gap-1.5 border-t border-[var(--border-hairline)] pt-2">
                              <input
                                type="text"
                                value={novaColecaoNome}
                                onChange={(e) => setNovaColecaoNome(e.target.value)}
                                placeholder="Nova coleção..."
                                className="flex-1 rounded border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-2 py-1 text-xs"
                              />
                              <button
                                type="button"
                                onClick={async () => {
                                  if (!novaColecaoNome.trim()) return;
                                  const col = await criarColecao(novaColecaoNome);
                                  await alternarArtigoEmColecao(col.id, artigoAtivo.id);
                                  setNovaColecaoNome('');
                                }}
                                className="rounded bg-[var(--accent-primary)] px-2.5 py-1 text-xs font-medium text-white cursor-pointer"
                              >
                                Criar
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        disabled={indiceAtivo >= artigos.length - 1}
                        onClick={() => navegarParaIndice(indiceAtivo + 1)}
                        className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-4 py-2 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] disabled:opacity-40 cursor-pointer"
                      >
                        Próximo
                        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </>
                ) : !artigosProntos ? (
                  <p className="text-center text-sm text-[var(--text-muted)]">
                    Carregando documento...
                  </p>
                ) : (
                  <p className="text-center text-sm text-[var(--text-muted)]">
                    Nenhum item estruturado encontrado neste documento.
                  </p>
                )}
              </div>
            </div>
          ) : (
            /* MODO LISTA CONTÍNUA VIRTUALIZADA */
            <div ref={listaScrollRef} className="touch-scroll h-full overflow-y-auto px-3 py-5 sm:px-8">
              {!artigosProntos ? (
                <p className="py-10 text-center text-sm text-[var(--text-muted)]">
                  Carregando documento...
                </p>
              ) : artigos.length === 0 ? (
                <p className="py-10 text-center text-sm text-[var(--text-muted)]">
                  Nenhum item estruturado encontrado neste documento.
                </p>
              ) : (
                <div
                  className="relative mx-auto w-full max-w-[72ch]"
                  style={{ height: `${virtualizer.getTotalSize()}px` }}
                >
                  {virtualizer.getVirtualItems().map((virtualRow) => {
                    const art = artigos[virtualRow.index];
                    if (!art) return null;
                    return (
                      <div
                        key={art.id}
                        data-index={virtualRow.index}
                        ref={virtualizer.measureElement}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          transform: `translateY(${virtualRow.start}px)`,
                        }}
                        className="pb-5"
                      >
                        {renderCartaoArtigo(art)}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Menu Flutuante de Marca-texto (flutua acima da palavra/trecho selecionado tanto no desktop quanto no mobile) */}
          {selecaoPendente && (
            <div
              data-popover-grifo="true"
              onPointerDown={marcarInteracaoPopover}
              onTouchStart={marcarInteracaoPopover}
              onMouseDown={(e) => {
                e.preventDefault();
                marcarInteracaoPopover();
              }}
              style={{
                left: `${selecaoPendente.x}px`,
                top: `${selecaoPendente.y}px`,
                transform: selecaoPendente.acima
                  ? 'translate(-50%, -100%)'
                  : 'translate(-50%, 0)',
              }}
              className="print-hidden fixed z-50 flex w-max max-w-[calc(100vw-1rem)] flex-wrap items-center justify-center gap-1 sm:gap-1.5 rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 sm:px-3 py-2 shadow-2xl"
              role="toolbar"
              aria-label="Menu de marca-texto e anotação"
            >
              {cores.map((cor) => (
                <button
                  key={cor.id}
                  type="button"
                  onClick={() => aplicarGrifoComCor(cor.id)}
                  title={
                    cor.significado
                      ? `${cor.nome} — ${cor.significado}`
                      : cor.nome
                  }
                  aria-label={
                    cor.significado
                      ? `Grifar em ${cor.nome} (${cor.significado})`
                      : `Grifar em ${cor.nome}`
                  }
                  style={{
                    backgroundColor: cor.hexBg,
                    borderColor: cor.hexBorder,
                  }}
                  className="h-8 w-8 sm:h-9 sm:w-9 rounded-full border transition-transform hover:scale-105 cursor-pointer"
                />
              ))}

              <div className="mx-0.5 hidden sm:block h-5 w-px bg-[var(--border-hairline)]" />

              <button
                type="button"
                onClick={iniciarNotaDeSelecao}
                className="inline-flex min-h-[34px] sm:min-h-[36px] items-center gap-1 rounded-xl bg-[var(--accent-primary)] px-2.5 sm:px-3.5 py-1.5 text-xs font-medium text-white hover:opacity-90 cursor-pointer whitespace-nowrap"
              >
                <MessageSquarePlus className="h-3.5 w-3.5" aria-hidden="true" />
                Anotar
              </button>

              <button
                type="button"
                onClick={() => setSelecaoPendente(null)}
                className="inline-flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] cursor-pointer"
                aria-label="Fechar menu"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Popover ao clicar em um grifo existente */}
          {grifoPopover && (
            <div
              data-popover-grifo="true"
              onPointerDown={marcarInteracaoPopover}
              onTouchStart={marcarInteracaoPopover}
              onMouseDown={(e) => {
                e.preventDefault();
                marcarInteracaoPopover();
              }}
              style={{
                left: `${grifoPopover.x}px`,
                top: `${grifoPopover.y}px`,
                transform: grifoPopover.acima
                  ? 'translate(-50%, -100%)'
                  : 'translate(-50%, 0)',
              }}
              className="print-hidden fixed z-50 flex w-max max-w-[calc(100vw-1rem)] flex-wrap items-center justify-center gap-1 sm:gap-1.5 rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 sm:px-3 py-2 shadow-2xl"
              role="toolbar"
              aria-label="Opções do grifo"
            >
              {cores.map((cor) => (
                <button
                  key={cor.id}
                  type="button"
                  onClick={async () => {
                    await alterarCorGrifo(grifoPopover.grifo.id, cor.id);
                    setGrifoPopover(null);
                  }}
                  title={
                    cor.significado
                      ? `Trocar para ${cor.nome} (${cor.significado})`
                      : `Trocar para ${cor.nome}`
                  }
                  aria-label={`Trocar para ${cor.nome}`}
                  style={{
                    backgroundColor: cor.hexBg,
                    borderColor: cor.hexBorder,
                  }}
                  className={`h-8 w-8 rounded-full border cursor-pointer ${
                    grifoPopover.grifo.corId === cor.id ? 'ring-2 ring-[var(--accent-primary)]' : ''
                  }`}
                />
              ))}

              <div className="mx-0.5 hidden sm:block h-5 w-px bg-[var(--border-hairline)]" />

              <button
                type="button"
                onClick={() => {
                  const g = grifoPopover.grifo;
                  setPainelNotasAberto(true);
                  setNovaNotaDados({
                    artigoId: g.artigoId,
                    blocoId: g.blocoId,
                    grifoId: g.id,
                    inicio: g.inicio,
                    fim: g.fim,
                    trechoSelecionado: g.trecho,
                    corId: g.corId,
                  });
                  setGrifoPopover(null);
                }}
                className="min-h-[34px] rounded-xl px-2.5 sm:px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] cursor-pointer whitespace-nowrap"
              >
                Anotar
              </button>

              <button
                type="button"
                onClick={async () => {
                  await removerGrifo(grifoPopover.grifo.id);
                  setGrifoPopover(null);
                }}
                title="Remover grifo"
                aria-label="Remover grifo"
                className="inline-flex h-8 w-8 sm:h-[34px] sm:w-[34px] items-center justify-center rounded-xl text-red-600 hover:bg-red-50 dark:text-red-400 cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>

              <button
                type="button"
                onClick={() => setGrifoPopover(null)}
                className="inline-flex h-8 w-8 sm:h-[34px] sm:w-[34px] items-center justify-center rounded-xl text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] cursor-pointer"
                aria-label="Fechar opções do grifo"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </main>

        {/* Backdrop mobile (bottom sheet) e tablet (gaveta lateral) do painel de anotações */}
        {!modoFocoTotal && painelNotasAberto && artigoAtivo && (
          <div
            className="print-hidden fixed inset-0 z-10 bg-black/40 lg:hidden"
            onClick={() => setPainelNotasAberto(false)}
          />
        )}

        {/* Coluna 3: Painel de Anotações (Bottom Sheet no Celular, Gaveta Lateral no Tablet, Redimensionável no Desktop) */}
        {!modoFocoTotal && painelNotasAberto && artigoAtivo && (
          <aside
            aria-label="Anotações do item"
            style={
              {
                '--notas-w': `${larguraNotasTemp}px`,
              } as React.CSSProperties
            }
            className={`print-hidden safe-bottom relative z-20 flex shrink-0 flex-col bg-[var(--bg-surface)] max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:top-auto max-sm:h-[74dvh] max-sm:w-full max-sm:rounded-t-2xl max-sm:border-t max-sm:border-[var(--border-hairline)] max-sm:shadow-2xl sm:max-lg:fixed sm:max-lg:top-14 sm:max-lg:bottom-0 sm:max-lg:right-0 sm:max-lg:w-96 sm:max-lg:border-l sm:max-lg:border-[var(--border-hairline)] sm:max-lg:shadow-2xl lg:w-[var(--notas-w)] lg:border-l lg:border-[var(--border-hairline)] ${
              redimensionandoNotas ? '' : 'transition-[width] duration-200 ease-out'
            }`}
          >
            {/* Barra separadora redimensionável no Desktop */}
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Redimensionar painel de anotações"
              onMouseDown={iniciarResizeNotas}
              className="hidden lg:block absolute inset-y-0 left-0 w-1.5 cursor-col-resize hover:bg-[var(--accent-primary)]/40 transition-colors"
            />

            {/* Indicador visual de Bottom Sheet no celular */}
            <div className="flex justify-center pt-2 pb-1 sm:hidden" aria-hidden="true">
              <span className="h-1 w-10 rounded-full bg-[var(--border-hairline)]" />
            </div>

            <div className="flex items-center justify-between border-b border-[var(--border-hairline)] px-4 py-3">
              <div className="min-w-0">
                <h3 className="truncate text-sm font-semibold text-[var(--text-primary)]">
                  Anotações · {formatarRotuloUnidade(artigoAtivo, { curto: true })}
                </h3>
                <p className="text-xs text-[var(--text-muted)]">
                  Status: {progressoAtual.replace('_', ' ')} · {notasDoArtigoAtivo.length} nota(s)
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() =>
                    setNovaNotaDados({
                      artigoId: artigoAtivo.id,
                    })
                  }
                  className="inline-flex min-h-[38px] sm:min-h-0 items-center gap-1 rounded-lg bg-[var(--accent-primary)] px-2.5 py-1.5 text-xs font-medium text-white hover:opacity-90 cursor-pointer whitespace-nowrap"
                >
                  <MessageSquarePlus className="h-3.5 w-3.5" aria-hidden="true" />
                  Nota geral
                </button>
                <button
                  type="button"
                  onClick={() => setPainelNotasAberto(false)}
                  className="inline-flex min-h-[38px] min-w-[38px] sm:min-h-0 sm:min-w-0 items-center justify-center rounded p-1 text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] lg:hidden cursor-pointer"
                  aria-label="Fechar painel de notas"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="touch-scroll flex-1 overflow-y-auto p-4 space-y-4">
              {novaNotaDados && novaNotaDados.artigoId === artigoAtivo.id && (
                <div className="rounded-xl border border-[var(--accent-primary)]/40 bg-[var(--bg-canvas)] p-3.5">
                  <p className="mb-2 text-xs font-semibold text-[var(--text-primary)]">
                    {novaNotaDados.trechoSelecionado
                      ? 'Nova anotação vinculada ao trecho'
                      : 'Nova anotação geral'}
                  </p>
                  <RichNoteEditor
                    conteudoInicialHtml=""
                    tagsIniciais={[]}
                    trechoSelecionado={novaNotaDados.trechoSelecionado}
                    onCancelar={() => setNovaNotaDados(null)}
                    onSalvar={async (dados) => {
                      await salvarAnotacao({
                        codigoId: artigoAtivo.codigoId,
                        artigoId: artigoAtivo.id,
                        blocoId: novaNotaDados.blocoId,
                        grifoId: novaNotaDados.grifoId,
                        inicio: novaNotaDados.inicio,
                        fim: novaNotaDados.fim,
                        trechoSelecionado: novaNotaDados.trechoSelecionado,
                        corId: novaNotaDados.corId,
                        ...dados,
                      });
                      setNovaNotaDados(null);
                    }}
                  />
                </div>
              )}

              {notasDoArtigoAtivo.length === 0 && !novaNotaDados ? (
                <div className="rounded-xl border border-dashed border-[var(--border-hairline)] p-6 text-center">
                  <Highlighter className="mx-auto h-6 w-6 text-[var(--text-muted)]" aria-hidden="true" />
                  <p className="mt-2 text-xs font-medium text-[var(--text-primary)]">
                    Nenhuma anotação neste item
                  </p>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    Selecione qualquer trecho do texto para grifar e anotar, ou clique em “Nota geral”.
                  </p>
                </div>
              ) : (
                notasDoArtigoAtivo.map((nota) => (
                  <div
                    key={nota.id}
                    className={`rounded-xl border p-3.5 transition-colors ${
                      notaDestacadaId === nota.id
                        ? 'border-[var(--accent-primary)] bg-[var(--bg-subtle)]'
                        : 'border-[var(--border-hairline)] bg-[var(--bg-canvas)]'
                    }`}
                  >
                    <RichNoteEditor
                      conteudoInicialHtml={nota.conteudoHtml}
                      jurisprudenciaInicial={nota.jurisprudencia}
                      tagsIniciais={nota.tags}
                      trechoSelecionado={nota.trechoSelecionado}
                      autosave
                      onSalvar={async (dados) => {
                        await salvarAnotacao({
                          ...nota,
                          ...dados,
                        });
                      }}
                      onExcluir={async () => {
                        await removerAnotacao(nota.id);
                      }}
                    />
                  </div>
                ))
              )}
            </div>
          </aside>
        )}
      </div>

      {artigoEmEdicao && (
        <ArticleEditorModal
          artigo={artigoEmEdicao}
          temProximo={
            artigos.findIndex((a) => a.id === artigoEmEdicao.id) < artigos.length - 1
          }
          onFechar={() => setArtigoEmEdicao(null)}
        />
      )}
    </div>
  );
};
