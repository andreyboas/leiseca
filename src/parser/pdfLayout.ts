export interface PdfTextItem {
  x: number;
  y: number;
  w: number;
  str: string;
}

interface Calha {
  inicio: number;
  fim: number;
}

const TOLERANCIA_Y = 3.5;

/** Agrupa itens que estão na mesma altura (mesma linha visual), de cima para baixo. */
function agruparPorY(itens: PdfTextItem[]): PdfTextItem[][] {
  if (itens.length === 0) return [];
  const ordenados = [...itens].sort((a, b) => b.y - a.y || a.x - b.x);
  const grupos: Array<{ yRef: number; itens: PdfTextItem[] }> = [];

  for (const it of ordenados) {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && Math.abs(ultimo.yRef - it.y) <= TOLERANCIA_Y) {
      ultimo.itens.push(it);
    } else {
      grupos.push({ yRef: it.y, itens: [it] });
    }
  }
  return grupos.map((g) => g.itens);
}

function agruparItensEmLinhas(itens: PdfTextItem[]): string[] {
  const linhas: string[] = [];
  for (const grupo of agruparPorY(itens)) {
    const ordenado = [...grupo].sort((a, b) => a.x - b.x);
    let linha = '';
    let fimAnterior = -Infinity;
    for (const it of ordenado) {
      if (
        fimAnterior !== -Infinity &&
        it.x - fimAnterior > 2.2 &&
        !linha.endsWith(' ') &&
        !it.str.startsWith(' ')
      ) {
        linha += ' ';
      }
      linha += it.str;
      fimAnterior = it.x + it.w;
    }
    const limpa = linha.trim();
    if (limpa) linhas.push(limpa);
  }
  return linhas;
}

/** Item que atravessa uma calha (ex.: título de TÍTULO/CAPÍTULO ocupando a largura toda). */
function cruzaCalha(it: PdfTextItem, calhas: Calha[]): boolean {
  return calhas.some((c) => it.x < c.inicio && it.x + it.w > c.fim);
}

/** Índice da coluna (0, 1, 2...) em que o centro do item cai. */
function indiceColuna(it: PdfTextItem, calhas: Calha[]): number {
  const centro = it.x + it.w / 2;
  let idx = 0;
  for (const c of calhas) {
    if (centro > (c.inicio + c.fim) / 2) idx += 1;
  }
  return idx;
}

/** Descarta calhas falsas: cada coluna precisa ter texto e largura suficientes. */
function validarCalhas(itens: PdfTextItem[], calhasIniciais: Calha[], largura: number): Calha[] {
  const calhas = [...calhasIniciais];

  while (calhas.length > 0) {
    const colunas: PdfTextItem[][] = Array.from({ length: calhas.length + 1 }, () => []);
    for (const it of itens) {
      if (!cruzaCalha(it, calhas)) colunas[indiceColuna(it, calhas)].push(it);
    }
    const total = colunas.reduce((soma, c) => soma + c.length, 0);

    let ruim = -1;
    for (let i = 0; i < colunas.length; i++) {
      const c = colunas[i];
      if (c.length === 0) {
        ruim = i;
        break;
      }
      let ini = Infinity;
      let fim = -Infinity;
      for (const it of c) {
        if (it.x < ini) ini = it.x;
        if (it.x + it.w > fim) fim = it.x + it.w;
      }
      if (c.length < 4 || c.length / Math.max(1, total) < 0.08 || fim - ini < largura * 0.15) {
        ruim = i;
        break;
      }
    }
    if (ruim === -1) break;

    if (ruim === 0) {
      calhas.splice(0, 1);
    } else if (ruim === colunas.length - 1) {
      calhas.splice(calhas.length - 1, 1);
    } else {
      const larguraEsq = calhas[ruim - 1].fim - calhas[ruim - 1].inicio;
      const larguraDir = calhas[ruim].fim - calhas[ruim].inicio;
      calhas.splice(larguraEsq <= larguraDir ? ruim - 1 : ruim, 1);
    }
  }
  return calhas;
}

/**
 * Detecta automaticamente as calhas (espaços verticais vazios entre colunas).
 * Funciona para 1, 2, 3 ou 4 colunas, página por página, sem valores fixos em pixels.
 * Uma calha é uma faixa vertical que quase nenhuma linha atravessa (só títulos de largura total).
 */
function detectarCalhas(itens: PdfTextItem[], pageWidth?: number): Calha[] {
  if (itens.length < 12) return [];

  let minX = Infinity;
  let maxX = -Infinity;
  for (const it of itens) {
    if (it.x < minX) minX = it.x;
    if (it.x + it.w > maxX) maxX = it.x + it.w;
  }
  const largura = maxX - minX;
  if (!(largura > 0)) return [];

  const linhas = agruparPorY(itens);
  if (linhas.length < 8) return [];

  const larguraReferencia = pageWidth && pageWidth > 0 ? pageWidth : largura;
  const minGap = Math.max(6, larguraReferencia * 0.012);
  const nBins = Math.ceil(largura) + 1;
  const cobertura = new Array<number>(nBins).fill(0);

  // Para cada linha visual, marca quais posições horizontais têm texto
  for (const linha of linhas) {
    const ordenada = [...linha].sort((a, b) => a.x - b.x);
    const trechos: Array<[number, number]> = [];
    for (const it of ordenada) {
      const ini = it.x;
      const fim = it.x + Math.max(0, it.w);
      const ultimo = trechos[trechos.length - 1];
      if (ultimo && ini - ultimo[1] < minGap) {
        ultimo[1] = Math.max(ultimo[1], fim);
      } else {
        trechos.push([ini, fim]);
      }
    }
    for (const [ini, fim] of trechos) {
      const a = Math.max(0, Math.floor(ini - minX));
      const b = Math.min(nBins - 1, Math.ceil(fim - minX));
      for (let k = a; k <= b; k++) cobertura[k] += 1;
    }
  }

  // Calha = faixa vazia (ou quase) em pelo menos ~88% das linhas
  const tolerancia = Math.max(1, Math.floor(linhas.length * 0.12));
  const inicioBusca = Math.floor(largura * 0.12);
  const fimBusca = Math.min(nBins - 1, Math.ceil(largura * 0.88));

  let calhas: Calha[] = [];
  let k = inicioBusca;
  while (k <= fimBusca) {
    if (cobertura[k] <= tolerancia) {
      let fimRun = k;
      while (fimRun + 1 <= fimBusca && cobertura[fimRun + 1] <= tolerancia) fimRun += 1;
      if (fimRun - k + 1 >= minGap) {
        calhas.push({ inicio: minX + k, fim: minX + fimRun + 1 });
      }
      k = fimRun + 1;
    } else {
      k += 1;
    }
  }

  if (calhas.length > 3) {
    calhas = [...calhas]
      .sort((a, b) => b.fim - b.inicio - (a.fim - a.inicio))
      .slice(0, 3)
      .sort((a, b) => a.inicio - b.inicio);
  }

  return validarCalhas(itens, calhas, largura);
}

/** Separa cabeçalho e rodapé corridos (linha isolada no topo/base, dentro de uma única coluna). */
function separarCabecalhoRodape(
  itens: PdfTextItem[],
  calhas: Calha[]
): { cabecalho: PdfTextItem[]; corpo: PdfTextItem[]; rodape: PdfTextItem[] } {
  const linhas = agruparPorY(itens);
  const semSeparacao = { cabecalho: [] as PdfTextItem[], corpo: itens, rodape: [] as PdfTextItem[] };
  if (linhas.length < 6) return semSeparacao;

  const ys = linhas.map((l) => l[0].y);
  const dif: number[] = [];
  for (let i = 1; i < ys.length; i++) dif.push(ys[i - 1] - ys[i]);
  const mediana = [...dif].sort((a, b) => a - b)[Math.floor(dif.length / 2)] || 0;
  if (mediana <= 0) return semSeparacao;

  const ehLinhaDeUmaColuna = (linha: PdfTextItem[]): boolean => {
    const colunas = new Set<number>();
    for (const it of linha) {
      if (!cruzaCalha(it, calhas)) colunas.add(indiceColuna(it, calhas));
    }
    return colunas.size <= 1;
  };

  let cabecalho: PdfTextItem[] = [];
  let rodape: PdfTextItem[] = [];
  let inicio = 0;
  let fim = linhas.length;

  if (dif[0] > mediana * 2.2 && ehLinhaDeUmaColuna(linhas[0])) {
    cabecalho = linhas[0];
    inicio = 1;
  }
  if (
    fim - 1 > inicio &&
    dif[dif.length - 1] > mediana * 2.2 &&
    ehLinhaDeUmaColuna(linhas[linhas.length - 1])
  ) {
    rodape = linhas[linhas.length - 1];
    fim -= 1;
  }

  return { cabecalho, corpo: linhas.slice(inicio, fim).flat(), rodape };
}

/**
 * Converte itens posicionados de uma página PDF em linhas na ordem correta de leitura.
 * Detecta sozinho 1, 2, 3 ou mais colunas (por página) e lê cada coluna inteira, de cima
 * para baixo, da esquerda para a direita, sem nunca misturar linhas de colunas diferentes.
 * Títulos de largura total dividem a página em faixas: faixa 1 (col 1, 2, 3), título,
 * faixa 2 (col 1, 2, 3) e assim por diante.
 */
export function ordenarItensPdfPorColunas(
  itensBrutos: PdfTextItem[],
  pageWidth?: number
): string[] {
  if (itensBrutos.length === 0) return [];

  const calhas = detectarCalhas(itensBrutos, pageWidth);
  if (calhas.length === 0) return agruparItensEmLinhas(itensBrutos);

  const nColunas = calhas.length + 1;
  const { cabecalho, corpo, rodape } = separarCabecalhoRodape(itensBrutos, calhas);

  const separadores = corpo.filter((it) => cruzaCalha(it, calhas));
  const normais = corpo.filter((it) => !cruzaCalha(it, calhas));

  // Linhas de largura total (de cima para baixo), cada uma separa a página em uma faixa
  const ysSeparadores: number[] = [];
  for (const it of [...separadores].sort((a, b) => b.y - a.y)) {
    const ultimo = ysSeparadores[ysSeparadores.length - 1];
    if (ultimo === undefined || Math.abs(ultimo - it.y) > TOLERANCIA_Y) ysSeparadores.push(it.y);
  }

  const faixas: PdfTextItem[][][] = Array.from({ length: ysSeparadores.length + 1 }, () =>
    Array.from({ length: nColunas }, () => [] as PdfTextItem[])
  );
  for (const it of normais) {
    const faixa = ysSeparadores.filter((y) => y > it.y + TOLERANCIA_Y).length;
    faixas[faixa][indiceColuna(it, calhas)].push(it);
  }

  const gruposSeparadores: PdfTextItem[][] = ysSeparadores.map(() => []);
  for (const it of separadores) {
    const idx = ysSeparadores.findIndex((y) => Math.abs(y - it.y) <= TOLERANCIA_Y);
    if (idx >= 0) gruposSeparadores[idx].push(it);
  }

  const resultado: string[] = [...agruparItensEmLinhas(cabecalho)];
  for (let f = 0; f < faixas.length; f++) {
    for (let c = 0; c < nColunas; c++) {
      resultado.push(...agruparItensEmLinhas(faixas[f][c]));
    }
    if (f < gruposSeparadores.length) {
      resultado.push(...agruparItensEmLinhas(gruposSeparadores[f]));
    }
  }
  resultado.push(...agruparItensEmLinhas(rodape));
  return resultado;
}
