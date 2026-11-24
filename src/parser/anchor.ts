import type { Anotacao, BlocoArtigo, Grifo } from '@/src/types/domain';

export interface SegmentoRenderizado {
  inicio: number;
  fim: number;
  texto: string;
  grifos: Grifo[];
}

/**
 * Divide o texto de um bloco em segmentos atômicos sem quebrar o DOM,
 * suportando múltiplos grifos sobrepostos e trocas de cor limpas.
 */
export function segmentarTextoComGrifos(
  texto: string,
  grifosDoBloco: Grifo[]
): SegmentoRenderizado[] {
  if (!texto) return [];
  if (grifosDoBloco.length === 0) {
    return [{ inicio: 0, fim: texto.length, texto, grifos: [] }];
  }

  const pontos = new Set<number>([0, texto.length]);
  const grifosValidos: Grifo[] = [];

  for (const g of grifosDoBloco) {
    const ini = Math.max(0, Math.min(texto.length, g.inicio));
    const fim = Math.max(0, Math.min(texto.length, g.fim));
    if (fim > ini) {
      pontos.add(ini);
      pontos.add(fim);
      grifosValidos.push({ ...g, inicio: ini, fim });
    }
  }

  const ordenados = Array.from(pontos).sort((a, b) => a - b);
  const segmentos: SegmentoRenderizado[] = [];

  for (let i = 0; i < ordenados.length - 1; i++) {
    const ini = ordenados[i];
    const fim = ordenados[i + 1];
    if (fim <= ini) continue;
    const ativos = grifosValidos
      .filter((g) => g.inicio <= ini && g.fim >= fim)
      .sort((a, b) => a.criadoEm - b.criadoEm);

    segmentos.push({
      inicio: ini,
      fim,
      texto: texto.slice(ini, fim),
      grifos: ativos,
    });
  }

  return segmentos;
}

/**
 * Re-ancora grifos após edição manual ou reprocessamento de um bloco de artigo,
 * buscando primeiro por offset exato e depois por contexto + trecho.
 */
export function reancorarGrifosNoBloco(
  bloco: BlocoArtigo,
  grifos: Grifo[]
): Grifo[] {
  const texto = bloco.texto;
  return grifos.map((g) => {
    if (g.blocoId !== bloco.id) return g;

    const atualNoOffset = texto.slice(g.inicio, g.fim);
    if (atualNoOffset === g.trecho) {
      return g;
    }

    // Tenta buscar com contexto antes e depois
    const padraoCompleto = `${g.contextoAntes}${g.trecho}${g.contextoDepois}`;
    if (padraoCompleto) {
      const idxCompleto = texto.indexOf(padraoCompleto);
      if (idxCompleto !== -1) {
        const novoIni = idxCompleto + g.contextoAntes.length;
        const novoFim = novoIni + g.trecho.length;
        return { ...g, inicio: novoIni, fim: novoFim, atualizadoEm: Date.now() };
      }
    }

    // Fallback: busca o trecho literal mais próximo do offset original
    let melhorIdx = -1;
    let menorDistancia = Infinity;
    let pos = texto.indexOf(g.trecho);
    while (pos !== -1) {
      const dist = Math.abs(pos - g.inicio);
      if (dist < menorDistancia) {
        menorDistancia = dist;
        melhorIdx = pos;
      }
      pos = texto.indexOf(g.trecho, pos + 1);
    }

    if (melhorIdx !== -1) {
      return {
        ...g,
        inicio: melhorIdx,
        fim: melhorIdx + g.trecho.length,
        contextoAntes: texto.slice(Math.max(0, melhorIdx - 24), melhorIdx),
        contextoDepois: texto.slice(
          melhorIdx + g.trecho.length,
          melhorIdx + g.trecho.length + 24
        ),
        atualizadoEm: Date.now(),
      };
    }

    return g;
  });
}

export interface GrifoNaoReancorado {
  grifoId: string;
  artigoNumero: string;
  trecho: string;
}

export interface ResultadoReancoragemCodigo {
  grifosAtualizados: Grifo[];
  anotacoesAtualizadas: Anotacao[];
  mapaArtigoIdAntigoParaNovo: Map<string, string>;
  grifosReancoradosCount: number;
  grifosNaoReancorados: GrifoNaoReancorado[];
}

function normalizarNumeroArtigoBusca(numero: string): string {
  return numero
    .trim()
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/[°o](?=-|$)/g, 'º');
}

function gerarVariantesTrecho(trecho: string): string[] {
  const variantes = new Set<string>();
  const limpo = trecho.trim();
  if (limpo) variantes.add(limpo);
  // Tenta normalizar hifens quebrados que existiam no texto antigo ("inde- pendentes" -> "independentes")
  const semHifenQuebrado = limpo.replace(
    /([\p{L}\p{N}º°])[-\u2010\u2011\u2013\u2212\u00AD]\s+([\p{L}])/gu,
    '$1$2'
  );
  if (semHifenQuebrado) variantes.add(semHifenQuebrado);
  // Tenta colapsar espaços múltiplos
  const espacosNorm = semHifenQuebrado.replace(/\s+/g, ' ');
  if (espacosNorm) variantes.add(espacosNorm);
  return Array.from(variantes);
}

/**
 * Re-ancora grifos e anotações quando um documento já importado é reprocessado.
 * Busca primeiro pelo número do artigo (preservando ordem em duplicatas) e depois
 * pelo trecho exato ou normalizado nos blocos do novo artigo.
 * Nunca apaga um grifo que não pôde ser re-ancorado — lista-o para avisar o usuário.
 */
export function reancorarGrifosEAnotacoesReprocessamento(params: {
  artigosAntigos: import('@/src/types/domain').Artigo[];
  artigosNovos: import('@/src/types/domain').Artigo[];
  grifos: Grifo[];
  anotacoes: import('@/src/types/domain').Anotacao[];
}): ResultadoReancoragemCodigo {
  const { artigosAntigos, artigosNovos, grifos, anotacoes } = params;
  const mapaAntigoPorId = new Map(artigosAntigos.map((a) => [a.id, a]));
  const mapaArtigoIdAntigoParaNovo = new Map<string, string>();

  // Agrupa novos artigos por número normalizado mantendo ordem de ocorrência
  const novosPorNumero = new Map<string, import('@/src/types/domain').Artigo[]>();
  for (const novo of artigosNovos) {
    const chave = normalizarNumeroArtigoBusca(novo.numero);
    const lista = novosPorNumero.get(chave) || [];
    lista.push(novo);
    novosPorNumero.set(chave, lista);
  }

  const contagemPorNumero = new Map<string, number>();
  for (const antigo of artigosAntigos) {
    const chave = normalizarNumeroArtigoBusca(antigo.numero);
    const idxOcorrencia = contagemPorNumero.get(chave) || 0;
    contagemPorNumero.set(chave, idxOcorrencia + 1);
    const candidatos = novosPorNumero.get(chave) || [];
    const correspondente = candidatos[idxOcorrencia] || candidatos[0];
    if (correspondente) {
      mapaArtigoIdAntigoParaNovo.set(antigo.id, correspondente.id);
    }
  }

  const mapaNovoPorId = new Map(artigosNovos.map((a) => [a.id, a]));
  const grifosAtualizados: Grifo[] = [];
  const grifosNaoReancorados: GrifoNaoReancorado[] = [];
  let grifosReancoradosCount = 0;

  const localizarEmArtigo = (
    artNovo: import('@/src/types/domain').Artigo,
    trecho: string,
    contextoAntes = '',
    contextoDepois = '',
    inicioHint = 0
  ): { bloco: BlocoArtigo; inicio: number; fim: number; trechoEncontrado: string } | null => {
    const variantes = gerarVariantesTrecho(trecho);
    for (const v of variantes) {
      const padraoCtx = `${contextoAntes}${v}${contextoDepois}`;
      if (contextoAntes || contextoDepois) {
        for (const bloco of artNovo.blocos) {
          const idxCtx = bloco.texto.indexOf(padraoCtx);
          if (idxCtx !== -1) {
            const ini = idxCtx + contextoAntes.length;
            return { bloco, inicio: ini, fim: ini + v.length, trechoEncontrado: v };
          }
        }
      }
      for (const bloco of artNovo.blocos) {
        let melhorIdx = -1;
        let menorDist = Infinity;
        let pos = bloco.texto.indexOf(v);
        while (pos !== -1) {
          const dist = Math.abs(pos - inicioHint);
          if (dist < menorDist) {
            menorDist = dist;
            melhorIdx = pos;
          }
          pos = bloco.texto.indexOf(v, pos + 1);
        }
        if (melhorIdx !== -1) {
          return {
            bloco,
            inicio: melhorIdx,
            fim: melhorIdx + v.length,
            trechoEncontrado: v,
          };
        }
      }
    }
    return null;
  };

  for (const g of grifos) {
    const artAntigo = mapaAntigoPorId.get(g.artigoId);
    const novoArtId = mapaArtigoIdAntigoParaNovo.get(g.artigoId);
    let artAlvo = novoArtId ? mapaNovoPorId.get(novoArtId) : undefined;
    let achado = artAlvo
      ? localizarEmArtigo(artAlvo, g.trecho, g.contextoAntes, g.contextoDepois, g.inicio)
      : null;

    // Fallback: procura em outros artigos do mesmo código se o artigo anterior havia sido engolido
    if (!achado) {
      for (const cand of artigosNovos) {
        const res = localizarEmArtigo(cand, g.trecho, g.contextoAntes, g.contextoDepois, g.inicio);
        if (res) {
          artAlvo = cand;
          achado = res;
          break;
        }
      }
    }

    if (achado && artAlvo) {
      grifosReancoradosCount += 1;
      grifosAtualizados.push({
        ...g,
        artigoId: artAlvo.id,
        blocoId: achado.bloco.id,
        inicio: achado.inicio,
        fim: achado.fim,
        trecho: achado.trechoEncontrado,
        contextoAntes: achado.bloco.texto.slice(Math.max(0, achado.inicio - 24), achado.inicio),
        contextoDepois: achado.bloco.texto.slice(achado.fim, achado.fim + 24),
        atualizadoEm: Date.now(),
      });
    } else {
      // Preserva o grifo sem apagar e registra aviso
      grifosAtualizados.push({
        ...g,
        artigoId: artAlvo ? artAlvo.id : g.artigoId,
      });
      grifosNaoReancorados.push({
        grifoId: g.id,
        artigoNumero: artAntigo?.numero || '?',
        trecho: g.trecho,
      });
    }
  }

  const anotacoesAtualizadas = anotacoes.map((nota) => {
    const novoArtId = mapaArtigoIdAntigoParaNovo.get(nota.artigoId);
    const artAlvo = novoArtId ? mapaNovoPorId.get(novoArtId) : undefined;
    if (!artAlvo) return nota;
    if (nota.trechoSelecionado) {
      const achado = localizarEmArtigo(artAlvo, nota.trechoSelecionado, '', '', nota.inicio || 0);
      if (achado) {
        return {
          ...nota,
          artigoId: artAlvo.id,
          blocoId: achado.bloco.id,
          inicio: achado.inicio,
          fim: achado.fim,
          trechoSelecionado: achado.trechoEncontrado,
          atualizadoEm: Date.now(),
        };
      }
    }
    return {
      ...nota,
      artigoId: artAlvo.id,
      blocoId: artAlvo.blocos[0]?.id || nota.blocoId,
      atualizadoEm: Date.now(),
    };
  });

  return {
    grifosAtualizados,
    anotacoesAtualizadas,
    mapaArtigoIdAntigoParaNovo,
    grifosReancoradosCount,
    grifosNaoReancorados,
  };
}
