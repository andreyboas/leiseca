import type {
  Artigo,
  BlocoArtigo,
  CodigoDetectado,
  HierarquiaPath,
  RegistroHifenizacao,
} from '@/src/types/domain';
import {
  type LinhaComOrigem,
  type OpcoesReuniaoHifen,
  reunirPalavrasHifenizadas,
} from './hyphenReunifier';

export function gerarIdParser(prefixo: string, indice: number): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefixo}_${crypto.randomUUID()}`;
  }
  return `${prefixo}_${Date.now()}_${indice}_${Math.random().toString(36).slice(2, 8)}`;
}

export function calcularNumeroSort(numeroStr: string): number {
  const limpo = numeroStr.replace(/\./g, '').replace(/[º°o]/gi, '').trim();
  const match = limpo.match(/^(\d+)(?:-([A-Za-z]+))?$/);
  if (!match) return 999999;
  const base = parseInt(match[1], 10);
  if (!match[2]) return base;
  const sufixo = match[2].toUpperCase();
  let decimal = 0;
  for (let i = 0; i < sufixo.length; i++) {
    decimal += (sufixo.charCodeAt(i) - 64) * Math.pow(0.01, i + 1);
  }
  return base + decimal;
}

const REGEX_NUMERO_PAGINA_ISOLADO =
  /^(?:[-–—•·]\s*)?(?:(?:p[áa]g(?:ina)?|fls?)\.?\s*)?\d{1,5}(?:\s*(?:de|\/)\s*\d{1,5})?(?:\s*[-–—•·])?$/i;

function assinaturaCabecalhoSemNumero(linha: string): string {
  return linha
    .replace(/\d+/g, '#')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function ehLinhaJuridicaProtegida(linha: string): boolean {
  return /^(?:Art\.?\s*[\d#]|Par[áa]grafo\s+[úu]nico|§\s*[\d#]|[IVXLCDM]{1,7}\s*[-–—]|[a-z]\)|PARTE|LIVRO|T[ÍI]TULO|CAP[ÍI]TULO|SE[ÇC][ÃA]O|SUBSE[ÇC][ÃA]O)/i.test(
    linha.trim()
  );
}

export interface ResultadoLimpezaPdf {
  textoTratado: string;
  textoPreHifen: string;
  paginasLinhasLimpas: string[][];
  linhasComOrigemPreHifen: LinhaComOrigem[];
  reunioesHifen: RegistroHifenizacao[];
}

/**
 * Remove cabeçalhos, rodapés repetidos e numeração isolada de páginas de PDF,
 * preservando a referência de página/linha de cada linha limpa para reunião de hífens.
 */
export function extrairLinhasLimpasDePaginasPdf(paginas: string[][]): {
  paginasLinhasLimpas: string[][];
  linhasComOrigem: LinhaComOrigem[];
} {
  if (paginas.length === 0) {
    return { paginasLinhasLimpas: [], linhasComOrigem: [] };
  }

  // Passo 1: remove linhas vazias e números de página isolados para expor cabeçalhos/rodapés reais
  const paginasSemNumPag = paginas.map((linhas) =>
    linhas
      .map((l) => l.replace(/\s+/g, ' ').trim())
      .filter((l) => l.length > 0 && !REGEX_NUMERO_PAGINA_ISOLADO.test(l))
  );

  const contagemTopo = new Map<string, number>();
  const contagemRodape = new Map<string, number>();

  for (const naoVazias of paginasSemNumPag) {
    if (naoVazias.length === 0) continue;
    const topo = assinaturaCabecalhoSemNumero(naoVazias[0]);
    const rodape = assinaturaCabecalhoSemNumero(naoVazias[naoVazias.length - 1]);
    if (topo.length < 120 && !ehLinhaJuridicaProtegida(naoVazias[0])) {
      contagemTopo.set(topo, (contagemTopo.get(topo) || 0) + 1);
    }
    if (
      naoVazias.length > 1 &&
      rodape.length < 120 &&
      !ehLinhaJuridicaProtegida(naoVazias[naoVazias.length - 1])
    ) {
      contagemRodape.set(rodape, (contagemRodape.get(rodape) || 0) + 1);
    }
  }

  const limiteRepeticao =
    paginas.length === 2 ? 2 : Math.max(2, Math.floor(paginas.length * 0.3));
  const cabecalhosRepetidos = new Set<string>();
  const rodapesRepetidos = new Set<string>();

  if (paginas.length >= 2) {
    for (const [ass, qtd] of contagemTopo.entries()) {
      if (qtd >= limiteRepeticao) {
        cabecalhosRepetidos.add(ass);
      }
    }
    for (const [ass, qtd] of contagemRodape.entries()) {
      if (qtd >= limiteRepeticao) {
        rodapesRepetidos.add(ass);
      }
    }
  }

  const paginasLinhasLimpas: string[][] = [];
  const linhasComOrigem: LinhaComOrigem[] = [];
  let linhaGlobal = 0;

  for (let pIdx = 0; pIdx < paginasSemNumPag.length; pIdx++) {
    const pagina = paginasSemNumPag[pIdx];
    const filtradas = pagina.filter((l, idx, arr) => {
      const ass = assinaturaCabecalhoSemNumero(l);
      if (idx === 0 && cabecalhosRepetidos.has(ass)) return false;
      if (idx === arr.length - 1 && rodapesRepetidos.has(ass)) return false;
      return true;
    });

    paginasLinhasLimpas.push(filtradas);
    for (const textoLinha of filtradas) {
      linhaGlobal += 1;
      linhasComOrigem.push({
        texto: textoLinha,
        pagina: pIdx + 1,
        linhaOriginal: linhaGlobal,
      });
    }
  }

  return { paginasLinhasLimpas, linhasComOrigem };
}

/**
 * Pipeline completo de limpeza de PDF na ordem correta:
 * 1. Remove cabeçalhos, rodapés e números de página repetidos
 * 2. Reúne palavras hifenizadas (inclusive entre páginas e colunas)
 * 3. Junta quebras de linha no meio de frases
 */
export function limparPaginasPdfDetalhado(
  paginas: string[][],
  opcoesHifen?: OpcoesReuniaoHifen
): ResultadoLimpezaPdf {
  if (paginas.length === 0) {
    return {
      textoTratado: '',
      textoPreHifen: '',
      paginasLinhasLimpas: [],
      linhasComOrigemPreHifen: [],
      reunioesHifen: [],
    };
  }

  const { paginasLinhasLimpas, linhasComOrigem } = extrairLinhasLimpasDePaginasPdf(paginas);
  const textoPreHifen = linhasComOrigem.map((l) => l.texto).join('\n');

  const resHifen = reunirPalavrasHifenizadas(linhasComOrigem, opcoesHifen);
  const textoTratado = juntarLinhasQuebradasDeFrases(resHifen.textoTratado);

  return {
    textoTratado,
    textoPreHifen,
    paginasLinhasLimpas,
    linhasComOrigemPreHifen: linhasComOrigem,
    reunioesHifen: resHifen.reunioes,
  };
}

/**
 * Compatível com chamadas simples: limpa cabeçalhos/rodapés, reúne hífens e normaliza quebras.
 */
export function limparPaginasPdf(paginas: string[][]): string {
  return limparPaginasPdfDetalhado(paginas).textoTratado;
}

const REGEX_INICIO_ESTRUTURA_OU_BLOCO =
  /^(?:PARTE\s+(?:GERAL|ESPECIAL|[IVXLCDM]+|\w+)|LIVRO\s+(?:[IVXLCDM]+|\w+)|T[ÍI]TULO\s+(?:[IVXLCDM]+|\d+)|CAP[ÍI]TULO\s+(?:[IVXLCDM]+|\d+)|SE[ÇC][ÃA]O\s+(?:[IVXLCDM]+|\d+)|SUBSE[ÇC][ÃA]O\s+(?:[IVXLCDM]+|\d+)|Art\.?\s*\d+|Par[áa]grafo\s+[úu]nico|§\s*\d+|[IVXLCDM]{1,7}\s*[-–—]\s+|[a-z]{1,2}\)\s+)/i;

/**
 * Junta quebras de linha no meio de frases em parágrafos contínuos
 * (executado APÓS a reunião de palavras hifenizadas).
 */
export function juntarLinhasQuebradasDeFrases(texto: string): string {
  const linhas = texto.replace(/\r\n?/g, '\n').split('\n');
  const resultado: string[] = [];

  for (let i = 0; i < linhas.length; i++) {
    const atual = linhas[i].trim();
    if (!atual) {
      if (resultado.length > 0 && resultado[resultado.length - 1] !== '') {
        resultado.push('');
      }
      continue;
    }

    if (REGEX_NUMERO_PAGINA_ISOLADO.test(atual)) {
      continue;
    }

    if (resultado.length === 0 || resultado[resultado.length - 1] === '') {
      resultado.push(atual);
      continue;
    }

    const anterior = resultado[resultado.length - 1];

    // Nunca juntar se a linha atual inicia um novo artigo, inciso, parágrafo, alínea ou divisão estrutural
    if (REGEX_INICIO_ESTRUTURA_OU_BLOCO.test(atual)) {
      resultado.push(atual);
      continue;
    }

    // Nunca juntar se a linha anterior for uma divisão estrutural
    if (/^(?:PARTE|LIVRO|T[ÍI]TULO|CAP[ÍI]TULO|SE[ÇC][ÃA]O|SUBSE[ÇC][ÃA]O)\b/i.test(anterior)) {
      resultado.push(atual);
      continue;
    }

    // Se a linha anterior não termina com pontuação conclusiva e a atual continua a frase
    const terminaComPontuacaoForte = /[\.;:!\?\)]$/.test(anterior);
    if (!terminaComPontuacaoForte && /^[a-zà-ú0-9,\(\[]/.test(atual) && anterior.length > 18) {
      resultado[resultado.length - 1] = `${anterior} ${atual}`;
      continue;
    }

    resultado.push(atual);
  }

  return resultado.join('\n').trim();
}

/**
 * Reúne palavras hifenizadas primeiro e depois junta linhas quebradas no meio de frases.
 */
export function normalizarQuebrasDeLinha(
  texto: string,
  opcoesHifen?: OpcoesReuniaoHifen
): string {
  const resHifen = reunirPalavrasHifenizadas(texto, opcoesHifen);
  return juntarLinhasQuebradasDeFrases(resHifen.textoTratado);
}

const REGEX_CABECALHO_SUMARIO =
  /^(?:SUM[ÁA]RIO|[ÍI]NDICE(?:\s+(?:SISTEM[ÁA]TICO|GERAL|REMISSIVO|ALFAB[ÉE]TICO|DA\s+OBRA))?|TABELA\s+DE\s+CONTE[ÚU]DO)\s*:?$/i;

const REGEX_LINHA_DOT_LEADER = /(?:\.{3,}|…{2,}|_{3,})\s*\d{1,5}\s*$/;

/**
 * Identifica se uma linha pertence a um sumário/índice de Vade Mecum
 * (ex.: "Constituição Federal ............. 15" ou "Código Penal — pág. 320").
 */
export function ehLinhaDeSumario(linha: string, dentroDeBlocoSumario = false): boolean {
  const t = linha.trim();
  if (!t) return false;
  if (REGEX_LINHA_DOT_LEADER.test(t)) return true;

  // Padrão "... - pág. 123" ou "... p. 123"
  if (/\b(?:p[áa]g(?:ina)?\.?|p\.)\s*\d{1,5}\s*$/i.test(t) && t.length < 130) {
    return true;
  }

  // Dentro de um bloco explícito de SUMÁRIO / ÍNDICE
  if (dentroDeBlocoSumario) {
    // Se tem verbo/frase de artigo real ("Art. 1º A República Federativa..."), encerrou o sumário
    if (/^\s*Art\.?\s*\d+[º°o]?(?:-[A-Za-z]+)?[\.\s-–—]+.{25,}[\.;:]$/.test(t)) {
      return false;
    }
    // Linha curta terminando com número de página (ex: "Código Civil 412" ou "TÍTULO I - Dos Princípios 28")
    if (/\s+\d{1,5}\s*$/.test(t) && t.length < 130) return true;
    // Subtítulo curto do sumário sem ponto final
    if (
      t.length < 95 &&
      !/[\.;:!\?]$/.test(t) &&
      /^(?:PARTE|LIVRO|T[ÍI]TULO|CAP[ÍI]TULO|SE[ÇC][ÃA]O|SUBSE[ÇC][ÃA]O|CONSTITUI[ÇC][ÃA]O|C[ÓO]DIGO|ESTATUTO|CONSOLIDA[ÇC][ÃA]O|LEI|DECRETO|S[ÚU]MULAS)/i.test(
        t
      )
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Remove linhas de sumário/índice do Vade Mecum para evitar geração de códigos
 * ou artigos falsos a partir das páginas de índice.
 */
export function removerLinhasSumario(textoBruto: string): string {
  const linhas = textoBruto.replace(/\r\n?/g, '\n').split('\n');
  const resultado: string[] = [];
  let dentroDeSumario = false;
  let linhasVaziasSeguidas = 0;

  for (let i = 0; i < linhas.length; i++) {
    const raw = linhas[i];
    const t = raw.trim();

    if (!t) {
      linhasVaziasSeguidas += 1;
      if (!dentroDeSumario) resultado.push('');
      continue;
    }

    if (REGEX_CABECALHO_SUMARIO.test(t)) {
      dentroDeSumario = true;
      linhasVaziasSeguidas = 0;
      continue;
    }

    if (dentroDeSumario) {
      // 1. Se encontrou um artigo completo com prosa real ("Art. 1º A República..."), sai do sumário
      const ehArtigoReal =
        /^\s*Art\.?\s*1[º°o]?[\.\s-–—]+.{20,}/.test(t) && !REGEX_LINHA_DOT_LEADER.test(t);
      if (ehArtigoReal) {
        dentroDeSumario = false;
        resultado.push(raw);
        continue;
      }

      // 2. Se esta linha NÃO tem número de página nem dot-leader, verifica se ela abre o texto real da lei
      const temNumeroPaginaNoFim = REGEX_LINHA_DOT_LEADER.test(t) || /\s+\d{1,5}\s*$/.test(t);
      if (!temNumeroPaginaNoFim) {
        const janelaLinhas = linhas.slice(i + 1, i + 15);
        const idxArtReal = janelaLinhas.findIndex(
          (l) =>
            /^\s*Art\.?\s*1[º°o]?[\.\s-–—]+.{15,}/.test(l.trim()) &&
            !REGEX_LINHA_DOT_LEADER.test(l.trim())
        );
        if (idxArtReal !== -1) {
          const trechoAteArtigo = janelaLinhas.slice(0, idxArtReal);
          const temSumarioNoMeio = trechoAteArtigo.some((l) =>
            REGEX_LINHA_DOT_LEADER.test(l.trim())
          );
          if (!temSumarioNoMeio) {
            dentroDeSumario = false;
            resultado.push(raw);
            continue;
          }
        }
      }

      if (ehLinhaDeSumario(t, true)) {
        linhasVaziasSeguidas = 0;
        continue;
      }

      if (linhasVaziasSeguidas >= 2 && t.length > 60 && /[\.;:]$/.test(t)) {
        dentroDeSumario = false;
        resultado.push(raw);
        continue;
      }

      // Ainda dentro do sumário
      continue;
    }

    // Mesmo fora de um bloco SUMÁRIO explícito, remove entradas soltas com dot-leaders ("Código Civil ....... 210")
    if (ehLinhaDeSumario(t, false)) {
      continue;
    }

    linhasVaziasSeguidas = 0;
    resultado.push(raw);
  }

  return resultado.join('\n').trim();
}

interface PadraoDiploma {
  regex: RegExp;
  nomePadrao: string;
  siglaPadrao: string;
}

const DIPLOMAS_CONHECIDOS: PadraoDiploma[] = [
  {
    regex:
      /^(?:CONSTITUI[ÇC][ÃA]O\s+DA\s+REP[ÚU]BLICA\s+FEDERATIVA\s+DO\s+BRASIL|CONSTITUI[ÇC][ÃA]O\s+FEDERAL(?:\s+DE\s+1988)?)\b/i,
    nomePadrao: 'Constituição Federal de 1988',
    siglaPadrao: 'CF/88',
  },
  {
    regex:
      /^(?:C[ÓO]DIGO\s+PENAL(?:\s+BRASILEIRO)?(?:\s*[-–—:,]|$)|DECRETO-LEI\s+N[º°o]?\s*2\.848\b)/i,
    nomePadrao: 'Código Penal',
    siglaPadrao: 'CP',
  },
  {
    regex:
      /^(?:C[ÓO]DIGO\s+DE\s+PROCESSO\s+PENAL(?:\s*[-–—:,]|$)|DECRETO-LEI\s+N[º°o]?\s*3\.689\b)/i,
    nomePadrao: 'Código de Processo Penal',
    siglaPadrao: 'CPP',
  },
  {
    regex: /^(?:C[ÓO]DIGO\s+CIVIL(?:\s+BRASILEIRO)?(?:\s*[-–—:,]|$)|LEI\s+N[º°o]?\s*10\.406\b)/i,
    nomePadrao: 'Código Civil',
    siglaPadrao: 'CC',
  },
  {
    regex:
      /^(?:C[ÓO]DIGO\s+DE\s+PROCESSO\s+CIVIL(?:\s*[-–—:,]|$)|LEI\s+N[º°o]?\s*13\.105\b)/i,
    nomePadrao: 'Código de Processo Civil',
    siglaPadrao: 'CPC',
  },
  {
    regex:
      /^(?:CONSOLIDA[ÇC][ÃA]O\s+DAS\s+LEIS\s+DO\s+TRABALHO(?:\s*\(CLT\))?(?:\s*[-–—:,]|$)|CLT(?:\s*[-–—:]|$)|DECRETO-LEI\s+N[º°o]?\s*5\.452\b)/i,
    nomePadrao: 'Consolidação das Leis do Trabalho',
    siglaPadrao: 'CLT',
  },
  {
    regex:
      /^(?:C[ÓO]DIGO\s+DE\s+DEFESA\s+DO\s+CONSUMIDOR(?:\s*\(CDC\))?(?:\s*[-–—:,]|$)|LEI\s+N[º°o]?\s*8\.078\b)/i,
    nomePadrao: 'Código de Defesa do Consumidor',
    siglaPadrao: 'CDC',
  },
  {
    regex:
      /^(?:ESTATUTO\s+DA\s+CRIAN[ÇC]A\s+E\s+DO\s+ADOLESCENTE(?:\s*\(ECA\))?(?:\s*[-–—:,]|$)|LEI\s+N[º°o]?\s*8\.069\b)/i,
    nomePadrao: 'Estatuto da Criança e do Adolescente',
    siglaPadrao: 'ECA',
  },
  {
    regex:
      /^(?:C[ÓO]DIGO\s+TRIBUT[ÁA]RIO\s+NACIONAL(?:\s*\(CTN\))?(?:\s*[-–—:,]|$)|LEI\s+N[º°o]?\s*5\.172\b)/i,
    nomePadrao: 'Código Tributário Nacional',
    siglaPadrao: 'CTN',
  },
  {
    regex: /^(?:C[ÓO]DIGO\s+ELEITORAL(?:\s*[-–—:,]|$)|LEI\s+N[º°o]?\s*4\.737\b)/i,
    nomePadrao: 'Código Eleitoral',
    siglaPadrao: 'CE',
  },
  {
    regex:
      /^(?:C[ÓO]DIGO\s+DE\s+TR[ÂA]NSITO\s+BRASILEIRO(?:\s*\(CTB\))?(?:\s*[-–—:,]|$)|LEI\s+N[º°o]?\s*9\.503\b)/i,
    nomePadrao: 'Código de Trânsito Brasileiro',
    siglaPadrao: 'CTB',
  },
  {
    regex: /^(?:LEI\s+N[º°o]?\s*14\.133\b|NOVA\s+LEI\s+DE\s+LICITA[ÇC][ÕO]ES\b)/i,
    nomePadrao: 'Lei de Licitações e Contratos',
    siglaPadrao: 'Lei 14.133',
  },
  {
    regex: /^(?:LEI\s+N[º°o]?\s*8\.429\b|LEI\s+DE\s+IMPROBIDADE\s+ADMINISTRATIVA\b)/i,
    nomePadrao: 'Lei de Improbidade Administrativa',
    siglaPadrao: 'LIA',
  },
  {
    regex: /^(?:LEI\s+DE\s+EXECU[ÇC][ÃA]O\s+PENAL\b|LEI\s+N[º°o]?\s*7\.210\b)/i,
    nomePadrao: 'Lei de Execução Penal',
    siglaPadrao: 'LEP',
  },
  {
    regex: /^(?:ESTATUTO\s+DA\s+ADVOCACIA|LEI\s+N[º°o]?\s*8\.906\b)/i,
    nomePadrao: 'Estatuto da Advocacia e da OAB',
    siglaPadrao: 'EOAB',
  },
];

export function gerarSiglaAutomatica(nome: string): string {
  const palavras = nome
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(
      (p) =>
        p.length > 2 &&
        !['das', 'dos', 'para', 'com', 'sobre', 'lei', 'codigo', 'código'].includes(p.toLowerCase())
    );
  if (palavras.length === 0) return 'LEI';
  if (palavras.length === 1) return palavras[0].slice(0, 6).toUpperCase();
  return palavras
    .slice(0, 4)
    .map((p) => p[0].toUpperCase())
    .join('');
}

export function contarArtigosEstimados(texto: string): number {
  const matches = texto.match(/^\s*Art\.?\s*\d+/gim);
  return matches ? matches.length : 0;
}

function ehLinhaTituloDeDiploma(linha: string): boolean {
  const t = linha.trim();
  if (!t || t.length < 4 || t.length > 130) return false;
  if (t.startsWith('(') || /[;]$/.test(t)) return false;
  if (ehLinhaEstrutural(t)) return false;
  if (/^\s*(?:Art\.?\s*\d+|Par[áa]grafo|§|[IVXLCDM]+\s*[-–—]|[a-z]\))/i.test(t)) return false;
  // Rejeita linhas de texto comum que terminam em ponto final e têm mais de 8 palavras em minúsculas
  const palavras = t.split(/\s+/);
  if (t.endsWith('.') && palavras.length > 8 && t !== t.toUpperCase()) return false;
  // Títulos costumam estar em caixa alta ou começar com substantivo de diploma
  const ehCaixaAlta = t === t.toUpperCase() && /[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/.test(t);
  const comecaComoDiploma =
    /^(?:CONSTITUI[ÇC][ÃA]O|C[ÓO]DIGO|CONSOLIDA[ÇC][ÃA]O|ESTATUTO|LEI|DECRETO|MEDIDA\s+PROVIS[ÓO]RIA|REGIMENTO|EMENDA)/i.test(
      t
    );
  return ehCaixaAlta || comecaComoDiploma;
}

/**
 * Detecta automaticamente diferentes códigos e leis dentro de um mesmo Vade Mecum:
 * - Ignora sumário/índice inicial ou intercalado
 * - Identifica títulos oficiais conhecidos e genéricos (Leis, Decretos-Lei, Estatutos)
 * - Detecta reinício de numeração para Art. 1º após artigos avançados
 */
export function detectarCodigosNoTexto(
  textoBruto: string,
  nomeArquivoFallback = 'Legislação Importada',
  opcoesHifen?: OpcoesReuniaoHifen
): CodigoDetectado[] {
  const textoSemSumario = removerLinhasSumario(textoBruto);
  const textoPreparado = normalizarQuebrasDeLinha(textoSemSumario, opcoesHifen);
  const linhas = textoPreparado.replace(/\r\n?/g, '\n').split('\n');

  const marcadores: Array<{
    linha: number;
    nome: string;
    sigla: string;
  }> = [];

  const adicionarMarcador = (linhaIdx: number, nome: string, sigla: string) => {
    const anterior = marcadores[marcadores.length - 1];
    if (anterior && linhaIdx - anterior.linha <= 5) {
      // Se já havia um marcador logo acima (ex: "CÓDIGO PENAL" e logo abaixo "DECRETO-LEI Nº 2.848"), não duplica
      return;
    }
    marcadores.push({ linha: linhaIdx, nome, sigla });
  };

  let artigosNoBlocoAtual = 0;
  let ultimoNumeroSort = 0;

  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i].trim();
    if (!linha) continue;

    // 1. Checar se é linha de título conhecido (não pode começar com parênteses ou pontuação minúscula)
    if (linha.length <= 150 && !linha.startsWith('(') && !/^[a-zà-ú]/.test(linha)) {
      let achouConhecido = false;
      for (const padrao of DIPLOMAS_CONHECIDOS) {
        if (padrao.regex.test(linha)) {
          // Confirma que não é uma referência isolada dentro de uma frase longa com ponto final
          const pareceFraseComum = linha.length > 90 && /\.\s*$/.test(linha);
          if (!pareceFraseComum) {
            adicionarMarcador(i, padrao.nomePadrao, padrao.siglaPadrao);
            artigosNoBlocoAtual = 0;
            ultimoNumeroSort = 0;
            achouConhecido = true;
            break;
          }
        }
      }
      if (achouConhecido) continue;

      // 2. Padrão genérico de lei, decreto-lei, estatuto ou código em cabeçalho
      const matchGenerico = linha.match(
        /^(LEI\s+(?:COMPLEMENTAR\s+)?N[º°o]?\s*[\d\.]+(?:\s*,\s*DE\s+[\w\s]+DE\s+\d{4})?|DECRETO-LEI\s+N[º°o]?\s*[\d\.]+|DECRETO\s+N[º°o]?\s*[\d\.]+|ESTATUTO\s+D[OA]\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ\s]+|C[ÓO]DIGO\s+D[EO]\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ\s]+)$/i
      );
      if (matchGenerico) {
        const janela = linhas.slice(i + 1, i + 30).join('\n');
        if (/^\s*Art\.?\s*1[º°o]?[\.\s-–—]/m.test(janela)) {
          const nomeLimpo = linha.replace(/\.$/, '').trim();
          const numeroMatch = nomeLimpo.match(/N[º°o]?\s*([\d\.]+)/i);
          adicionarMarcador(
            i,
            nomeLimpo,
            numeroMatch ? `Lei ${numeroMatch[1]}` : gerarSiglaAutomatica(nomeLimpo)
          );
          artigosNoBlocoAtual = 0;
          ultimoNumeroSort = 0;
          continue;
        }
      }
    }

    // 3. Rastrear numeração de artigos para detectar reinício em "Art. 1º"
    const matchArtLinha = linha.match(/^\s*Art\.?\s*(\d+(?:\.\d+)*(?:[º°o]?(?:-[A-Za-z]+)?))/i);
    if (matchArtLinha) {
      const numSort = calcularNumeroSort(matchArtLinha[1]);
      if (
        numSort === 1 &&
        artigosNoBlocoAtual >= 3 &&
        ultimoNumeroSort >= 5
      ) {
        // Reiniciou para Art. 1º! Buscar possível título até 8 linhas não vazias atrás
        let linhaTitulo = i;
        let nomeDetectado = `Diploma Legal ${marcadores.length + 1}`;
        let passos = 0;
        for (let k = i - 1; k >= 0 && passos < 8; k--) {
          const cand = linhas[k].trim();
          if (!cand) continue;
          passos += 1;
          if (ehLinhaTituloDeDiploma(cand)) {
            linhaTitulo = k;
            nomeDetectado = cand.replace(/\.$/, '').trim();
          } else if (/^\s*Art\.?\s*\d+/i.test(cand)) {
            break;
          }
        }

        const anterior = marcadores[marcadores.length - 1];
        if (!anterior || linhaTitulo - anterior.linha > 5) {
          adicionarMarcador(linhaTitulo, nomeDetectado, gerarSiglaAutomatica(nomeDetectado));
          artigosNoBlocoAtual = 0;
          ultimoNumeroSort = 0;
        }
      }

      artigosNoBlocoAtual += 1;
      if (numSort < 999999) {
        ultimoNumeroSort = numSort;
      }
    }
  }

  if (marcadores.length === 0) {
    const nomeLimpo =
      nomeArquivoFallback.replace(/\.(pdf|docx|txt)$/i, '').trim() || 'Código Importado';
    const textoLimpo = textoSemSumario.trim();
    return [
      {
        idTemp: gerarIdParser('det', 0),
        nome: nomeLimpo,
        sigla: gerarSiglaAutomatica(nomeLimpo),
        texto: textoLimpo,
        artigosEstimados: contarArtigosEstimados(textoLimpo),
        linhaInicio: 0,
        linhaFim: Math.max(0, linhas.length - 1),
      },
    ];
  }

  const detectados: CodigoDetectado[] = [];
  for (let m = 0; m < marcadores.length; m++) {
    const atual = marcadores[m];
    const proximoLinha = m + 1 < marcadores.length ? marcadores[m + 1].linha : linhas.length;
    const trecho = linhas.slice(atual.linha, proximoLinha).join('\n').trim();
    const qtd = contarArtigosEstimados(trecho);
    if (qtd === 0 && marcadores.length > 1) {
      continue;
    }
    detectados.push({
      idTemp: gerarIdParser('det', m),
      nome: atual.nome,
      sigla: atual.sigla,
      texto: trecho,
      artigosEstimados: qtd,
      linhaInicio: atual.linha,
      linhaFim: Math.max(atual.linha, proximoLinha - 1),
    });
  }

  if (detectados.length === 0) {
    const nomeLimpo =
      nomeArquivoFallback.replace(/\.(pdf|docx|txt)$/i, '').trim() || 'Código Importado';
    const textoLimpo = textoSemSumario.trim();
    return [
      {
        idTemp: gerarIdParser('det', 0),
        nome: nomeLimpo,
        sigla: gerarSiglaAutomatica(nomeLimpo),
        texto: textoLimpo,
        artigosEstimados: contarArtigosEstimados(textoLimpo),
        linhaInicio: 0,
        linhaFim: Math.max(0, linhas.length - 1),
      },
    ];
  }

  return detectados;
}

export function recalcularSegmentoPorLinhas(
  linhasTotais: string[],
  linhaInicio: number,
  linhaFim: number
): { texto: string; artigosEstimados: number; linhaInicio: number; linhaFim: number } {
  const maxIdx = Math.max(0, linhasTotais.length - 1);
  const ini = Math.max(0, Math.min(maxIdx, linhaInicio));
  const fim = Math.max(ini, Math.min(maxIdx, linhaFim));
  const texto = linhasTotais.slice(ini, fim + 1).join('\n').trim();
  return {
    texto,
    artigosEstimados: contarArtigosEstimados(texto),
    linhaInicio: ini,
    linhaFim: fim,
  };
}

const REGEX_PARTE = /^PARTE\s+(GERAL|ESPECIAL|[IVXLCDM]+|\w+)(?:\s*[-–—:]\s*(.*))?$/i;
const REGEX_LIVRO = /^LIVRO\s+([IVXLCDM]+|\d+|COMPLEMENTAR|ÚNICO)(?:\s*[-–—:]\s*(.*))?$/i;
const REGEX_TITULO = /^T[ÍI]TULO\s+([IVXLCDM]+|\d+|ÚNICO)(?:\s*[-–—:]\s*(.*))?$/i;
const REGEX_CAPITULO = /^CAP[ÍI]TULO\s+([IVXLCDM]+|\d+|ÚNICO)(?:\s*[-–—:]\s*(.*))?$/i;
const REGEX_SECAO = /^SE[ÇC][ÃA]O\s+([IVXLCDM]+|\d+|ÚNICA)(?:\s*[-–—:]\s*(.*))?$/i;
const REGEX_SUBSECAO = /^SUBSE[ÇC][ÃA]O\s+([IVXLCDM]+|\d+|ÚNICA)(?:\s*[-–—:]\s*(.*))?$/i;

const REGEX_ARTIGO =
  /^\s*Art\.?\s*(\d+(?:\.\d+)*(?:[º°o]?(?:-[A-Za-z]+)?))\s*(?:[\.\-–—:]\s*|\s+)(.+)$/i;
const REGEX_ARTIGO_SO_CABECALHO =
  /^\s*Art\.?\s*(\d+(?:\.\d+)*(?:[º°o]?(?:-[A-Za-z]+)?))\s*[\.\-–—:]?\s*$/i;

const REGEX_PARAGRAFO =
  /^\s*(Par[áa]grafo\s+[úu]nico|§\s*\d+[º°o]?(?:-[A-Za-z]+)?)\s*(?:[\.\-–—:]\s*|\s+)?(.*)$/i;

const REGEX_INCISO = /^\s*([IVXLCDM]{1,7})\s*[-–—]\s*(.+)$/;
const REGEX_ALINEA = /^\s*([a-z]{1,2})\)\s*(.+)$/;
const REGEX_ITEM = /^\s*(\d+(?:\.\d+)?)\s*[\.\)]\s+(.+)$/;

function normalizarOrdinalArtigo(numero: string): string {
  // Converte "1o" / "1°" -> "1º" apenas quando imediatamente após dígito no número do artigo
  return numero.replace(/(\d)[o°](?=-|$)/gi, '$1º');
}

function ehLinhaEstrutural(linha: string): boolean {
  return (
    REGEX_PARTE.test(linha) ||
    REGEX_LIVRO.test(linha) ||
    REGEX_TITULO.test(linha) ||
    REGEX_CAPITULO.test(linha) ||
    REGEX_SECAO.test(linha) ||
    REGEX_SUBSECAO.test(linha)
  );
}

function ehPossivelEpigrafe(linha: string, blocoAnteriorTerminouPontuado = true): boolean {
  if (!linha || linha.length > 120) return false;
  if (linha.startsWith('(') || /[;:.]$/.test(linha)) return false;
  // Epígrafe legítima em lei nunca começa com letra minúscula nem pontuação de continuação
  if (!/^[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/.test(linha)) return false;
  if (!blocoAnteriorTerminouPontuado) return false;
  if (ehLinhaEstrutural(linha)) return false;
  if (REGEX_ARTIGO.test(linha) || REGEX_ARTIGO_SO_CABECALHO.test(linha)) return false;
  if (REGEX_PARAGRAFO.test(linha) || REGEX_INCISO.test(linha) || REGEX_ALINEA.test(linha)) {
    return false;
  }
  if (linha.split(/\s+/).length > 12) return false;
  return true;
}

export interface OpcoesParseCodigo {
  rawTextOriginal?: string;
  reunioesExternas?: RegistroHifenizacao[];
  opcoesHifen?: OpcoesReuniaoHifen;
}

function extrairTrechoBrutoPorArtigo(
  textoBruto: string,
  numeroArtigo: string,
  cursorInicial: number
): { rawText: string; proximoCursor: number } | null {
  const numEscapado = numeroArtigo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regexInicio = new RegExp(`^\\s*Art\\.?\\s*${numEscapado}(?:[\\.\\-–—:\\s]|$)`, 'im');
  const fatia = textoBruto.slice(cursorInicial);
  const matchInicio = fatia.match(regexInicio);
  if (!matchInicio || matchInicio.index === undefined) return null;

  const posAbsInicio = cursorInicial + matchInicio.index;
  const aposInicio = textoBruto.slice(posAbsInicio + matchInicio[0].length);
  const matchProximo = aposInicio.match(
    /\n\s*(?:Art\.?\s*\d+|PARTE\s+(?:GERAL|ESPECIAL|[IVXLCDM]+)|LIVRO\s+|T[ÍI]TULO\s+|CAP[ÍI]TULO\s+|SE[ÇC][ÃA]O\s+|SUBSE[ÇC][ÃA]O\s+)/i
  );
  const posAbsFim =
    matchProximo && matchProximo.index !== undefined
      ? posAbsInicio + matchInicio[0].length + matchProximo.index
      : textoBruto.length;

  return {
    rawText: textoBruto.slice(posAbsInicio, posAbsFim).trim(),
    proximoCursor: posAbsFim,
  };
}

/**
 * Faz o parse completo de um código/lei mantendo 100% do texto legal original,
 * reunindo palavras hifenizadas antes da separação de artigos e guardando
 * `rawText`, `text` e `reunioesHifen` por artigo.
 */
export function parseCodigoTexto(
  texto: string,
  codigoId: string,
  opcoes?: OpcoesParseCodigo
): Artigo[] {
  const textoSemSumario = removerLinhasSumario(texto);
  const resHifen = reunirPalavrasHifenizadas(textoSemSumario, opcoes?.opcoesHifen);
  const textoNormalizado = juntarLinhasQuebradasDeFrases(resHifen.textoTratado);
  const rawBase = opcoes?.rawTextOriginal || resHifen.textoBruto;
  const reunioesFonte =
    resHifen.reunioes.length > 0 ? resHifen.reunioes : opcoes?.reunioesExternas || [];

  const linhas = textoNormalizado.replace(/\r\n?/g, '\n').split('\n');
  const hierarquiaAtual: HierarquiaPath = {};
  const artigos: Artigo[] = [];

  let artigoEmConstrucao: {
    numero: string;
    hierarquia: HierarquiaPath;
    epigrafe?: string;
    blocos: BlocoArtigo[];
  } | null = null;

  let ultimaLinhaPendenteEpigrafe: string | undefined;
  let dentroDeAlineaOuInciso = false;
  let cursorRaw = 0;

  const finalizarArtigoAtual = () => {
    if (!artigoEmConstrucao) return;
    if (artigoEmConstrucao.blocos.length === 0) {
      artigoEmConstrucao = null;
      return;
    }
    const ordem = artigos.length;
    const textoIntegral = artigoEmConstrucao.blocos
      .map((b) => (b.tipo === 'caput' ? b.texto : `${b.rotulo} ${b.texto}`))
      .join('\n');

    const matchRaw = extrairTrechoBrutoPorArtigo(
      rawBase,
      artigoEmConstrucao.numero,
      cursorRaw
    );
    if (matchRaw) {
      cursorRaw = matchRaw.proximoCursor;
    }
    const rawTextArtigo = matchRaw?.rawText || textoIntegral;

    const reunioesDoArtigo = reunioesFonte.filter((r) => {
      const noTexto = textoIntegral.includes(r.palavraFinal);
      const noRaw =
        rawTextArtigo.includes(r.antesEsquerda) && rawTextArtigo.includes(r.antesDireita);
      return noTexto && noRaw;
    });

    artigos.push({
      id: gerarIdParser('art', ordem),
      codigoId,
      numero: artigoEmConstrucao.numero,
      numeroSort: calcularNumeroSort(artigoEmConstrucao.numero),
      ordem,
      tipoUnidade: 'artigo',
      hierarquia: { ...artigoEmConstrucao.hierarquia },
      epigrafe: artigoEmConstrucao.epigrafe,
      blocos: artigoEmConstrucao.blocos,
      textoIntegral,
      rawText: rawTextArtigo,
      text: textoIntegral,
      reunioesHifen: reunioesDoArtigo,
      favorito: false,
      atualizadoEm: Date.now(),
    });
    artigoEmConstrucao = null;
    dentroDeAlineaOuInciso = false;
  };

  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i].trim();
    if (!linha) continue;

    // 1. Verificar marcadores hierárquicos (Parte, Livro, Título, Capítulo, Seção, Subseção)
    const lerTituloCombinado = (base: string): string => {
      const prox = i + 1 < linhas.length ? linhas[i + 1].trim() : '';
      if (
        prox &&
        prox.length < 130 &&
        !ehLinhaEstrutural(prox) &&
        !REGEX_ARTIGO.test(prox) &&
        !REGEX_ARTIGO_SO_CABECALHO.test(prox) &&
        !REGEX_PARAGRAFO.test(prox) &&
        !REGEX_INCISO.test(prox) &&
        !/^Art\./i.test(prox)
      ) {
        i += 1;
        return `${base} — ${prox}`;
      }
      return base;
    };

    if (REGEX_PARTE.test(linha)) {
      finalizarArtigoAtual();
      ultimaLinhaPendenteEpigrafe = undefined;
      const m = linha.match(REGEX_PARTE)!;
      hierarquiaAtual.parte = m[2] ? linha : lerTituloCombinado(linha);
      delete hierarquiaAtual.livro;
      delete hierarquiaAtual.titulo;
      delete hierarquiaAtual.capitulo;
      delete hierarquiaAtual.secao;
      delete hierarquiaAtual.subsecao;
      continue;
    }

    if (REGEX_LIVRO.test(linha)) {
      finalizarArtigoAtual();
      ultimaLinhaPendenteEpigrafe = undefined;
      const m = linha.match(REGEX_LIVRO)!;
      hierarquiaAtual.livro = m[2] ? linha : lerTituloCombinado(linha);
      delete hierarquiaAtual.titulo;
      delete hierarquiaAtual.capitulo;
      delete hierarquiaAtual.secao;
      delete hierarquiaAtual.subsecao;
      continue;
    }

    if (REGEX_TITULO.test(linha)) {
      finalizarArtigoAtual();
      ultimaLinhaPendenteEpigrafe = undefined;
      const m = linha.match(REGEX_TITULO)!;
      hierarquiaAtual.titulo = m[2] ? linha : lerTituloCombinado(linha);
      delete hierarquiaAtual.capitulo;
      delete hierarquiaAtual.secao;
      delete hierarquiaAtual.subsecao;
      continue;
    }

    if (REGEX_CAPITULO.test(linha)) {
      finalizarArtigoAtual();
      ultimaLinhaPendenteEpigrafe = undefined;
      const m = linha.match(REGEX_CAPITULO)!;
      hierarquiaAtual.capitulo = m[2] ? linha : lerTituloCombinado(linha);
      delete hierarquiaAtual.secao;
      delete hierarquiaAtual.subsecao;
      continue;
    }

    if (REGEX_SECAO.test(linha)) {
      finalizarArtigoAtual();
      ultimaLinhaPendenteEpigrafe = undefined;
      const m = linha.match(REGEX_SECAO)!;
      hierarquiaAtual.secao = m[2] ? linha : lerTituloCombinado(linha);
      delete hierarquiaAtual.subsecao;
      continue;
    }

    if (REGEX_SUBSECAO.test(linha)) {
      finalizarArtigoAtual();
      ultimaLinhaPendenteEpigrafe = undefined;
      const m = linha.match(REGEX_SUBSECAO)!;
      hierarquiaAtual.subsecao = m[2] ? linha : lerTituloCombinado(linha);
      continue;
    }

    // 2. Verificar início de novo Artigo
    const matchArt = linha.match(REGEX_ARTIGO);
    const matchArtSo = !matchArt ? linha.match(REGEX_ARTIGO_SO_CABECALHO) : null;

    if (matchArt || matchArtSo) {
      finalizarArtigoAtual();
      const numeroBruto = (matchArt ? matchArt[1] : matchArtSo![1]).trim();
      const numero = normalizarOrdinalArtigo(numeroBruto);
      const textoCaput = matchArt ? matchArt[2].trim() : '';

      artigoEmConstrucao = {
        numero,
        hierarquia: { ...hierarquiaAtual },
        epigrafe: ultimaLinhaPendenteEpigrafe,
        blocos: [],
      };
      ultimaLinhaPendenteEpigrafe = undefined;

      if (textoCaput) {
        artigoEmConstrucao.blocos.push({
          id: gerarIdParser('blk', 0),
          tipo: 'caput',
          rotulo: `Art. ${numero}`,
          texto: textoCaput,
          nivel: 0,
        });
      }
      continue;
    }

    // 3. Se não estamos dentro de um artigo, verificar se é possível epígrafe do próximo artigo
    if (!artigoEmConstrucao) {
      if (ehPossivelEpigrafe(linha)) {
        ultimaLinhaPendenteEpigrafe = linha;
      } else {
        ultimaLinhaPendenteEpigrafe = undefined;
      }
      continue;
    }

    // 4. Dentro de um artigo: checar se a próxima linha é um Artigo e esta linha é uma epígrafe
    const proxLinha = i + 1 < linhas.length ? linhas[i + 1].trim() : '';
    const ultimoBlocoAtual =
      artigoEmConstrucao.blocos[artigoEmConstrucao.blocos.length - 1];
    const ultimoBlocoPontuado =
      !ultimoBlocoAtual || /[\.;:!\?\)]$/.test(ultimoBlocoAtual.texto.trim());
    if (
      (REGEX_ARTIGO.test(proxLinha) || REGEX_ARTIGO_SO_CABECALHO.test(proxLinha)) &&
      ehPossivelEpigrafe(linha, ultimoBlocoPontuado)
    ) {
      ultimaLinhaPendenteEpigrafe = linha;
      continue;
    }

    // 5. Classificar blocos internos do artigo: Parágrafo, Inciso, Alínea, Item
    const matchPar = linha.match(REGEX_PARAGRAFO);
    if (matchPar) {
      const rotuloBruto = normalizarOrdinalArtigo(matchPar[1].replace(/\.$/, '').trim());
      const textoPar = matchPar[2].trim();
      artigoEmConstrucao.blocos.push({
        id: gerarIdParser('blk', artigoEmConstrucao.blocos.length),
        tipo: 'paragrafo',
        rotulo: rotuloBruto,
        texto: textoPar,
        nivel: 0,
      });
      dentroDeAlineaOuInciso = false;
      continue;
    }

    const matchInc = linha.match(REGEX_INCISO);
    if (matchInc) {
      artigoEmConstrucao.blocos.push({
        id: gerarIdParser('blk', artigoEmConstrucao.blocos.length),
        tipo: 'inciso',
        rotulo: `${matchInc[1]} –`,
        texto: matchInc[2].trim(),
        nivel: 1,
      });
      dentroDeAlineaOuInciso = true;
      continue;
    }

    const matchAli = linha.match(REGEX_ALINEA);
    if (matchAli) {
      artigoEmConstrucao.blocos.push({
        id: gerarIdParser('blk', artigoEmConstrucao.blocos.length),
        tipo: 'alinea',
        rotulo: `${matchAli[1]})`,
        texto: matchAli[2].trim(),
        nivel: 2,
      });
      dentroDeAlineaOuInciso = true;
      continue;
    }

    const matchItem = dentroDeAlineaOuInciso ? linha.match(REGEX_ITEM) : null;
    if (matchItem) {
      artigoEmConstrucao.blocos.push({
        id: gerarIdParser('blk', artigoEmConstrucao.blocos.length),
        tipo: 'item',
        rotulo: `${matchItem[1]}.`,
        texto: matchItem[2].trim(),
        nivel: 3,
      });
      continue;
    }

    // 6. Continuação de linha do último bloco
    if (artigoEmConstrucao.blocos.length === 0) {
      artigoEmConstrucao.blocos.push({
        id: gerarIdParser('blk', 0),
        tipo: 'caput',
        rotulo: `Art. ${artigoEmConstrucao.numero}`,
        texto: linha,
        nivel: 0,
      });
    } else {
      const ultimoBloco = artigoEmConstrucao.blocos[artigoEmConstrucao.blocos.length - 1];
      ultimoBloco.texto = ultimoBloco.texto ? `${ultimoBloco.texto} ${linha}` : linha;
    }
  }

  finalizarArtigoAtual();
  return artigos;
}

export interface SegmentoRemissao {
  texto: string;
  ehRemissao: boolean;
}

const REGEX_REMISSAO_LEGISLATIVA =
  /(\((?:Revogad[oa]|Vetad[oa]|Reda[çc][ãa]o\s+dada|Inclu[íi]d[oa]|Acresc[ie]d[oa]|Vide|Vig[êe]ncia|Regulamento|NR|Suprimid[oa]|Alterad[oa]|Produ[çc][ãa]o\s+de\s+efeito)[^)]*\))/gi;

/**
 * Divide um texto legal em partes principais e remissões legislativas discretas,
 * sem modificar nenhum caractere do texto original.
 */
export function dividirTextoComRemissoes(texto: string): SegmentoRemissao[] {
  const segmentos: SegmentoRemissao[] = [];
  let ultimoIndice = 0;

  for (const match of texto.matchAll(REGEX_REMISSAO_LEGISLATIVA)) {
    const idx = match.index ?? 0;
    if (idx > ultimoIndice) {
      segmentos.push({
        texto: texto.slice(ultimoIndice, idx),
        ehRemissao: false,
      });
    }
    segmentos.push({
      texto: match[0],
      ehRemissao: true,
    });
    ultimoIndice = idx + match[0].length;
  }

  if (ultimoIndice < texto.length) {
    segmentos.push({
      texto: texto.slice(ultimoIndice),
      ehRemissao: false,
    });
  }

  return segmentos.length > 0 ? segmentos : [{ texto, ehRemissao: false }];
}

export function formatarHierarquiaResumo(h: HierarquiaPath): string {
  const partes = [h.parte, h.livro, h.titulo, h.capitulo, h.secao, h.subsecao].filter(Boolean);
  return partes.join(' › ');
}
