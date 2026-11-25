import type { Artigo, Codigo, Pasta } from '@/src/types/domain';

/**
 * Normaliza texto para busca insensível a acentos, caixa e múltiplos espaços.
 */
export function normalizarTextoBusca(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extrai e normaliza o identificador numérico/alfanumérico de uma consulta de artigo/súmula/seção.
 * Exemplos:
 * - "Art. 5º" -> "5"
 * - "artigo 121-A" -> "121-a"
 * - "Art. 1.015" -> "1015"
 * - "5o" -> "5"
 * - "Súmula Vinculante 13" -> "sv 13" / "13"
 */
export function extrairNumeroBusca(consulta: string): string {
  let limpa = normalizarTextoBusca(consulta);
  if (!limpa) return '';

  limpa = limpa
    .replace(/^(?:artigos?|arts?\.?)\s*/i, '')
    .replace(/^(?:sumula\s+vinculante|s\.?\s*v\.?)\s*(?:n[º°o\.]*\s*)?/i, 'sv ')
    .replace(/^(?:sumulas?|decis(?:ao|oes)|secao|secoes)\s*(?:n[º°o\.]*\s*)?/i, '')
    .replace(/^§\s*/i, '')
    .trim();

  // Remove marcadores ordinais e pontos de milhar ("1.015" -> "1015", "5º-a" -> "5-a", "5o" -> "5")
  limpa = limpa
    .replace(/(\d)\.(?=\d{3}\b)/g, '$1')
    .replace(/(\d)\s*[º°]/g, '$1')
    .replace(/(\d)o(?=\s*-|$)/g, '$1')
    .replace(/\.+$/g, '')
    .trim();

  return limpa;
}

/**
 * Normaliza o campo `art.numero` para comparação justa com o termo digitado.
 */
export function normalizarNumeroUnidade(numero: string): string {
  return normalizarTextoBusca(numero)
    .replace(/(\d)\.(?=\d{3}\b)/g, '$1')
    .replace(/(\d)\s*[º°]/g, '$1')
    .replace(/(\d)o(?=\s*-|$)/g, '$1')
    .trim();
}

/**
 * Pontua um artigo/unidade jurídica frente à consulta do usuário.
 * Retorna `null` se não houver correspondência; quanto menor o número, mais relevante.
 * 0 = número exato (ex.: "5" para "Art. 5º", "sv 13" para "SV 13")
 * 1 = mesmo número base com sufixo (ex.: "121-A" ao buscar "121")
 * 2 = número começa com o prefixo buscado (ex.: "50" ao buscar "5")
 * 3 = epígrafe ou nº de processo corresponde
 * 4 = texto integral contém a expressão buscada
 */
export function pontuarArtigoParaBusca(art: Artigo, consulta: string): number | null {
  const termoNorm = normalizarTextoBusca(consulta);
  if (!termoNorm) return null;

  const termoNum = extrairNumeroBusca(consulta);
  const numNorm = normalizarNumeroUnidade(art.numero);
  const numSemSv = numNorm.replace(/^sv\s+/i, '').trim();

  const ehConsultaSoArtigo = /^(?:artigos?|arts?\.?)$/i.test(termoNorm);

  if (termoNum && !ehConsultaSoArtigo) {
    if (numNorm === termoNum || numSemSv === termoNum) {
      return 0;
    }
    if (
      numNorm.startsWith(`${termoNum}-`) ||
      numSemSv.startsWith(`${termoNum}-`)
    ) {
      return 1;
    }
    if (numNorm.startsWith(termoNum) || numSemSv.startsWith(termoNum)) {
      return 2;
    }
  }

  const epigrafeNorm = art.epigrafe ? normalizarTextoBusca(art.epigrafe) : '';
  const processoNorm = art.subtipoMeta?.numeroProcesso
    ? normalizarTextoBusca(art.subtipoMeta.numeroProcesso)
    : '';

  if (
    (epigrafeNorm && epigrafeNorm.includes(termoNorm)) ||
    (processoNorm && processoNorm.includes(termoNorm))
  ) {
    return 3;
  }

  const textoNorm = normalizarTextoBusca(art.textoIntegral);
  if (textoNorm.includes(termoNorm)) {
    return 4;
  }

  return null;
}

/**
 * Busca e ranqueia artigos em memória sem truncar resultados exatos antes da ordenação.
 */
export function buscarArtigosRankeados(
  artigos: Artigo[],
  consulta: string,
  opcoes?: { limite?: number; codigoPrioritarioId?: string | null }
): Artigo[] {
  const limite = opcoes?.limite ?? 60;
  const prioritarioId = opcoes?.codigoPrioritarioId ?? null;
  if (!normalizarTextoBusca(consulta)) return [];

  const ranqueados: Array<{ art: Artigo; score: number }> = [];
  for (const art of artigos) {
    const score = pontuarArtigoParaBusca(art, consulta);
    if (score !== null) {
      ranqueados.push({ art, score });
    }
  }

  ranqueados.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    if (prioritarioId) {
      const aPrio = a.art.codigoId === prioritarioId ? 0 : 1;
      const bPrio = b.art.codigoId === prioritarioId ? 0 : 1;
      if (aPrio !== bPrio) return aPrio - bPrio;
    }
    if (a.art.numeroSort !== b.art.numeroSort) {
      return a.art.numeroSort - b.art.numeroSort;
    }
    return a.art.ordem - b.art.ordem;
  });

  return ranqueados.slice(0, limite).map((item) => item.art);
}

/**
 * Retorna um conjunto com o ID da pasta informada e de todas as suas subpastas descendentes.
 * Protege contra ciclos eventuais.
 */
export function obterPastasDescendentes(pastas: Pasta[], pastaId: string): Set<string> {
  const resultado = new Set<string>([pastaId]);
  let adicionou = true;
  while (adicionou) {
    adicionou = false;
    for (const p of pastas) {
      if (p.parentId && resultado.has(p.parentId) && !resultado.has(p.id)) {
        resultado.add(p.id);
        adicionou = true;
      }
    }
  }
  return resultado;
}

/**
 * Verifica se um código/documento corresponde a uma busca pelo nome ou sigla.
 */
export function codigoCorrespondeBusca(codigo: Codigo, consulta: string): boolean {
  const termoNorm = normalizarTextoBusca(consulta);
  if (!termoNorm) return true;
  return (
    normalizarTextoBusca(codigo.nome).includes(termoNorm) ||
    normalizarTextoBusca(codigo.sigla).includes(termoNorm)
  );
}

/**
 * Constrói o caminho legível de pastas até a pasta informada (ex: "Vade Mecum › Código Penal").
 */
export function obterCaminhoPasta(mapaPastas: Map<string, Pasta>, pastaId?: string): string {
  if (!pastaId) return '';
  const nomes: string[] = [];
  const visitados = new Set<string>();
  let cur = mapaPastas.get(pastaId);
  while (cur && !visitados.has(cur.id) && nomes.length < 10) {
    visitados.add(cur.id);
    nomes.unshift(cur.nome);
    cur = cur.parentId ? mapaPastas.get(cur.parentId) : undefined;
  }
  return nomes.join(' › ');
}
