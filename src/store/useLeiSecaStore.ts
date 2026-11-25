import { create } from 'zustand';
import {
  CONFIGURACAO_PADRAO,
  db,
  ESCALA_FONTE_INTERFACE_PADRAO,
  garantirConfiguracaoInicial,
  garantirPastasRaiz,
  ID_PASTAS_RAIZ,
  normalizarEscalaFonteInterface,
  normalizarTamanhoFonteLeitor,
  registrarAtividadeDiaria,
  TAMANHO_FONTE_LEITOR_PADRAO,
} from '@/src/db/database';
import { auth, salvarPreferenciasFonteUsuario } from '@/src/firebase';
import {
  type GrifoNaoReancorado,
  reancorarGrifosEAnotacoesReprocessamento,
  reancorarGrifosNoBloco,
} from '@/src/parser/anchor';
import { parseDocumentoPorTipo } from '@/src/parser/documentParsers';
import {
  carregarPreferenciasHifenMapa,
  salvarPreferenciaHifenUsuario,
} from '@/src/parser/hyphenReunifier';
import { detectarCodigosNoTexto } from '@/src/parser/legalParser';
import { VADE_MECUM_AMOSTRA_TEXTO } from '@/src/parser/sampleVadeMecum';
import type {
  Anotacao,
  Artigo,
  BlocoArtigo,
  Codigo,
  CodigoDetectado,
  Colecao,
  ConfiguracaoUsuario,
  CorConfig,
  Grifo,
  Pasta,
  PreferenciasLeitura,
  Progresso,
  StatusEstudo,
  TipoDocumento,
} from '@/src/types/domain';
import { validarCorCssSegura } from '@/src/utils/security';
import {
  calcularProximaRevisao,
  derivarPaletaMarcador,
  MAX_CORES_PERSONALIZADAS,
  normalizarCorHex6,
} from '@/src/utils/studyHelpers';

export type PaginaAtiva =
  | 'inicio'
  | 'biblioteca'
  | 'leitor'
  | 'anotacoes'
  | 'revisao'
  | 'flashcards'
  | 'exportar'
  | 'configuracoes';

interface ComandoHistorico {
  descricao: string;
  desfazer: () => Promise<void>;
  refazer: () => Promise<void>;
}

export interface NotificacaoToast {
  id: number;
  mensagem: string;
  tipo: 'sucesso' | 'erro' | 'info';
}

export interface ItemImportacao {
  idTemp?: string;
  nome: string;
  sigla: string;
  texto: string;
  textoRaw?: string;
  fonteArquivo?: string;
}

export interface ResultadoReprocessamento {
  codigoId: string;
  codigoNome: string;
  totalArtigos: number;
  grifosReancoradosCount: number;
  grifosNaoReancorados: GrifoNaoReancorado[];
}

export interface OpcoesImportacao {
  tipoDocumento?: TipoDocumento;
  pastaDestinoId?: string;
}

interface LeiSecaState {
  inicializado: boolean;
  pagina: PaginaAtiva;
  codigoAtivoId: string | null;
  artigoAtivoId: string | null;
  buscaGlobalAberta: boolean;
  sidebarLeitorAberta: boolean;
  painelNotasAberto: boolean;
  modoMemorizacao: boolean;
  configuracao: ConfiguracaoUsuario;
  undoStack: ComandoHistorico[];
  redoStack: ComandoHistorico[];
  toast: NotificacaoToast | null;
  avisosReprocessamento: GrifoNaoReancorado[];

  inicializar: () => Promise<void>;
  navegarPara: (pagina: PaginaAtiva) => void;
  abrirArtigoNoLeitor: (codigoId: string, artigoId?: string) => Promise<void>;
  definirArtigoAtivo: (artigoId: string) => Promise<void>;
  setBuscaGlobalAberta: (aberta: boolean) => void;
  setSidebarLeitorAberta: (aberta: boolean) => void;
  setPainelNotasAberto: (aberto: boolean) => void;
  setModoMemorizacao: (ativo: boolean) => void;
  alternarSidebarPrincipal: () => Promise<void>;
  definirLarguraSidebarPrincipal: (largura: number) => Promise<void>;
  definirLarguraSidebarLeitor: (largura: number) => Promise<void>;
  definirLarguraPainelNotas: (largura: number) => Promise<void>;
  alternarModoFocoTotal: () => Promise<void>;
  mostrarToast: (mensagem: string, tipo?: 'sucesso' | 'erro' | 'info') => void;
  limparToast: () => void;

  atualizarPreferencias: (parcial: Partial<PreferenciasLeitura>) => Promise<void>;
  sincronizarPreferenciasUsuario: (preferenciasUsuario?: {
    escalaFonteInterface?: number;
    tamanhoFonteLeitor?: number;
  }) => Promise<void>;
  atualizarCorConfig: (
    corId: string,
    parcial: Partial<CorConfig> & { corHex?: string }
  ) => Promise<void>;
  adicionarCorPersonalizada: (dados: {
    nome: string;
    corHex: string;
    significado?: string;
  }) => Promise<{ sucesso: boolean; erro?: string }>;
  removerCorPersonalizada: (corId: string) => Promise<void>;
  atualizarMetaDiaria: (meta: number) => Promise<void>;
  concluirTutorial: () => Promise<void>;

  criarPasta: (nome: string, parentId?: string | null) => Promise<Pasta>;
  renomearPasta: (pastaId: string, novoNome: string) => Promise<void>;
  moverPasta: (pastaId: string, destinoParentId: string | null) => Promise<void>;
  moverCodigoParaPasta: (codigoId: string, destinoPastaId: string) => Promise<void>;
  excluirPasta: (pastaId: string) => Promise<void>;

  importarCodigosConfirmados: (
    itens: ItemImportacao[],
    artigosPreParseados?: Record<string, Artigo[]>,
    opcoes?: OpcoesImportacao
  ) => Promise<Codigo[]>;
  carregarAmostraDemonstracao: () => Promise<void>;
  reprocessarCodigo: (codigoId: string) => Promise<ResultadoReprocessamento | null>;
  reprocessarCodigosLegados: () => Promise<void>;
  limparAvisosReprocessamento: () => void;
  excluirCodigo: (codigoId: string) => Promise<void>;

  criarGrifo: (dados: Omit<Grifo, 'id' | 'criadoEm' | 'atualizadoEm'>) => Promise<Grifo>;
  alterarCorGrifo: (grifoId: string, novaCorId: string) => Promise<void>;
  removerGrifo: (grifoId: string) => Promise<void>;

  salvarAnotacao: (
    dados: Omit<Anotacao, 'id' | 'criadoEm' | 'atualizadoEm'> & { id?: string }
  ) => Promise<Anotacao>;
  removerAnotacao: (anotacaoId: string) => Promise<void>;

  alternarFavorito: (artigoId: string) => Promise<void>;
  definirStatusEstudo: (artigoId: string, codigoId: string, status: StatusEstudo) => Promise<void>;
  registrarRevisaoEspacada: (artigoId: string, codigoId: string, acertou: boolean) => Promise<void>;

  criarColecao: (nome: string, descricao?: string) => Promise<Colecao>;
  alternarArtigoEmColecao: (colecaoId: string, artigoId: string) => Promise<void>;
  excluirColecao: (colecaoId: string) => Promise<void>;

  salvarEdicaoManualArtigo: (
    artigoId: string,
    blocos: BlocoArtigo[],
    epigrafe?: string
  ) => Promise<void>;
  mesclarArtigoComProximo: (artigoId: string) => Promise<void>;
  dividirArtigoEmBloco: (
    artigoId: string,
    indiceBloco: number,
    novoNumero: string
  ) => Promise<void>;

  desfazer: () => Promise<void>;
  refazer: () => Promise<void>;
}

export function aplicarTemaNoDocumento(tema: PreferenciasLeitura['tema']) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.remove('dark', 'sepia');
  if (tema === 'escuro') root.classList.add('dark');
  if (tema === 'sepia') root.classList.add('sepia');
}

let listenerFonteRegistrado = false;

export function aplicarTamanhoFonteNoDocumento(
  _escalaInterface?: number | null,
  tamanhoFonteLeitor?: number | null
): { escalaInterface: number; tamanhoFonteLeitor: number } {
  const leitor = normalizarTamanhoFonteLeitor(tamanhoFonteLeitor);
  let escalaEfetiva = 100;

  if (typeof document !== 'undefined' && typeof window !== 'undefined') {
    const root = document.documentElement;
    // Remove qualquer sobrescrita fixa para herdar 100% da fonte configurada no aparelho/navegador do usuário
    root.style.removeProperty('font-size');
    const medido = parseFloat(window.getComputedStyle(root).fontSize);
    const baseDispositivo = Number.isFinite(medido) && medido > 0 ? medido : 16;

    // Garante legibilidade mínima caso algum ambiente retorne base menor que 16px
    const baseFinal = Math.max(16, baseDispositivo);
    if (baseDispositivo < 16) {
      root.style.fontSize = '16px';
    }

    const fatorEscala = baseFinal / 16;
    escalaEfetiva = Math.round(fatorEscala * 100);
    root.style.setProperty('--app-font-base', `${baseFinal}px`);
    root.style.setProperty('--app-font-scale', String(fatorEscala));
    root.style.setProperty('--reader-font-size', `${Math.round(leitor * fatorEscala)}px`);
  }

  return { escalaInterface: escalaEfetiva, tamanhoFonteLeitor: leitor };
}

function novoId(prefixo: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefixo}_${crypto.randomUUID()}`;
  }
  return `${prefixo}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export const useLeiSecaStore = create<LeiSecaState>((set, get) => ({
  inicializado: false,
  pagina: 'inicio',
  codigoAtivoId: null,
  artigoAtivoId: null,
  buscaGlobalAberta: false,
  sidebarLeitorAberta: false,
  painelNotasAberto: false,
  modoMemorizacao: false,
  configuracao: CONFIGURACAO_PADRAO,
  undoStack: [],
  redoStack: [],
  toast: null,
  avisosReprocessamento: [],

  inicializar: async () => {
    const cfg = await garantirConfiguracaoInicial();
    aplicarTemaNoDocumento(cfg.preferencias.tema);
    aplicarTamanhoFonteNoDocumento(
      cfg.preferencias.escalaFonteInterface ?? ESCALA_FONTE_INTERFACE_PADRAO,
      cfg.preferencias.tamanhoFonte ?? TAMANHO_FONTE_LEITOR_PADRAO
    );
    if (typeof window !== 'undefined' && !listenerFonteRegistrado) {
      listenerFonteRegistrado = true;
      const sincronizarFonteDispositivo = () => {
        const prefsAtuais = get().configuracao.preferencias;
        aplicarTamanhoFonteNoDocumento(
          prefsAtuais.escalaFonteInterface ?? ESCALA_FONTE_INTERFACE_PADRAO,
          prefsAtuais.tamanhoFonte ?? TAMANHO_FONTE_LEITOR_PADRAO
        );
      };
      window.addEventListener('resize', sincronizarFonteDispositivo, { passive: true });
      window.addEventListener('focus', sincronizarFonteDispositivo, { passive: true });
    }
    const ehTelaCompacta =
      typeof window !== 'undefined' && window.innerWidth < 1024;
    set({
      inicializado: true,
      configuracao: cfg,
      codigoAtivoId: cfg.ultimoCodigoId || null,
      artigoAtivoId: cfg.ultimoArtigoId || null,
      sidebarLeitorAberta: ehTelaCompacta
        ? false
        : (cfg.preferencias.sidebarLeitorAberta ?? false),
      painelNotasAberto: ehTelaCompacta
        ? false
        : (cfg.preferencias.painelNotasAberto ?? false),
    });
    // Migração automática e não destrutiva para códigos importados antes da correção de hifenização
    void get().reprocessarCodigosLegados();
  },

  navegarPara: (pagina) => set({ pagina }),

  abrirArtigoNoLeitor: async (codigoId, artigoId) => {
    let codigoFinalId = codigoId;
    let alvoArtigoId = artigoId || null;

    if (alvoArtigoId) {
      const art = await db.artigos.get(alvoArtigoId);
      if (art) {
        codigoFinalId = art.codigoId;
      } else {
        alvoArtigoId = null;
      }
    }

    if (!alvoArtigoId) {
      let primeiro = await db.artigos
        .where('[codigoId+ordem]')
        .between([codigoFinalId, 0], [codigoFinalId, Number.MAX_SAFE_INTEGER])
        .first();
      if (!primeiro) {
        const ordenados = await db.artigos
          .where('codigoId')
          .equals(codigoFinalId)
          .sortBy('ordem');
        primeiro = ordenados[0];
      }
      alvoArtigoId = primeiro?.id || null;
    }

    set({
      pagina: 'leitor',
      codigoAtivoId: codigoFinalId,
      artigoAtivoId: alvoArtigoId,
    });

    if (alvoArtigoId) {
      await get().definirArtigoAtivo(alvoArtigoId);
    } else {
      await db.configuracoes.update('default', {
        ultimoCodigoId: codigoFinalId,
        ultimoArtigoId: undefined,
        atualizadoEm: Date.now(),
      });
    }
  },

  definirArtigoAtivo: async (artigoId) => {
    const art = await db.artigos.get(artigoId);
    if (!art) return;

    const agora = Date.now();
    set((s) => ({
      codigoAtivoId: art.codigoId,
      artigoAtivoId: art.id,
      configuracao: {
        ...s.configuracao,
        ultimoCodigoId: art.codigoId,
        ultimoArtigoId: art.id,
      },
    }));

    await db.configuracoes.update('default', {
      ultimoCodigoId: art.codigoId,
      ultimoArtigoId: art.id,
      atualizadoEm: agora,
    });

    const progExistente = await db.progressos.get(art.id);
    if (progExistente) {
      await db.progressos.update(art.id, { acessadoEm: agora });
    } else {
      await db.progressos.put({
        id: art.id,
        artigoId: art.id,
        codigoId: art.codigoId,
        status: 'nao_estudado',
        repeticoes: 0,
        acessadoEm: agora,
      });
    }
  },

  setBuscaGlobalAberta: (aberta) => set({ buscaGlobalAberta: aberta }),

  setSidebarLeitorAberta: (aberta) => {
    set({ sidebarLeitorAberta: aberta });
    void get().atualizarPreferencias({ sidebarLeitorAberta: aberta });
  },

  setPainelNotasAberto: (aberto) => {
    set({ painelNotasAberto: aberto });
    void get().atualizarPreferencias({ painelNotasAberto: aberto });
  },

  setModoMemorizacao: (ativo) => set({ modoMemorizacao: ativo }),

  alternarSidebarPrincipal: async () => {
    const atual = !!get().configuracao.preferencias.sidebarPrincipalRecolhida;
    await get().atualizarPreferencias({ sidebarPrincipalRecolhida: !atual });
  },

  definirLarguraSidebarPrincipal: async (largura) => {
    const clamped = Math.max(200, Math.min(360, Math.round(largura)));
    await get().atualizarPreferencias({ sidebarPrincipalLargura: clamped });
  },

  definirLarguraSidebarLeitor: async (largura) => {
    const clamped = Math.max(220, Math.min(440, Math.round(largura)));
    await get().atualizarPreferencias({ sidebarLeitorLargura: clamped });
  },

  definirLarguraPainelNotas: async (largura) => {
    const clamped = Math.max(280, Math.min(520, Math.round(largura)));
    await get().atualizarPreferencias({ painelNotasLargura: clamped });
  },

  alternarModoFocoTotal: async () => {
    const ativo = !!get().configuracao.preferencias.modoFocoTotal;
    const novo = !ativo;
    set({
      sidebarLeitorAberta: false,
      painelNotasAberto: false,
    });
    await get().atualizarPreferencias({
      modoFocoTotal: novo,
      sidebarLeitorAberta: false,
      painelNotasAberto: false,
    });
  },

  mostrarToast: (mensagem, tipo = 'info') => {
    const id = Date.now();
    set({ toast: { id, mensagem, tipo } });
    setTimeout(() => {
      if (get().toast?.id === id) {
        set({ toast: null });
      }
    }, 3600);
  },

  limparToast: () => set({ toast: null }),

  atualizarPreferencias: async (parcial) => {
    const atual = get().configuracao;
    const escalaNormalizada =
      parcial.escalaFonteInterface !== undefined
        ? normalizarEscalaFonteInterface(parcial.escalaFonteInterface)
        : normalizarEscalaFonteInterface(atual.preferencias.escalaFonteInterface);
    const tamanhoNormalizado =
      parcial.tamanhoFonte !== undefined
        ? normalizarTamanhoFonteLeitor(parcial.tamanhoFonte)
        : normalizarTamanhoFonteLeitor(atual.preferencias.tamanhoFonte);

    const novasPrefs: PreferenciasLeitura = {
      ...atual.preferencias,
      ...parcial,
      escalaFonteInterface: escalaNormalizada,
      tamanhoFonte: tamanhoNormalizado,
    };

    if (parcial.tema) {
      aplicarTemaNoDocumento(parcial.tema);
    }
    if (
      parcial.escalaFonteInterface !== undefined ||
      parcial.tamanhoFonte !== undefined
    ) {
      aplicarTamanhoFonteNoDocumento(escalaNormalizada, tamanhoNormalizado);
    }

    const novaCfg: ConfiguracaoUsuario = {
      ...atual,
      preferencias: novasPrefs,
      atualizadoEm: Date.now(),
    };
    set({ configuracao: novaCfg });
    await db.configuracoes.put(novaCfg);

    const usuarioAtual = auth.currentUser;
    if (
      usuarioAtual &&
      usuarioAtual.emailVerified &&
      (parcial.escalaFonteInterface !== undefined || parcial.tamanhoFonte !== undefined)
    ) {
      void salvarPreferenciasFonteUsuario(usuarioAtual.uid, {
        ...(parcial.escalaFonteInterface !== undefined
          ? { escalaFonteInterface: escalaNormalizada }
          : {}),
        ...(parcial.tamanhoFonte !== undefined
          ? { tamanhoFonteLeitor: tamanhoNormalizado }
          : {}),
      }).catch((err) => {
        console.warn('Não foi possível sincronizar preferências de fonte no Firestore:', err);
      });
    }
  },

  sincronizarPreferenciasUsuario: async (preferenciasUsuario) => {
    const atual = await garantirConfiguracaoInicial();
    const escalaPadronizada = normalizarEscalaFonteInterface(
      preferenciasUsuario?.escalaFonteInterface ?? atual.preferencias.escalaFonteInterface
    );
    const leitorPadronizado = normalizarTamanhoFonteLeitor(
      preferenciasUsuario?.tamanhoFonteLeitor ?? atual.preferencias.tamanhoFonte
    );

    aplicarTamanhoFonteNoDocumento(escalaPadronizada, leitorPadronizado);

    const novaCfg: ConfiguracaoUsuario = {
      ...atual,
      preferencias: {
        ...atual.preferencias,
        escalaFonteInterface: escalaPadronizada,
        tamanhoFonte: leitorPadronizado,
      },
      atualizadoEm: Date.now(),
    };

    set({ configuracao: novaCfg });
    await db.configuracoes.put(novaCfg);
  },

  atualizarCorConfig: async (corId, parcial) => {
    const atual = get().configuracao;
    const { corHex, ...rest } = parcial;
    const paletaDerivada =
      typeof corHex === 'string'
        ? derivarPaletaMarcador(normalizarCorHex6(corHex))
        : null;

    const novasCores = atual.cores.map((c) => {
      if (c.id !== corId) return c;
      const nomeLimpo =
        typeof rest.nome === 'string' ? rest.nome.slice(0, 40) : c.nome;
      const significadoLimpo =
        typeof rest.significado === 'string'
          ? rest.significado.slice(0, 100)
          : c.significado;

      const hexBg = paletaDerivada
        ? paletaDerivada.hexBg
        : validarCorCssSegura(rest.hexBg, c.hexBg);
      const hexBgDark = paletaDerivada
        ? paletaDerivada.hexBgDark
        : validarCorCssSegura(rest.hexBgDark, c.hexBgDark);
      const hexBorder = paletaDerivada
        ? paletaDerivada.hexBorder
        : validarCorCssSegura(rest.hexBorder, c.hexBorder);

      return {
        ...c,
        ...rest,
        nome: nomeLimpo,
        significado: significadoLimpo,
        hexBg,
        hexBgDark,
        hexBorder,
      };
    });

    const novaCfg: ConfiguracaoUsuario = {
      ...atual,
      cores: novasCores,
      atualizadoEm: Date.now(),
    };
    set({ configuracao: novaCfg });
    await db.configuracoes.put(novaCfg);
  },

  adicionarCorPersonalizada: async ({ nome, corHex, significado }) => {
    const atual = get().configuracao;
    const personalizadas = atual.cores.filter((c) => c.personalizada);
    if (personalizadas.length >= MAX_CORES_PERSONALIZADAS) {
      return {
        sucesso: false,
        erro: `Limite máximo de ${MAX_CORES_PERSONALIZADAS} marcadores personalizados atingido.`,
      };
    }

    const nomeLimpo = nome.trim().slice(0, 40);
    if (!nomeLimpo) {
      return { sucesso: false, erro: 'Informe um nome para o marcador.' };
    }

    const corNormalizada = normalizarCorHex6(corHex, '#a855f7');
    const paleta = derivarPaletaMarcador(corNormalizada);
    const novaCor: CorConfig = {
      id: novoId('cor'),
      nome: nomeLimpo,
      significado: (significado || '').trim().slice(0, 100),
      hexBg: validarCorCssSegura(paleta.hexBg, '#e9d5ff'),
      hexBgDark: validarCorCssSegura(paleta.hexBgDark, 'rgba(168, 85, 247, 0.32)'),
      hexBorder: validarCorCssSegura(paleta.hexBorder, '#a855f7'),
      atalho: '',
      personalizada: true,
    };

    const novaCfg: ConfiguracaoUsuario = {
      ...atual,
      cores: [...atual.cores, novaCor],
      atualizadoEm: Date.now(),
    };
    set({ configuracao: novaCfg });
    await db.configuracoes.put(novaCfg);
    return { sucesso: true };
  },

  removerCorPersonalizada: async (corId) => {
    const atual = get().configuracao;
    const alvo = atual.cores.find((c) => c.id === corId);
    if (!alvo?.personalizada) return;

    const novasCores = atual.cores.filter((c) => c.id !== corId);
    const corFallbackId =
      novasCores.find((c) => !c.personalizada)?.id || novasCores[0]?.id || 'amarelo';

    const novaCfg: ConfiguracaoUsuario = {
      ...atual,
      cores: novasCores,
      atualizadoEm: Date.now(),
    };

    await db.transaction('rw', [db.configuracoes, db.grifos, db.anotacoes], async () => {
      await db.configuracoes.put(novaCfg);
      const grifosAfetados = await db.grifos.where('corId').equals(corId).toArray();
      if (grifosAfetados.length > 0) {
        const agora = Date.now();
        await db.grifos.bulkPut(
          grifosAfetados.map((g) => ({ ...g, corId: corFallbackId, atualizadoEm: agora }))
        );
      }
      const todasNotas = await db.anotacoes.toArray();
      const notasAfetadas = todasNotas.filter((n) => n.corId === corId);
      if (notasAfetadas.length > 0) {
        const agora = Date.now();
        await db.anotacoes.bulkPut(
          notasAfetadas.map((n) => ({ ...n, corId: corFallbackId, atualizadoEm: agora }))
        );
      }
    });

    set({ configuracao: novaCfg });
  },

  atualizarMetaDiaria: async (meta) => {
    const atual = get().configuracao;
    const novaCfg: ConfiguracaoUsuario = {
      ...atual,
      metaDiariaArtigos: Math.max(1, Math.min(200, meta)),
      atualizadoEm: Date.now(),
    };
    set({ configuracao: novaCfg });
    await db.configuracoes.put(novaCfg);
  },

  concluirTutorial: async () => {
    const atual = get().configuracao;
    const novaCfg: ConfiguracaoUsuario = {
      ...atual,
      tutorialConcluido: true,
      atualizadoEm: Date.now(),
    };
    set({ configuracao: novaCfg });
    await db.configuracoes.put(novaCfg);
  },

  criarPasta: async (nome, parentId = null) => {
    const agora = Date.now();
    const existentes = await db.pastas.toArray();
    const pasta: Pasta = {
      id: novoId('pst'),
      nome: nome.trim() || 'Nova pasta',
      parentId,
      fixa: false,
      ordem: existentes.length,
      criadoEm: agora,
      atualizadoEm: agora,
    };
    await db.pastas.put(pasta);
    get().mostrarToast(`Pasta "${pasta.nome}" criada.`, 'sucesso');
    return pasta;
  },

  renomearPasta: async (pastaId, novoNome) => {
    const limpa = novoNome.trim();
    if (!limpa) return;
    await db.pastas.update(pastaId, { nome: limpa, atualizadoEm: Date.now() });
    get().mostrarToast(`Pasta renomeada para "${limpa}".`, 'sucesso');
  },

  moverPasta: async (pastaId, destinoParentId) => {
    const pasta = await db.pastas.get(pastaId);
    if (!pasta || pasta.fixa) return;
    if (pastaId === destinoParentId) return;

    const todas = await db.pastas.toArray();
    const mapa = new Map(todas.map((p) => [p.id, p]));
    let cursor = destinoParentId;
    while (cursor) {
      if (cursor === pastaId) {
        get().mostrarToast('Não é possível mover uma pasta para dentro dela mesma.', 'erro');
        return;
      }
      cursor = mapa.get(cursor)?.parentId || null;
    }

    await db.pastas.update(pastaId, {
      parentId: destinoParentId,
      atualizadoEm: Date.now(),
    });
    get().mostrarToast(`Pasta "${pasta.nome}" movida.`, 'sucesso');
  },

  moverCodigoParaPasta: async (codigoId, destinoPastaId) => {
    const cod = await db.codigos.get(codigoId);
    if (!cod || cod.pastaId === destinoPastaId) return;
    await db.codigos.update(codigoId, {
      pastaId: destinoPastaId,
      atualizadoEm: Date.now(),
    });
    get().mostrarToast(`"${cod.nome}" movido para a pasta selecionada.`, 'sucesso');
  },

  excluirPasta: async (pastaId) => {
    const pasta = await db.pastas.get(pastaId);
    if (!pasta) return;
    if (pasta.fixa) {
      get().mostrarToast('Pastas principais do sistema não podem ser removidas.', 'erro');
      return;
    }

    const todasPastas = await db.pastas.toArray();
    const idsParaRemover = new Set<string>([pastaId]);
    let adicionou = true;
    while (adicionou) {
      adicionou = false;
      for (const p of todasPastas) {
        if (p.parentId && idsParaRemover.has(p.parentId) && !idsParaRemover.has(p.id)) {
          idsParaRemover.add(p.id);
          adicionou = true;
        }
      }
    }

    const codigosDaPasta = await db.codigos
      .filter((c) => !!c.pastaId && idsParaRemover.has(c.pastaId))
      .toArray();
    const codigoIds = codigosDaPasta.map((c) => c.id);

    await db.transaction(
      'rw',
      [db.pastas, db.codigos, db.artigos, db.grifos, db.anotacoes, db.progressos],
      async () => {
        for (const idPasta of idsParaRemover) {
          await db.pastas.delete(idPasta);
        }
        for (const codId of codigoIds) {
          await db.codigos.delete(codId);
          await db.artigos.where('codigoId').equals(codId).delete();
          await db.grifos.where('codigoId').equals(codId).delete();
          await db.anotacoes.where('codigoId').equals(codId).delete();
          await db.progressos.where('codigoId').equals(codId).delete();
        }
      }
    );

    if (get().codigoAtivoId && codigoIds.includes(get().codigoAtivoId!)) {
      set({ codigoAtivoId: null, artigoAtivoId: null });
    }
    get().mostrarToast(`Pasta "${pasta.nome}" excluída.`, 'info');
  },

  importarCodigosConfirmados: async (itens, artigosPreParseados, opcoes) => {
    await garantirPastasRaiz();
    const agora = Date.now();
    const tipoDoc: TipoDocumento = opcoes?.tipoDocumento || 'lei_codigo';
    const pastaRaizPadrao = opcoes?.pastaDestinoId || ID_PASTAS_RAIZ[tipoDoc] || ID_PASTAS_RAIZ.outro;

    const existentesCodigos = await db.codigos.count();
    const existentesPastas = await db.pastas.toArray();

    const novasPastas: Pasta[] = [];
    const novosCodigos: Codigo[] = [];
    const todosArtigos: Artigo[] = [];

    itens.forEach((item, idx) => {
      const codigoId = novoId('cod');
      const chaveLookup = item.idTemp || item.sigla;
      const artigosBrutos =
        artigosPreParseados?.[chaveLookup] ||
        parseDocumentoPorTipo(item.texto, codigoId, tipoDoc);

      const artigos = artigosBrutos.map((a) => ({ ...a, codigoId }));

      let pastaIdFinal = pastaRaizPadrao;
      if (tipoDoc === 'vade_mecum') {
        const nomeSubpasta = item.nome.trim() || `Código ${idx + 1}`;
        const subExistente = [...existentesPastas, ...novasPastas].find(
          (p) =>
            p.parentId === pastaRaizPadrao &&
            p.nome.toLowerCase() === nomeSubpasta.toLowerCase()
        );
        if (subExistente) {
          pastaIdFinal = subExistente.id;
        } else {
          const novaSub: Pasta = {
            id: novoId('pst'),
            nome: nomeSubpasta,
            parentId: pastaRaizPadrao,
            fixa: false,
            ordem: existentesPastas.length + novasPastas.length,
            criadoEm: agora,
            atualizadoEm: agora,
          };
          novasPastas.push(novaSub);
          pastaIdFinal = novaSub.id;
        }
      }

      const codigo: Codigo = {
        id: codigoId,
        nome: item.nome.trim() || 'Documento Importado',
        sigla: item.sigla.trim().toUpperCase() || 'DOC',
        pastaId: pastaIdFinal,
        tipoDocumento: tipoDoc,
        fonteArquivo: item.fonteArquivo,
        textoBrutoOriginal: item.textoRaw || item.texto,
        hifenizacaoVersao: 2,
        totalArtigos: artigos.length,
        ordem: existentesCodigos + idx,
        criadoEm: agora,
        atualizadoEm: agora,
        syncVersion: 1,
      };
      novosCodigos.push(codigo);
      todosArtigos.push(...artigos);
    });

    await db.transaction('rw', [db.pastas, db.codigos, db.artigos], async () => {
      if (novasPastas.length > 0) {
        await db.pastas.bulkPut(novasPastas);
      }
      await db.codigos.bulkPut(novosCodigos);
      if (todosArtigos.length > 0) {
        await db.artigos.bulkPut(todosArtigos);
      }
    });

    get().mostrarToast(
      `${novosCodigos.length} documento(s) e ${todosArtigos.length} unidade(s) importados.`,
      'sucesso'
    );
    return novosCodigos;
  },

  carregarAmostraDemonstracao: async () => {
    const detectados: CodigoDetectado[] = detectarCodigosNoTexto(
      VADE_MECUM_AMOSTRA_TEXTO,
      'Vade_Mecum_Amostra.txt'
    );
    const criados = await get().importarCodigosConfirmados(
      detectados.map((d) => ({
        idTemp: d.idTemp,
        nome: d.nome,
        sigla: d.sigla,
        texto: d.texto,
        textoRaw: d.textoRaw || d.texto,
        fonteArquivo: 'Amostra Oficial (CF/88, CP e CDC)',
      })),
      undefined,
      { tipoDocumento: 'vade_mecum', pastaDestinoId: ID_PASTAS_RAIZ.vade_mecum }
    );
    if (criados[0]) {
      await get().abrirArtigoNoLeitor(criados[0].id);
    }
  },

  limparAvisosReprocessamento: () => set({ avisosReprocessamento: [] }),

  reprocessarCodigo: async (codigoId) => {
    const codigo = await db.codigos.get(codigoId);
    if (!codigo) return null;

    const [artigosAntigos, grifos, anotacoes, progressos, colecoes] = await Promise.all([
      db.artigos.where('[codigoId+ordem]').between([codigoId, 0], [codigoId, Infinity]).toArray(),
      db.grifos.where('codigoId').equals(codigoId).toArray(),
      db.anotacoes.where('codigoId').equals(codigoId).toArray(),
      db.progressos.where('codigoId').equals(codigoId).toArray(),
      db.colecoes.toArray(),
    ]);

    const reconstruirTextoLegado = (): string => {
      const linhasOut: string[] = [];
      let ultimaHier = {
        parte: '',
        livro: '',
        titulo: '',
        capitulo: '',
        secao: '',
        subsecao: '',
      };

      for (let idx = 0; idx < artigosAntigos.length; idx++) {
        const art = artigosAntigos[idx];
        const h = art.hierarquia || {};
        if (h.parte && h.parte !== ultimaHier.parte) {
          linhasOut.push(h.parte);
          ultimaHier = { ...ultimaHier, parte: h.parte, livro: '', titulo: '', capitulo: '', secao: '', subsecao: '' };
        }
        if (h.livro && h.livro !== ultimaHier.livro) {
          linhasOut.push(h.livro);
          ultimaHier = { ...ultimaHier, livro: h.livro, titulo: '', capitulo: '', secao: '', subsecao: '' };
        }
        if (h.titulo && h.titulo !== ultimaHier.titulo) {
          linhasOut.push(h.titulo);
          ultimaHier = { ...ultimaHier, titulo: h.titulo, capitulo: '', secao: '', subsecao: '' };
        }
        if (h.capitulo && h.capitulo !== ultimaHier.capitulo) {
          linhasOut.push(h.capitulo);
          ultimaHier = { ...ultimaHier, capitulo: h.capitulo, secao: '', subsecao: '' };
        }
        if (h.secao && h.secao !== ultimaHier.secao) {
          linhasOut.push(h.secao);
          ultimaHier = { ...ultimaHier, secao: h.secao, subsecao: '' };
        }
        if (h.subsecao && h.subsecao !== ultimaHier.subsecao) {
          linhasOut.push(h.subsecao);
          ultimaHier.subsecao = h.subsecao;
        }

        const ehContinuacaoRoubada =
          idx > 0 &&
          !!art.epigrafe &&
          /^[a-zà-ú]/.test(art.epigrafe.trim()) &&
          /-\s*$/.test(artigosAntigos[idx - 1].textoIntegral);

        if (art.epigrafe && !ehContinuacaoRoubada) {
          linhasOut.push(art.epigrafe);
        }

        const corpoRaw = (art.rawText || (art.tipoUnidade === 'artigo' || !art.tipoUnidade
          ? `Art. ${art.numero} ${art.blocos
              .map((b) => (b.tipo === 'caput' ? b.texto : `${b.rotulo} ${b.texto}`))
              .join('\n')}`
          : art.textoIntegral)
        ).replace(/([\p{L}])([-\u2010\u2011\u2013\u2212\u00AD])\s+([\p{Ll}])/gu, '$1$2\n$3');

        // Se o próximo artigo tinha uma continuação roubada como epígrafe, devolve-a aqui para reunião
        const prox = artigosAntigos[idx + 1];
        if (
          prox?.epigrafe &&
          /^[a-zà-ú]/.test(prox.epigrafe.trim()) &&
          /-\s*$/.test(corpoRaw)
        ) {
          linhasOut.push(`${corpoRaw}\n${prox.epigrafe}`);
        } else {
          linhasOut.push(corpoRaw);
        }
      }

      return linhasOut.join('\n');
    };

    const textoFonte = codigo.textoBrutoOriginal || reconstruirTextoLegado();
    const tipoDoc: TipoDocumento = codigo.tipoDocumento || 'lei_codigo';
    const prefsHifen = carregarPreferenciasHifenMapa();

    const novosBase = parseDocumentoPorTipo(textoFonte, codigoId, tipoDoc, {
      rawTextOriginal: textoFonte,
      opcoesHifen: { preferenciasUsuario: prefsHifen },
    });

    if (novosBase.length === 0) {
      await db.codigos.update(codigoId, { hifenizacaoVersao: 2, atualizadoEm: Date.now() });
      return {
        codigoId,
        codigoNome: codigo.nome,
        totalArtigos: artigosAntigos.length,
        grifosReancoradosCount: 0,
        grifosNaoReancorados: [],
      };
    }

    const reancoragem = reancorarGrifosEAnotacoesReprocessamento({
      artigosAntigos,
      artigosNovos: novosBase,
      grifos,
      anotacoes,
    });

    const mapaFavoritos = new Map<string, boolean>();
    for (const ant of artigosAntigos) {
      const novoIdArt = reancoragem.mapaArtigoIdAntigoParaNovo.get(ant.id);
      if (novoIdArt && ant.favorito) mapaFavoritos.set(novoIdArt, true);
    }

    const novosArtigos: Artigo[] = novosBase.map((a) => ({
      ...a,
      codigoId,
      favorito: mapaFavoritos.get(a.id) ?? a.favorito,
    }));

    const novosProgressos: Progresso[] = [];
    for (const p of progressos) {
      const novoArtId = reancoragem.mapaArtigoIdAntigoParaNovo.get(p.artigoId);
      if (novoArtId) {
        novosProgressos.push({ ...p, id: novoArtId, artigoId: novoArtId });
      }
    }

    const colecoesAtualizadas = colecoes
      .map((col) => {
        const mudou = col.artigoIds.some((id) => reancoragem.mapaArtigoIdAntigoParaNovo.has(id));
        if (!mudou) return null;
        return {
          ...col,
          artigoIds: col.artigoIds.map(
            (id) => reancoragem.mapaArtigoIdAntigoParaNovo.get(id) || id
          ),
          atualizadoEm: Date.now(),
        };
      })
      .filter((c): c is NonNullable<typeof c> => c !== null);

    await db.transaction(
      'rw',
      [db.codigos, db.artigos, db.grifos, db.anotacoes, db.progressos, db.colecoes],
      async () => {
        await db.artigos.where('codigoId').equals(codigoId).delete();
        await db.artigos.bulkPut(novosArtigos);

        if (reancoragem.grifosAtualizados.length > 0) {
          await db.grifos.bulkPut(reancoragem.grifosAtualizados);
        }
        if (reancoragem.anotacoesAtualizadas.length > 0) {
          await db.anotacoes.bulkPut(reancoragem.anotacoesAtualizadas);
        }

        await db.progressos.where('codigoId').equals(codigoId).delete();
        if (novosProgressos.length > 0) {
          await db.progressos.bulkPut(novosProgressos);
        }

        if (colecoesAtualizadas.length > 0) {
          await db.colecoes.bulkPut(colecoesAtualizadas);
        }

        await db.codigos.update(codigoId, {
          textoBrutoOriginal: textoFonte,
          hifenizacaoVersao: 2,
          totalArtigos: novosArtigos.length,
          atualizadoEm: Date.now(),
        });
      }
    );

    // Atualiza artigoAtivoId se estava aberto neste código
    const estadoAtual = get();
    if (estadoAtual.codigoAtivoId === codigoId && estadoAtual.artigoAtivoId) {
      const novoAtivo =
        reancoragem.mapaArtigoIdAntigoParaNovo.get(estadoAtual.artigoAtivoId) ||
        novosArtigos[0]?.id ||
        null;
      set({ artigoAtivoId: novoAtivo });
      await db.configuracoes.update('default', {
        ultimoArtigoId: novoAtivo || undefined,
        atualizadoEm: Date.now(),
      });
    }

    if (reancoragem.grifosNaoReancorados.length > 0) {
      set((s) => ({
        avisosReprocessamento: [
          ...s.avisosReprocessamento,
          ...reancoragem.grifosNaoReancorados,
        ],
      }));
      get().mostrarToast(
        `${codigo.sigla} reprocessado. Atenção: ${reancoragem.grifosNaoReancorados.length} grifo(s) mantidos precisam de revisão.`,
        'info'
      );
    } else {
      get().mostrarToast(
        `${codigo.sigla} reprocessado com sucesso (${novosArtigos.length} itens, ${reancoragem.grifosReancoradosCount} grifo(s) preservados).`,
        'sucesso'
      );
    }

    return {
      codigoId,
      codigoNome: codigo.nome,
      totalArtigos: novosArtigos.length,
      grifosReancoradosCount: reancoragem.grifosReancoradosCount,
      grifosNaoReancorados: reancoragem.grifosNaoReancorados,
    };
  },

  reprocessarCodigosLegados: async () => {
    try {
      const codigos = await db.codigos.toArray();
      const legados = codigos.filter((c) => !c.hifenizacaoVersao || c.hifenizacaoVersao < 2);
      if (legados.length === 0) return;

      for (const cod of legados) {
        const arts = await db.artigos.where('codigoId').equals(cod.id).toArray();
        const precisaReparo = arts.some(
          (a) =>
            !a.rawText ||
            /[\p{L}][-\u2010\u2011\u2013\u2212\u00AD](?:\s+[\p{Ll}]|$)/u.test(a.textoIntegral)
        );
        if (precisaReparo) {
          await get().reprocessarCodigo(cod.id);
        } else {
          await db.codigos.update(cod.id, { hifenizacaoVersao: 2 });
        }
      }
    } catch (err) {
      console.warn('Falha na migração automática de hifenização:', err);
    }
  },

  excluirCodigo: async (codigoId) => {
    await db.transaction(
      'rw',
      [db.codigos, db.artigos, db.grifos, db.anotacoes, db.progressos],
      async () => {
        await db.codigos.delete(codigoId);
        await db.artigos.where('codigoId').equals(codigoId).delete();
        await db.grifos.where('codigoId').equals(codigoId).delete();
        await db.anotacoes.where('codigoId').equals(codigoId).delete();
        await db.progressos.where('codigoId').equals(codigoId).delete();
      }
    );

    if (get().codigoAtivoId === codigoId) {
      set({ codigoAtivoId: null, artigoAtivoId: null });
    }
    get().mostrarToast('Documento removido da biblioteca.', 'info');
  },

  criarGrifo: async (dados) => {
    const agora = Date.now();
    const grifo: Grifo = {
      ...dados,
      id: novoId('grf'),
      criadoEm: agora,
      atualizadoEm: agora,
    };

    await db.grifos.put(grifo);
    await registrarAtividadeDiaria('grifo');

    const cmd: ComandoHistorico = {
      descricao: 'Criar grifo',
      desfazer: async () => {
        await db.grifos.delete(grifo.id);
      },
      refazer: async () => {
        await db.grifos.put(grifo);
      },
    };
    set((s) => ({
      undoStack: [...s.undoStack.slice(-29), cmd],
      redoStack: [],
    }));
    return grifo;
  },

  alterarCorGrifo: async (grifoId, novaCorId) => {
    const anterior = await db.grifos.get(grifoId);
    if (!anterior || anterior.corId === novaCorId) return;
    const atualizado: Grifo = {
      ...anterior,
      corId: novaCorId,
      atualizadoEm: Date.now(),
    };
    await db.grifos.put(atualizado);

    const cmd: ComandoHistorico = {
      descricao: 'Alterar cor do grifo',
      desfazer: async () => {
        await db.grifos.put(anterior);
      },
      refazer: async () => {
        await db.grifos.put(atualizado);
      },
    };
    set((s) => ({
      undoStack: [...s.undoStack.slice(-29), cmd],
      redoStack: [],
    }));
  },

  removerGrifo: async (grifoId) => {
    const anterior = await db.grifos.get(grifoId);
    if (!anterior) return;
    await db.grifos.delete(grifoId);

    const cmd: ComandoHistorico = {
      descricao: 'Remover grifo',
      desfazer: async () => {
        await db.grifos.put(anterior);
      },
      refazer: async () => {
        await db.grifos.delete(grifoId);
      },
    };
    set((s) => ({
      undoStack: [...s.undoStack.slice(-29), cmd],
      redoStack: [],
    }));
  },

  salvarAnotacao: async (dados) => {
    const agora = Date.now();
    const existente = dados.id ? await db.anotacoes.get(dados.id) : undefined;
    const anotacao: Anotacao = {
      ...dados,
      id: existente?.id || dados.id || novoId('ant'),
      criadoEm: existente?.criadoEm || agora,
      atualizadoEm: agora,
    };

    await db.transaction('rw', [db.anotacoes, db.tags], async () => {
      await db.anotacoes.put(anotacao);
      for (const nomeTag of anotacao.tags) {
        const limpa = nomeTag.trim();
        if (!limpa) continue;
        const jaTem = await db.tags.where('nome').equalsIgnoreCase(limpa).first();
        if (!jaTem) {
          await db.tags.put({ id: novoId('tag'), nome: limpa, criadoEm: agora });
        }
      }
    });

    if (!existente) {
      await registrarAtividadeDiaria('anotacao');
    }

    const cmd: ComandoHistorico = {
      descricao: existente ? 'Editar anotação' : 'Criar anotação',
      desfazer: async () => {
        if (existente) {
          await db.anotacoes.put(existente);
        } else {
          await db.anotacoes.delete(anotacao.id);
        }
      },
      refazer: async () => {
        await db.anotacoes.put(anotacao);
      },
    };

    set((s) => ({
      undoStack: [...s.undoStack.slice(-29), cmd],
      redoStack: [],
    }));
    return anotacao;
  },

  removerAnotacao: async (anotacaoId) => {
    const anterior = await db.anotacoes.get(anotacaoId);
    if (!anterior) return;
    await db.anotacoes.delete(anotacaoId);

    const cmd: ComandoHistorico = {
      descricao: 'Remover anotação',
      desfazer: async () => {
        await db.anotacoes.put(anterior);
      },
      refazer: async () => {
        await db.anotacoes.delete(anotacaoId);
      },
    };
    set((s) => ({
      undoStack: [...s.undoStack.slice(-29), cmd],
      redoStack: [],
    }));
  },

  alternarFavorito: async (artigoId) => {
    const art = await db.artigos.get(artigoId);
    if (!art) return;
    await db.artigos.update(artigoId, {
      favorito: !art.favorito,
      atualizadoEm: Date.now(),
    });
  },

  definirStatusEstudo: async (artigoId, codigoId, status) => {
    const agora = Date.now();
    const existente = await db.progressos.get(artigoId);
    const novo: Progresso = {
      id: artigoId,
      artigoId,
      codigoId,
      status,
      repeticoes: existente?.repeticoes ?? 0,
      proximaRevisaoEm:
        status === 'revisar'
          ? calcularProximaRevisao(existente?.repeticoes ?? 0, agora)
          : existente?.proximaRevisaoEm,
      ultimaRevisaoEm: agora,
      acessadoEm: agora,
    };
    await db.progressos.put(novo);
    if (status === 'estudado' || status === 'dominado') {
      await registrarAtividadeDiaria('artigo');
    }
  },

  registrarRevisaoEspacada: async (artigoId, codigoId, acertou) => {
    const agora = Date.now();
    const existente = await db.progressos.get(artigoId);
    const repAtual = existente?.repeticoes ?? 0;
    const novaRep = acertou ? Math.min(4, repAtual + 1) : 0;
    const proximaRevisaoEm = calcularProximaRevisao(novaRep, agora);

    await db.progressos.put({
      id: artigoId,
      artigoId,
      codigoId,
      status: acertou && novaRep >= 4 ? 'dominado' : 'revisar',
      repeticoes: novaRep,
      proximaRevisaoEm,
      ultimaRevisaoEm: agora,
      acessadoEm: agora,
    });
    await registrarAtividadeDiaria('artigo');
  },

  criarColecao: async (nome, descricao) => {
    const agora = Date.now();
    const col: Colecao = {
      id: novoId('col'),
      nome: nome.trim(),
      descricao: descricao?.trim() || undefined,
      artigoIds: [],
      criadoEm: agora,
      atualizadoEm: agora,
    };
    await db.colecoes.put(col);
    get().mostrarToast(`Coleção "${col.nome}" criada.`, 'sucesso');
    return col;
  },

  alternarArtigoEmColecao: async (colecaoId, artigoId) => {
    const col = await db.colecoes.get(colecaoId);
    if (!col) return;
    const existe = col.artigoIds.includes(artigoId);
    const novosIds = existe
      ? col.artigoIds.filter((id) => id !== artigoId)
      : [...col.artigoIds, artigoId];
    await db.colecoes.update(colecaoId, {
      artigoIds: novosIds,
      atualizadoEm: Date.now(),
    });
  },

  excluirColecao: async (colecaoId) => {
    await db.colecoes.delete(colecaoId);
    get().mostrarToast('Coleção removida.', 'info');
  },

  salvarEdicaoManualArtigo: async (artigoId, blocos, epigrafe) => {
    const art = await db.artigos.get(artigoId);
    if (!art) return;
    const textoIntegral = blocos
      .map((b) => (b.tipo === 'caput' ? b.texto : `${b.rotulo} ${b.texto}`))
      .join('\n');

    // Aprende escolhas de hífen quando o usuário corrige manualmente uma palavra
    if (art.reunioesHifen && art.reunioesHifen.length > 0) {
      for (const r of art.reunioesHifen) {
        const comHifen = `${r.antesEsquerda}-${r.antesDireita}`;
        const semHifen = `${r.antesEsquerda}${r.antesDireita}`;
        if (r.hifenRemovido && textoIntegral.includes(comHifen) && !textoIntegral.includes(semHifen)) {
          salvarPreferenciaHifenUsuario(r.antesEsquerda, r.antesDireita, true);
        } else if (
          !r.hifenRemovido &&
          textoIntegral.includes(semHifen) &&
          !textoIntegral.includes(comHifen)
        ) {
          salvarPreferenciaHifenUsuario(r.antesEsquerda, r.antesDireita, false);
        }
      }
    }

    // Também detecta correções diretas de palavras com hífen quebrado no texto antigo (ex.: "inde- pendentes" -> "independentes")
    const regexQuebrada = /([\p{L}]{2,})[-\u2010\u2011\u2013\u2212\u00AD]\s*([\p{Ll}]{2,})/gu;
    for (const m of art.textoIntegral.matchAll(regexQuebrada)) {
      const esq = m[1];
      const dir = m[2];
      const formaSemHifen = `${esq}${dir}`;
      if (textoIntegral.includes(formaSemHifen) && !textoIntegral.includes(m[0])) {
        salvarPreferenciaHifenUsuario(esq, dir, false);
      }
    }

    const grifosDoArtigo = await db.grifos.where('artigoId').equals(artigoId).toArray();
    const grifosAtualizados: Grifo[] = [];
    for (const bloco of blocos) {
      const doBloco = grifosDoArtigo.filter((g) => g.blocoId === bloco.id);
      if (doBloco.length > 0) {
        grifosAtualizados.push(...reancorarGrifosNoBloco(bloco, doBloco));
      }
    }

    await db.transaction('rw', [db.artigos, db.grifos], async () => {
      await db.artigos.update(artigoId, {
        blocos,
        epigrafe: epigrafe?.trim() || undefined,
        textoIntegral,
        text: textoIntegral,
        atualizadoEm: Date.now(),
      });
      if (grifosAtualizados.length > 0) {
        await db.grifos.bulkPut(grifosAtualizados);
      }
    });

    get().mostrarToast('Item atualizado, preferências de hífen aprendidas e grifos re-ancorados.', 'sucesso');
  },

  mesclarArtigoComProximo: async (artigoId) => {
    const art = await db.artigos.get(artigoId);
    if (!art) return;
    const todos = await db.artigos
      .where('[codigoId+ordem]')
      .between([art.codigoId, 0], [art.codigoId, Infinity])
      .toArray();
    const idx = todos.findIndex((a) => a.id === artigoId);
    if (idx === -1 || idx >= todos.length - 1) {
      get().mostrarToast('Não há item seguinte para mesclar.', 'erro');
      return;
    }

    const proximo = todos[idx + 1];
    const blocosCombinados = [...art.blocos, ...proximo.blocos];
    const textoIntegral = blocosCombinados
      .map((b) => (b.tipo === 'caput' ? b.texto : `${b.rotulo} ${b.texto}`))
      .join('\n');

    const restantes = todos.filter((a) => a.id !== proximo.id);
    const reordenados = restantes.map((a, i) =>
      a.id === art.id
        ? { ...a, ordem: i, blocos: blocosCombinados, textoIntegral, atualizadoEm: Date.now() }
        : { ...a, ordem: i }
    );

    await db.transaction(
      'rw',
      [db.artigos, db.grifos, db.anotacoes, db.progressos, db.codigos],
      async () => {
        await db.grifos
          .where('artigoId')
          .equals(proximo.id)
          .modify({ artigoId: art.id });
        await db.anotacoes
          .where('artigoId')
          .equals(proximo.id)
          .modify({ artigoId: art.id });
        await db.progressos.delete(proximo.id);
        await db.artigos.delete(proximo.id);
        await db.artigos.bulkPut(reordenados);
        await db.codigos.update(art.codigoId, {
          totalArtigos: reordenados.length,
          atualizadoEm: Date.now(),
        });
      }
    );

    get().mostrarToast(`Item ${proximo.numero} mesclado ao item ${art.numero}.`, 'sucesso');
  },

  dividirArtigoEmBloco: async (artigoId, indiceBloco, novoNumero) => {
    const art = await db.artigos.get(artigoId);
    if (!art || indiceBloco <= 0 || indiceBloco >= art.blocos.length) return;

    const blocosPrimeiro = art.blocos.slice(0, indiceBloco);
    const blocosSegundo = art.blocos.slice(indiceBloco).map((b, idx) =>
      idx === 0 ? { ...b, tipo: 'caput' as const, rotulo: `Art. ${novoNumero}`, nivel: 0 } : b
    );

    const novoArtigo: Artigo = {
      id: novoId('art'),
      codigoId: art.codigoId,
      numero: novoNumero.trim(),
      numeroSort: art.numeroSort + 0.001,
      ordem: art.ordem + 1,
      tipoUnidade: art.tipoUnidade,
      hierarquia: { ...art.hierarquia },
      blocos: blocosSegundo,
      textoIntegral: blocosSegundo
        .map((b) => (b.tipo === 'caput' ? b.texto : `${b.rotulo} ${b.texto}`))
        .join('\n'),
      favorito: false,
      atualizadoEm: Date.now(),
    };

    const todos = await db.artigos
      .where('[codigoId+ordem]')
      .between([art.codigoId, 0], [art.codigoId, Infinity])
      .toArray();

    const idxAtual = todos.findIndex((a) => a.id === artigoId);
    const atualizadoPrimeiro: Artigo = {
      ...art,
      blocos: blocosPrimeiro,
      textoIntegral: blocosPrimeiro
        .map((b) => (b.tipo === 'caput' ? b.texto : `${b.rotulo} ${b.texto}`))
        .join('\n'),
      atualizadoEm: Date.now(),
    };

    const listaFinal = [
      ...todos.slice(0, idxAtual),
      atualizadoPrimeiro,
      novoArtigo,
      ...todos.slice(idxAtual + 1),
    ].map((a, i) => ({ ...a, ordem: i }));

    const idsSegundoBlocos = new Set(blocosSegundo.map((b) => b.id));

    await db.transaction('rw', [db.artigos, db.grifos, db.anotacoes, db.codigos], async () => {
      await db.artigos.bulkPut(listaFinal);
      await db.grifos
        .where('artigoId')
        .equals(art.id)
        .modify((g) => {
          if (idsSegundoBlocos.has(g.blocoId)) {
            g.artigoId = novoArtigo.id;
          }
        });
      await db.anotacoes
        .where('artigoId')
        .equals(art.id)
        .modify((n) => {
          if (n.blocoId && idsSegundoBlocos.has(n.blocoId)) {
            n.artigoId = novoArtigo.id;
          }
        });
      await db.codigos.update(art.codigoId, {
        totalArtigos: listaFinal.length,
        atualizadoEm: Date.now(),
      });
    });

    get().mostrarToast(`Item dividido: criado ${novoArtigo.numero}.`, 'sucesso');
  },

  desfazer: async () => {
    const stack = get().undoStack;
    if (stack.length === 0) return;
    const ultimo = stack[stack.length - 1];
    await ultimo.desfazer();
    set((s) => ({
      undoStack: s.undoStack.slice(0, -1),
      redoStack: [...s.redoStack.slice(-29), ultimo],
    }));
    get().mostrarToast(`Desfeito: ${ultimo.descricao}`, 'info');
  },

  refazer: async () => {
    const stack = get().redoStack;
    if (stack.length === 0) return;
    const ultimo = stack[stack.length - 1];
    await ultimo.refazer();
    set((s) => ({
      redoStack: s.redoStack.slice(0, -1),
      undoStack: [...s.undoStack.slice(-29), ultimo],
    }));
    get().mostrarToast(`Refeito: ${ultimo.descricao}`, 'info');
  },
}));
