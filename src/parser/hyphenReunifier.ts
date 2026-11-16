import type { PreferenciaHifen, RegistroHifenizacao } from '@/src/types/domain';
import { COMPOSTOS_EXCECOES_SET, PREFIXOS_HIFEN_SET } from './hyphenExceptions';
import {
  ehPalavraSolidaConhecida,
  existeCompostoComHifenPtBr,
  existeNoDicionarioPtBr,
} from './ptBrDictionary';

export interface LinhaComOrigem {
  texto: string;
  pagina?: number;
  linhaOriginal: number;
}

export interface OpcoesReuniaoHifen {
  preferenciasUsuario?: Record<string, boolean>; // chave: "esquerda|direita" -> true (manter) | false (juntar)
  overridesPorId?: Record<string, boolean>; // chave: registro.id -> true (manter) | false (juntar)
}

export interface ResultadoReuniaoHifen {
  textoTratado: string;
  textoBruto: string;
  linhasTratadas: LinhaComOrigem[];
  reunioes: RegistroHifenizacao[];
}

const CHAVE_STORAGE_PREFS_HIFEN = 'leiseca_preferencias_hifen_v1';

// Hífens aceitos no fim da linha: ASCII '-', Unicode hyphen '‐', non-breaking '‑', en-dash '–', minus '−', soft hyphen U+00AD
const REGEX_LINHA_TERMINA_HIFEN =
  /^([\s\S]*?)([\p{L}\p{N}º°]+)([-\u2010\u2011\u2013\u2212\u00AD])\s*$/u;

const REGEX_CONTINUACAO_PALAVRA = /^(§|[\p{L}\p{N}]+)([\s\S]*)$/u;

const REGEX_INICIO_ESTRUTURA_BLOQUEIO =
  /^(?:PARTE\s+(?:GERAL|ESPECIAL|[IVXLCDM]+|\w+)|LIVRO\s+(?:[IVXLCDM]+|\w+)|T[ÍI]TULO\s+(?:[IVXLCDM]+|\d+)|CAP[ÍI]TULO\s+(?:[IVXLCDM]+|\d+)|SE[ÇC][ÃA]O\s+(?:[IVXLCDM]+|\d+)|SUBSE[ÇC][ÃA]O\s+(?:[IVXLCDM]+|\d+)|Art\.?\s*\d+|Par[áa]grafo\s+[úu]nico|§\s*\d+|[IVXLCDM]{1,7}\s*[-–—]\s+|[a-z]{1,2}\)\s+)/i;

export function gerarChavePreferenciaHifen(esquerda: string, direita: string): string {
  return `${esquerda.trim().toLowerCase()}|${direita.trim().toLowerCase()}`;
}

export function carregarPreferenciasHifenMapa(): Record<string, boolean> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const bruto = localStorage.getItem(CHAVE_STORAGE_PREFS_HIFEN);
    if (!bruto) return {};
    const lista = JSON.parse(bruto) as PreferenciaHifen[];
    if (!Array.isArray(lista)) return {};
    const mapa: Record<string, boolean> = {};
    for (const item of lista) {
      if (item && typeof item.chave === 'string' && typeof item.manterHifen === 'boolean') {
        mapa[item.chave] = item.manterHifen;
      }
    }
    return mapa;
  } catch {
    return {};
  }
}

export function listarPreferenciasHifen(): PreferenciaHifen[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const bruto = localStorage.getItem(CHAVE_STORAGE_PREFS_HIFEN);
    if (!bruto) return [];
    const lista = JSON.parse(bruto) as PreferenciaHifen[];
    return Array.isArray(lista) ? lista : [];
  } catch {
    return [];
  }
}

export function salvarPreferenciaHifenUsuario(
  esquerda: string,
  direita: string,
  manterHifen: boolean
): void {
  if (typeof localStorage === 'undefined') return;
  const esq = esquerda.trim();
  const dir = direita.trim();
  if (!esq || !dir) return;
  const chave = gerarChavePreferenciaHifen(esq, dir);
  const atuais = listarPreferenciasHifen().filter((p) => p.chave !== chave);
  atuais.unshift({
    chave,
    esquerda: esq,
    direita: dir,
    manterHifen,
    atualizadoEm: Date.now(),
  });
  try {
    localStorage.setItem(CHAVE_STORAGE_PREFS_HIFEN, JSON.stringify(atuais.slice(0, 500)));
  } catch {
    // noop
  }
}

export function removerPreferenciaHifenUsuario(chave: string): void {
  if (typeof localStorage === 'undefined') return;
  const atuais = listarPreferenciasHifen().filter((p) => p.chave !== chave);
  try {
    localStorage.setItem(CHAVE_STORAGE_PREFS_HIFEN, JSON.stringify(atuais));
  } catch {
    // noop
  }
}

/**
 * Decide se um hífen de quebra de linha entre `antesEsquerda` e `antesDireita`
 * deve ser mantido ou removido, seguindo exatamente a ordem de regras definida:
 * usuario -> a (maiúscula/número/§) -> b (sufixo Art./§) -> c (lista exceções) -> d (dicionário pt-BR) -> e (minúscula junta).
 */
export function decidirHifenizacao(
  antesEsquerda: string,
  antesDireita: string,
  opcoes?: {
    idOcorrencia?: string;
    hifenOriginal?: string;
    preferenciasUsuario?: Record<string, boolean>;
    overridesPorId?: Record<string, boolean>;
  }
): {
  hifenRemovido: boolean;
  regraAplicada: RegistroHifenizacao['regraAplicada'];
  duvida: boolean;
} {
  const id = opcoes?.idOcorrencia;
  if (id && opcoes?.overridesPorId && typeof opcoes.overridesPorId[id] === 'boolean') {
    return {
      hifenRemovido: !opcoes.overridesPorId[id],
      regraAplicada: 'usuario',
      duvida: false,
    };
  }

  const chave = gerarChavePreferenciaHifen(antesEsquerda, antesDireita);
  if (opcoes?.preferenciasUsuario && typeof opcoes.preferenciasUsuario[chave] === 'boolean') {
    return {
      hifenRemovido: !opcoes.preferenciasUsuario[chave],
      regraAplicada: 'usuario',
      duvida: false,
    };
  }

  // Hífen suave (U+00AD) é marcador exclusivo de hifenização automática: sempre reunir sem hífen
  if (opcoes?.hifenOriginal === '\u00AD') {
    return {
      hifenRemovido: true,
      regraAplicada: 'e',
      duvida: false,
    };
  }

  // Regra b: Sufixos de artigo, parágrafo ou ordinal ("Art. 121-A", "§ 2º-A", "5º-B")
  if (/\d+[º°o]?$/i.test(antesEsquerda) && /^[A-Za-z]{1,3}$/.test(antesDireita)) {
    return {
      hifenRemovido: false,
      regraAplicada: 'b',
      duvida: false,
    };
  }

  // Regra a: Próxima linha começa com letra MAIÚSCULA, número ou "§"
  if (/^[A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9§]/.test(antesDireita)) {
    return {
      hifenRemovido: false,
      regraAplicada: 'a',
      duvida: false,
    };
  }

  const esqLower = antesEsquerda.toLowerCase();
  const dirLower = antesDireita.toLowerCase();
  const composto = `${esqLower}-${dirLower}`;
  const junto = `${esqLower}${dirLower}`;

  // Regra c: Palavra composta ou prefixo na lista de exceções
  if (COMPOSTOS_EXCECOES_SET.has(composto)) {
    return {
      hifenRemovido: false,
      regraAplicada: 'c',
      duvida: true,
    };
  }

  if (PREFIXOS_HIFEN_SET.has(esqLower)) {
    // Se a união sem hífen é comprovadamente uma palavra simples sólida (ex.: "contra"+"to" = "contrato")
    // e não há composto válido, evita quebrar palavras normais.
    if (ehPalavraSolidaConhecida(junto) && !existeCompostoComHifenPtBr(esqLower, dirLower)) {
      return {
        hifenRemovido: true,
        regraAplicada: 'e',
        duvida: false,
      };
    }
    return {
      hifenRemovido: false,
      regraAplicada: 'c',
      duvida: true,
    };
  }

  // Regra d: Verificação no dicionário pt-BR
  const existeSemHifen = existeNoDicionarioPtBr(junto);
  const existeComHifen = existeCompostoComHifenPtBr(esqLower, dirLower);
  if (!existeSemHifen && existeComHifen) {
    return {
      hifenRemovido: false,
      regraAplicada: 'd',
      duvida: true,
    };
  }

  // Regra e: Em dúvida com continuação em minúscula, reunir sem hífen
  return {
    hifenRemovido: true,
    regraAplicada: 'e',
    duvida: !existeSemHifen,
  };
}

/**
 * Reúne palavras separadas por hífen no fim de linha (inclusive entre páginas,
 * após remoção de cabeçalhos/rodapés, e no meio de incisos/alíneas/parágrafos).
 * DEVE ser executado antes de juntar quebras de linha de frase e antes de separar artigos.
 */
export function reunirPalavrasHifenizadas(
  entrada: string | LinhaComOrigem[],
  opcoes?: OpcoesReuniaoHifen
): ResultadoReuniaoHifen {
  const linhasEntrada: LinhaComOrigem[] =
    typeof entrada === 'string'
      ? entrada
          .replace(/\r\n?/g, '\n')
          .split('\n')
          .map((texto, idx) => ({ texto, linhaOriginal: idx + 1 }))
      : entrada.map((l) => ({ ...l }));

  const textoBruto = linhasEntrada.map((l) => l.texto).join('\n');
  const prefsUsuario = opcoes?.preferenciasUsuario ?? carregarPreferenciasHifenMapa();
  const overridesPorId = opcoes?.overridesPorId;

  const resultadoLinhas: LinhaComOrigem[] = [];
  const reunioes: RegistroHifenizacao[] = [];

  let i = 0;
  let seqId = 0;

  while (i < linhasEntrada.length) {
    const itemAtual = linhasEntrada[i];
    // Remove hífens suaves soltos no meio da linha apenas se não estiverem exatamente no fim da linha
    let linhaAtual = itemAtual.texto.replace(/\u00AD(?!\s*$)/g, '');
    const paginaOrigem = itemAtual.pagina;
    const linhaOrigem = itemAtual.linhaOriginal;

    if (!linhaAtual.trim()) {
      resultadoLinhas.push({
        texto: '',
        pagina: paginaOrigem,
        linhaOriginal: linhaOrigem,
      });
      i += 1;
      continue;
    }

    let j = i + 1;
    // Loop para suportar múltiplas quebras hifenizadas encadeadas na mesma sentença
    while (j < linhasEntrada.length) {
      const mFim = linhaAtual.match(REGEX_LINHA_TERMINA_HIFEN);
      if (!mFim) break;

      const prefixoAntesPalavra = mFim[1];
      // Evita tratar duplo traço ("--") como hifenização
      if (prefixoAntesPalavra.endsWith('-')) break;

      const antesEsquerda = mFim[2];
      const hifenChar = mFim[3];

      // Avança linhas vazias (ex.: separador entre páginas após limpar rodapé/cabeçalho)
      let proxIdx = j;
      while (proxIdx < linhasEntrada.length && !linhasEntrada[proxIdx].texto.trim()) {
        proxIdx += 1;
      }
      if (proxIdx >= linhasEntrada.length) break;

      const proxTrim = linhasEntrada[proxIdx].texto.trim().replace(/\u00AD(?!\s*$)/g, '');
      const ehSufixoArtigo =
        /\d+[º°o]?$/i.test(antesEsquerda) && /^[A-Za-z]{1,3}(?:[\.\s,;:)\-–—]|$)/.test(proxTrim);

      if (!ehSufixoArtigo && REGEX_INICIO_ESTRUTURA_BLOQUEIO.test(proxTrim)) {
        break;
      }

      const mCont = proxTrim.match(REGEX_CONTINUACAO_PALAVRA);
      if (!mCont) break;

      const antesDireita = mCont[1];
      const restoProx = mCont[2] || '';

      // Confirma que após prefixo numérico (ex.: "121-") não é continuação estranha como "121-\n9" sem ser letra, exceto regra a
      const idOcorrencia = `hif_${seqId}_${linhaOrigem}`;
      seqId += 1;

      const decisao = decidirHifenizacao(antesEsquerda, antesDireita, {
        idOcorrencia,
        hifenOriginal: hifenChar,
        preferenciasUsuario: prefsUsuario,
        overridesPorId,
      });

      const palavraFinal = decisao.hifenRemovido
        ? `${antesEsquerda}${antesDireita}`
        : `${antesEsquerda}-${antesDireita}`;

      reunioes.push({
        id: idOcorrencia,
        antesEsquerda,
        antesDireita,
        originalComQuebra: `${antesEsquerda}${hifenChar === '\u00AD' ? '-' : hifenChar}|${antesDireita}`,
        palavraFinal,
        hifenRemovido: decisao.hifenRemovido,
        regraAplicada: decisao.regraAplicada,
        duvida: decisao.duvida,
        linha: linhaOrigem,
        pagina: paginaOrigem,
      });

      linhaAtual = `${prefixoAntesPalavra}${palavraFinal}${restoProx}`;
      j = proxIdx + 1;
    }

    resultadoLinhas.push({
      texto: linhaAtual.replace(/\u00AD/g, ''),
      pagina: paginaOrigem,
      linhaOriginal: linhaOrigem,
    });
    i = j;
  }

  return {
    textoTratado: resultadoLinhas.map((l) => l.texto).join('\n'),
    textoBruto,
    linhasTratadas: resultadoLinhas,
    reunioes,
  };
}
