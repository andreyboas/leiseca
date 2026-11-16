export interface PdfTextItem {
  x: number;
  y: number;
  w: number;
  str: string;
}

function agruparItensEmLinhas(itens: PdfTextItem[]): string[] {
  if (itens.length === 0) return [];
  const ordenados = [...itens].sort((a, b) => b.y - a.y || a.x - b.x);
  const gruposLinha: Array<{ yRef: number; itens: PdfTextItem[] }> = [];

  for (const it of ordenados) {
    const ultimoGrupo = gruposLinha[gruposLinha.length - 1];
    if (ultimoGrupo && Math.abs(ultimoGrupo.yRef - it.y) <= 3.5) {
      ultimoGrupo.itens.push(it);
    } else {
      gruposLinha.push({ yRef: it.y, itens: [it] });
    }
  }

  const linhas: string[] = [];
  for (const grupo of gruposLinha) {
    grupo.itens.sort((a, b) => a.x - b.x);
    let linha = '';
    let fimAnterior = -Infinity;
    for (const it of grupo.itens) {
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
    if (limpa) {
      linhas.push(limpa);
    }
  }

  return linhas;
}

/**
 * Converte itens posicionados de uma página PDF em linhas na ordem correta de leitura,
 * detectando automaticamente layouts em 2 colunas (comuns em Vade Mecum impresso)
 * para não misturar texto da coluna esquerda e direita na mesma linha.
 */
export function ordenarItensPdfPorColunas(
  itensBrutos: PdfTextItem[],
  pageWidth?: number
): string[] {
  if (itensBrutos.length === 0) return [];

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const it of itensBrutos) {
    if (it.x < minX) minX = it.x;
    if (it.x + it.w > maxX) maxX = it.x + it.w;
    if (it.y < minY) minY = it.y;
    if (it.y > maxY) maxY = it.y;
  }

  const larguraEstimada = pageWidth && pageWidth > 0 ? pageWidth : maxX + minX;
  const midX = larguraEstimada / 2;
  const margemCentro = Math.max(8, larguraEstimada * 0.015);
  const altura = Math.max(1, maxY - minY);
  const yTopoCorpo = maxY - altura * 0.08;
  const yBaseCorpo = minY + altura * 0.08;

  // Analisa apenas a região do corpo da página para evitar que cabeçalho/rodapé centralizado mascarem 2 colunas
  const itensCorpo = itensBrutos.filter((it) => it.y <= yTopoCorpo && it.y >= yBaseCorpo);
  if (itensCorpo.length >= 10) {
    let esqCount = 0;
    let dirCount = 0;
    let cruzandoCount = 0;

    // Agrupa por Y aproximado para checar linhas com elementos nos dois lados separados pelo meio
    const bandasY = new Map<number, { temEsq: boolean; temDir: boolean }>();

    for (const it of itensCorpo) {
      const bucket = Math.round(it.y / 6);
      const registro = bandasY.get(bucket) || { temEsq: false, temDir: false };
      const fimX = it.x + it.w;

      if (fimX <= midX - margemCentro) {
        esqCount += 1;
        registro.temEsq = true;
      } else if (it.x >= midX + margemCentro) {
        dirCount += 1;
        registro.temDir = true;
      } else if (it.x < midX - margemCentro && fimX > midX + margemCentro) {
        cruzandoCount += 1;
      }
      bandasY.set(bucket, registro);
    }

    let bandasDuplas = 0;
    for (const r of bandasY.values()) {
      if (r.temEsq && r.temDir) bandasDuplas += 1;
    }

    const proporcaoCruzando = cruzandoCount / Math.max(1, itensCorpo.length);
    const ehDuasColunas =
      esqCount >= 4 && dirCount >= 4 && bandasDuplas >= 3 && proporcaoCruzando <= 0.15;

    if (ehDuasColunas) {
      const cabecalhoItens: PdfTextItem[] = [];
      const rodapeItens: PdfTextItem[] = [];
      const colEsquerda: PdfTextItem[] = [];
      const colDireita: PdfTextItem[] = [];

      for (const it of itensBrutos) {
        const centroItem = it.x + it.w / 2;
        const cruzaCentro = it.x < midX - margemCentro && it.x + it.w > midX + margemCentro;

        if (it.y > yTopoCorpo && (cruzaCentro || Math.abs(centroItem - midX) < margemCentro * 2)) {
          cabecalhoItens.push(it);
        } else if (
          it.y < yBaseCorpo &&
          (cruzaCentro || Math.abs(centroItem - midX) < margemCentro * 2)
        ) {
          rodapeItens.push(it);
        } else if (centroItem < midX) {
          colEsquerda.push(it);
        } else {
          colDireita.push(it);
        }
      }

      return [
        ...agruparItensEmLinhas(cabecalhoItens),
        ...agruparItensEmLinhas(colEsquerda),
        ...agruparItensEmLinhas(colDireita),
        ...agruparItensEmLinhas(rodapeItens),
      ];
    }
  }

  return agruparItensEmLinhas(itensBrutos);
}
