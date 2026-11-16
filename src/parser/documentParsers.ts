import type {
  Artigo,
  BlocoArtigo,
  CodigoDetectado,
  SubtipoMetadados,
  TipoDocumento,
} from '@/src/types/domain';
import {
  type OpcoesReuniaoHifen,
  reunirPalavrasHifenizadas,
} from './hyphenReunifier';
import {
  contarArtigosEstimados,
  detectarCodigosNoTexto,
  gerarIdParser,
  gerarSiglaAutomatica,
  juntarLinhasQuebradasDeFrases,
  normalizarQuebrasDeLinha,
  type OpcoesParseCodigo,
  parseCodigoTexto,
} from './legalParser';

/**
 * Sugere automaticamente o tipo de documento com base no nome do arquivo e conteúdo textual.
 */
export function sugerirTipoDocumento(texto: string, nomeArquivo: string): TipoDocumento {
  const nome = nomeArquivo.toLowerCase();
  const amostra = texto.slice(0, 20000);

  if (/vade[\s_-]?mecum/i.test(nome)) {
    return 'vade_mecum';
  }

  const qtdSumulas = (amostra.match(/^\s*S[ÚU]MULA(?:\s+VINCULANTE)?\s+(?:N[º°o\.]?\s*)?\d+/gim) || []).length;
  const qtdEmentas = (
    amostra.match(/^\s*(?:EMENTA\s*:|AC[ÓO]RD[ÃA]O|INFORMATIVO\s+N[º°o]?|RECURSO\s+ESPECIAL|HABEAS\s+CORPUS|ADI\s+\d+|REsp\s+\d+)/gim) ||
    []
  ).length;
  const qtdArtigos = contarArtigosEstimados(amostra);

  if (/s[úu]mula/i.test(nome) || (qtdSumulas >= 2 && qtdSumulas >= qtdArtigos)) {
    return 'sumula';
  }

  if (
    /jurisprud|informativo|ac[óo]rd[ãa]o|stf|stj|tst/i.test(nome) ||
    (qtdEmentas >= 2 && qtdArtigos < 3)
  ) {
    return 'jurisprudencia';
  }

  if (qtdArtigos >= 3) {
    const codigos = detectarCodigosNoTexto(texto, nomeArquivo);
    if (codigos.length >= 2) {
      return 'vade_mecum';
    }
    return 'lei_codigo';
  }

  if (/doutrina|apostila|resumo|manual|aula|livro|curso/i.test(nome)) {
    return 'doutrina';
  }

  if (qtdEmentas >= 1) return 'jurisprudencia';
  if (qtdSumulas >= 1) return 'sumula';

  return 'doutrina';
}

export function contarUnidadesEstimadasPorTipo(texto: string, tipo: TipoDocumento): number {
  if (tipo === 'vade_mecum' || tipo === 'lei_codigo') {
    return contarArtigosEstimados(texto);
  }
  if (tipo === 'sumula') {
    const m = texto.match(/^\s*S[ÚU]MULA(?:\s+VINCULANTE)?\s+(?:N[º°o\.]?\s*)?\d+/gim);
    return m ? m.length : 1;
  }
  if (tipo === 'jurisprudencia') {
    return parseJurisprudenciaTexto(texto, 'tmp').length;
  }
  return parseDoutrinaTexto(texto, 'tmp').length;
}

/**
 * Gera os segmentos iniciais de revisão conforme o tipo escolhido pelo usuário.
 */
export function detectarSegmentosPorTipo(
  textoBruto: string,
  nomeArquivo: string,
  tipoDocumento: TipoDocumento,
  opcoesHifen?: OpcoesReuniaoHifen
): CodigoDetectado[] {
  if (tipoDocumento === 'vade_mecum') {
    return detectarCodigosNoTexto(textoBruto, nomeArquivo, opcoesHifen);
  }

  const textoPreparado = normalizarQuebrasDeLinha(textoBruto, opcoesHifen);
  const linhas = textoPreparado.replace(/\r\n?/g, '\n').split('\n');
  const nomeLimpo = nomeArquivo.replace(/\.(pdf|docx|txt)$/i, '').trim() || 'Documento Importado';
  const sigla =
    tipoDocumento === 'jurisprudencia'
      ? 'JUR'
      : tipoDocumento === 'sumula'
      ? 'SUM'
      : tipoDocumento === 'doutrina'
      ? 'DOUT'
      : gerarSiglaAutomatica(nomeLimpo);

  return [
    {
      idTemp: gerarIdParser('det', 0),
      nome: nomeLimpo,
      sigla,
      texto: textoPreparado.trim(),
      textoRaw: textoBruto.trim(),
      artigosEstimados: contarUnidadesEstimadasPorTipo(textoPreparado, tipoDocumento),
      linhaInicio: 0,
      linhaFim: Math.max(0, linhas.length - 1),
    },
  ];
}

const REGEX_TRIBUNAL = /\b(STF|STJ|TST|TSE|STM|TRF[-\s]?[1-6]|TRT[-\s]?\d{1,2}|TJ[A-Z]{2})\b/;
const REGEX_PROCESSO =
  /\b((?:REsp|AREsp|AgInt|AgRg|EDcl|HC|RHC|MS|RMS|ADI|ADC|ADPF|ADO|RE|ARE|AI|Rcl|SL|SS|TST-[A-Z]+|RO|RR|AIRR)\s*(?:n[º°o\.]?\s*)?[\d\.]+(?:[-/][\dA-Za-z]+)*)\b/i;

function extrairMetadadosJurisprudencia(trecho: string): SubtipoMetadados {
  const trib = trecho.match(REGEX_TRIBUNAL)?.[1];
  const proc = trecho.match(REGEX_PROCESSO)?.[1]?.replace(/\s+/g, ' ').trim();
  const rel = trecho.match(/(?:Rel(?:ator|atora|\.)\s*:?\s*)([^\n\.]{4,60})/i)?.[1]?.trim();
  const data = trecho.match(/(?:Julgado em|Data do julgamento|j\.)\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i)?.[1];
  return {
    tribunal: trib,
    numeroProcesso: proc,
    relator: rel,
    dataJulgamento: data,
  };
}

/**
 * Parser especializado para arquivos de Jurisprudência e Informativos (STF, STJ, TST, TJs).
 * Separa por decisão/julgado identificando tribunal, processo, ementa e tese.
 */
export function parseJurisprudenciaTexto(texto: string, codigoId: string): Artigo[] {
  const resHifen = reunirPalavrasHifenizadas(texto);
  const textoLimpo = juntarLinhasQuebradasDeFrases(resHifen.textoTratado);
  if (!textoLimpo) return [];

  const linhas = textoLimpo.split('\n');
  const blocosBrutos: string[][] = [];
  let atual: string[] = [];

  const regexInicioDecisao =
    /^(?:[-=]{3,}|DECIS[ÃA]O\s+\d+|JULGADO\s+\d+|INFORMATIVO\s+N[º°o]?\s*\d+|EMENTA\s*:|AC[ÓO]RD[ÃA]O\s*:?|\d+\.\s*(?:STF|STJ|TST|TSE|TRF|TJ[A-Z]{2})\b|(?:STF|STJ|TST|TSE)\s*[-–—·]\s*(?:REsp|AREsp|HC|ADI|ADPF|RE|RMS|Rcl|Tema)\b)/i;

  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i].trim();
    if (!l) {
      if (atual.length > 0) atual.push('');
      continue;
    }

    const ehSeparador = /^[-=_]{4,}$/.test(l);
    if (ehSeparador) {
      if (atual.some((x) => x.trim())) {
        blocosBrutos.push(atual);
        atual = [];
      }
      continue;
    }

    const ehCabecalhoNovo = regexInicioDecisao.test(l);
    // Se já temos conteúdo substancial no bloco atual e começou uma nova EMENTA/decisão
    const temConteudoAnterior = atual.filter((x) => x.trim()).length >= 2;
    const blocoAtualJaTemEmenta = atual.some((x) => /^EMENTA\s*:/i.test(x.trim()));

    if (ehCabecalhoNovo && temConteudoAnterior) {
      // Evita cortar quando "INFORMATIVO Nº..." é seguido imediatamente por "EMENTA:" da mesma decisão
      if (!/^EMENTA\s*:/i.test(l) || blocoAtualJaTemEmenta) {
        blocosBrutos.push(atual);
        atual = [];
      }
    }

    atual.push(l);
  }

  if (atual.some((x) => x.trim())) {
    blocosBrutos.push(atual);
  }

  // Fallback se tudo caiu em um bloco só mas há parágrafos separados por 2+ quebras
  let segmentos = blocosBrutos;
  if (segmentos.length <= 1 && /\n\s*\n/.test(textoLimpo)) {
    const porParagrafos = textoLimpo
      .split(/\n{2,}/)
      .map((p) => p.split('\n'))
      .filter((arr) => arr.some((x) => x.trim()));
    if (porParagrafos.length > 1) {
      segmentos = porParagrafos;
    }
  }

  return segmentos.map((segLinhas, idx) => {
    const textoSegmento = segLinhas.join('\n').trim();
    const meta = extrairMetadadosJurisprudencia(textoSegmento);
    const numero = String(idx + 1);
    const blocos: BlocoArtigo[] = [];

    let rotuloAtual = 'Decisão';
    let tipoAtual: BlocoArtigo['tipo'] = 'caput';
    let acumulador: string[] = [];

    const flushBloco = () => {
      const txt = acumulador.join(' ').replace(/\s+/g, ' ').trim();
      if (!txt) return;
      blocos.push({
        id: gerarIdParser('blk', blocos.length),
        tipo: blocos.length === 0 ? 'caput' : tipoAtual,
        rotulo: rotuloAtual,
        texto: txt,
        nivel: 0,
      });
      acumulador = [];
    };

    for (const raw of segLinhas) {
      const t = raw.trim();
      if (!t) {
        flushBloco();
        continue;
      }

      const matchSecao = t.match(
        /^(EMENTA|TESE(?:\s+FIXADA)?|DESTAQUE|DECIS[ÃA]O|FUNDAMENTA[ÇC][ÃA]O|DISPOSITIVO|VOTO|RELAT[ÓO]RIO)\s*:\s*(.*)$/i
      );
      if (matchSecao) {
        flushBloco();
        rotuloAtual = matchSecao[1].charAt(0).toUpperCase() + matchSecao[1].slice(1).toLowerCase();
        tipoAtual = blocos.length === 0 ? 'caput' : 'paragrafo';
        if (matchSecao[2]?.trim()) {
          acumulador.push(matchSecao[2].trim());
        }
      } else {
        acumulador.push(t);
      }
    }
    flushBloco();

    if (blocos.length === 0) {
      blocos.push({
        id: gerarIdParser('blk', 0),
        tipo: 'caput',
        rotulo: 'Decisão',
        texto: textoSegmento,
        nivel: 0,
      });
    }

    const epigrafe =
      [meta.tribunal, meta.numeroProcesso].filter(Boolean).join(' · ') ||
      segLinhas[0]?.trim().slice(0, 80);

    return {
      id: gerarIdParser('dec', idx),
      codigoId,
      numero,
      numeroSort: idx + 1,
      ordem: idx,
      tipoUnidade: 'decisao',
      subtipoMeta: meta,
      hierarquia: {
        titulo: meta.tribunal ? `Jurisprudência · ${meta.tribunal}` : 'Jurisprudência',
      },
      epigrafe,
      blocos,
      textoIntegral: blocos.map((b) => `${b.rotulo}: ${b.texto}`).join('\n'),
      favorito: false,
      atualizadoEm: Date.now(),
    };
  });
}

/**
 * Parser especializado para Súmulas (STF, STJ, TST, Vinculantes, etc.).
 */
export function parseSumulasTexto(texto: string, codigoId: string): Artigo[] {
  const resHifen = reunirPalavrasHifenizadas(texto);
  const textoLimpo = juntarLinhasQuebradasDeFrases(resHifen.textoTratado);
  if (!textoLimpo) return [];

  const linhas = textoLimpo.split('\n');
  const regexSumula =
    /^\s*(?:(STF|STJ|TST|TSE)\s*[-–—·:]\s*)?(S[ÚU]MULA(?:\s+VINCULANTE)?)\s*(?:N[º°o\.]?\s*)?(\d+(?:-[A-Za-z]+)?)\s*(?:\((STF|STJ|TST|TSE)\))?\s*[:.\-–—]?\s*(.*)$/i;

  const itens: Array<{
    tribunal?: string;
    vinculante: boolean;
    numero: string;
    linhasTexto: string[];
  }> = [];

  let atual: (typeof itens)[number] | null = null;
  let tribunalContexto: string | undefined;

  for (const raw of linhas) {
    const t = raw.trim();
    if (!t) continue;

    // Atualiza contexto de tribunal se houver cabeçalho isolado ("SÚMULAS DO STJ", "STF")
    if (/^S[ÚU]MULAS\s+(?:VINCULANTES\s+)?(?:DO\s+)?(STF|STJ|TST|TSE)\b/i.test(t)) {
      tribunalContexto = t.match(/\b(STF|STJ|TST|TSE)\b/i)?.[1]?.toUpperCase();
      continue;
    }

    const m = t.match(regexSumula);
    if (m) {
      if (atual) itens.push(atual);
      const trib = (m[1] || m[4] || tribunalContexto)?.toUpperCase();
      const vinculante = /VINCULANTE/i.test(m[2]);
      const numero = vinculante ? `SV ${m[3]}` : m[3];
      const resto = m[5]?.trim();
      atual = {
        tribunal: trib,
        vinculante,
        numero,
        linhasTexto: resto ? [resto] : [],
      };
    } else if (atual) {
      atual.linhasTexto.push(t);
    }
  }
  if (atual) itens.push(atual);

  if (itens.length === 0) {
    return parseDoutrinaTexto(textoLimpo, codigoId).map((sec) => ({
      ...sec,
      tipoUnidade: 'sumula',
    }));
  }

  return itens.map((item, idx) => {
    const corpo = item.linhasTexto.join('\n').trim() || `Súmula ${item.numero}`;
    const blocos: BlocoArtigo[] = item.linhasTexto.map((ln, bIdx) => ({
      id: gerarIdParser('blk', bIdx),
      tipo: bIdx === 0 ? 'caput' : 'paragrafo',
      rotulo: bIdx === 0 ? 'Enunciado' : 'Obs.',
      texto: ln,
      nivel: 0,
    }));

    if (blocos.length === 0) {
      blocos.push({
        id: gerarIdParser('blk', 0),
        tipo: 'caput',
        rotulo: 'Enunciado',
        texto: corpo,
        nivel: 0,
      });
    }

    const numMatch = item.numero.match(/(\d+)/);
    const numeroSort = numMatch ? parseInt(numMatch[1], 10) : idx + 1;

    return {
      id: gerarIdParser('sum', idx),
      codigoId,
      numero: item.numero,
      numeroSort,
      ordem: idx,
      tipoUnidade: 'sumula',
      subtipoMeta: {
        tribunal: item.tribunal,
      },
      hierarquia: {
        titulo: item.tribunal
          ? item.vinculante
            ? `Súmulas Vinculantes · ${item.tribunal}`
            : `Súmulas · ${item.tribunal}`
          : item.vinculante
          ? 'Súmulas Vinculantes'
          : 'Súmulas',
      },
      epigrafe: item.tribunal ? `${item.tribunal} · Súmula ${item.numero}` : undefined,
      blocos,
      textoIntegral: corpo,
      favorito: false,
      atualizadoEm: Date.now(),
    };
  });
}

/**
 * Parser para Doutrina, Apostilas, Resumos e Outros Documentos:
 * Separa por capítulos/seções/títulos numerados ou, caso não existam, por páginas/grupos de parágrafos.
 */
export function parseDoutrinaTexto(texto: string, codigoId: string): Artigo[] {
  const resHifen = reunirPalavrasHifenizadas(texto);
  const textoLimpo = resHifen.textoTratado.replace(/\r\n?/g, '\n').trim();
  if (!textoLimpo) return [];

  const linhas = textoLimpo.split('\n');
  const regexTituloSecao =
    /^(?:#{1,3}\s+(.+)|(?:CAP[ÍI]TULO|SE[ÇC][ÃA]O|M[ÓO]DULO|AULA|UNIDADE|TEMA|T[ÓO]PICO)\s+[IVXLCDM\d]+(?:\s*[-–—:]\s*.*)?|(\d+(?:\.\d+)*)\.\s+([A-ZÁÉÍÓÚÂÊÔÃÕÇ][^\n]{3,90}))$/i;

  const secoes: Array<{ titulo: string; paragrafos: string[] }> = [];
  let atual: { titulo: string; paragrafos: string[] } | null = null;
  let paragrafoAtual: string[] = [];

  const flushParagrafo = () => {
    const txt = paragrafoAtual.join(' ').replace(/\s+/g, ' ').trim();
    if (txt) {
      if (!atual) {
        atual = { titulo: 'Introdução', paragrafos: [] };
      }
      atual.paragrafos.push(txt);
    }
    paragrafoAtual = [];
  };

  for (const raw of linhas) {
    const t = raw.trim();
    if (!t) {
      flushParagrafo();
      continue;
    }

    const ehCaixaAltaCurta =
      t.length >= 5 &&
      t.length <= 85 &&
      t === t.toUpperCase() &&
      /[A-ZÁÉÍÓÚÂÊÔÃÕÇ]{3,}/.test(t) &&
      !/[\.;:]$/.test(t);

    if (regexTituloSecao.test(t) || ehCaixaAltaCurta) {
      flushParagrafo();
      if (atual && atual.paragrafos.length > 0) {
        secoes.push(atual);
      }
      atual = {
        titulo: t.replace(/^#{1,3}\s+/, '').trim(),
        paragrafos: [],
      };
      continue;
    }

    paragrafoAtual.push(t);
  }
  flushParagrafo();
  if (atual && atual.paragrafos.length > 0) {
    secoes.push(atual);
  }

  // Se o texto não tinha subtítulos e tudo caiu numa única seção enorme, agrupa a cada ~4 parágrafos
  if (secoes.length === 1 && secoes[0].paragrafos.length > 6) {
    const paras = secoes[0].paragrafos;
    const agrupadas: typeof secoes = [];
    for (let i = 0; i < paras.length; i += 4) {
      const slice = paras.slice(i, i + 4);
      agrupadas.push({
        titulo: `Bloco ${Math.floor(i / 4) + 1}`,
        paragrafos: slice,
      });
    }
    secoes.splice(0, 1, ...agrupadas);
  }

  return secoes.map((sec, idx) => {
    const blocos: BlocoArtigo[] = sec.paragrafos.map((p, bIdx) => ({
      id: gerarIdParser('blk', bIdx),
      tipo: bIdx === 0 ? 'caput' : 'paragrafo',
      rotulo: bIdx === 0 ? 'Texto' : `¶ ${bIdx + 1}`,
      texto: p,
      nivel: 0,
    }));

    return {
      id: gerarIdParser('sec', idx),
      codigoId,
      numero: String(idx + 1),
      numeroSort: idx + 1,
      ordem: idx,
      tipoUnidade: 'secao',
      hierarquia: {
        capitulo: sec.titulo,
      },
      epigrafe: sec.titulo,
      blocos,
      textoIntegral: sec.paragrafos.join('\n\n'),
      favorito: false,
      atualizadoEm: Date.now(),
    };
  });
}

export function parseDocumentoPorTipo(
  texto: string,
  codigoId: string,
  tipo: TipoDocumento,
  opcoes?: OpcoesParseCodigo
): Artigo[] {
  if (tipo === 'jurisprudencia') {
    return parseJurisprudenciaTexto(texto, codigoId);
  }
  if (tipo === 'sumula') {
    return parseSumulasTexto(texto, codigoId);
  }
  if (tipo === 'doutrina' || tipo === 'outro') {
    return parseDoutrinaTexto(texto, codigoId);
  }
  return parseCodigoTexto(texto, codigoId, opcoes);
}
