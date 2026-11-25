import { describe, expect, it } from 'vitest';
import type { Artigo, Codigo, Pasta } from '@/src/types/domain';
import {
  buscarArtigosRankeados,
  codigoCorrespondeBusca,
  extrairNumeroBusca,
  normalizarNumeroUnidade,
  normalizarTextoBusca,
  obterCaminhoPasta,
  obterPastasDescendentes,
  pontuarArtigoParaBusca,
} from '../librarySearch';

function criarArtigo(parcial: Partial<Artigo> & { id: string; numero: string }): Artigo {
  return {
    id: parcial.id,
    codigoId: parcial.codigoId ?? 'cod_cf',
    numero: parcial.numero,
    numeroSort: parcial.numeroSort ?? (parseFloat(parcial.numero.replace(/[^\d.]/g, '')) || 0),
    ordem: parcial.ordem ?? 0,
    tipoUnidade: parcial.tipoUnidade ?? 'artigo',
    subtipoMeta: parcial.subtipoMeta,
    hierarquia: parcial.hierarquia ?? {},
    epigrafe: parcial.epigrafe,
    blocos: parcial.blocos ?? [],
    textoIntegral: parcial.textoIntegral ?? `Texto do artigo ${parcial.numero}`,
    favorito: parcial.favorito ?? false,
    atualizadoEm: parcial.atualizadoEm ?? 1000,
  };
}

function criarPasta(id: string, nome: string, parentId: string | null = null): Pasta {
  return {
    id,
    nome,
    parentId,
    fixa: false,
    ordem: 0,
    criadoEm: 1000,
    atualizadoEm: 1000,
  };
}

function criarCodigo(id: string, nome: string, sigla: string, pastaId?: string): Codigo {
  return {
    id,
    nome,
    sigla,
    pastaId,
    totalArtigos: 10,
    ordem: 0,
    criadoEm: 1000,
    atualizadoEm: 1000,
    syncVersion: 1,
  };
}

describe('Biblioteca — Normalização de busca de artigos e termos', () => {
  it('normaliza acentos, maiúsculas e espaços extras', () => {
    expect(normalizarTextoBusca('  Constituição   FedeRal — São Paulo  ')).toBe(
      'constituicao federal — sao paulo'
    );
  });

  it('extrai números de artigos com prefixos e marcadores ordinais variados', () => {
    expect(extrairNumeroBusca('5')).toBe('5');
    expect(extrairNumeroBusca('5º')).toBe('5');
    expect(extrairNumeroBusca('5o')).toBe('5');
    expect(extrairNumeroBusca('Art. 5º')).toBe('5');
    expect(extrairNumeroBusca('artigo 121-A')).toBe('121-a');
    expect(extrairNumeroBusca('Art. 1.015')).toBe('1015');
    expect(extrairNumeroBusca('Súmula Vinculante 13')).toBe('sv 13');
  });

  it('normaliza numero de unidade armazenado mantendo sufixos', () => {
    expect(normalizarNumeroUnidade('5º')).toBe('5');
    expect(normalizarNumeroUnidade('5º-A')).toBe('5-a');
    expect(normalizarNumeroUnidade('1.015')).toBe('1015');
  });
});

describe('Biblioteca — Ranqueamento de artigos sem truncamento prematuro', () => {
  it('encontra o Art. 5º exato no topo mesmo após 80 artigos com texto contendo "5"', () => {
    const ruidos: Artigo[] = Array.from({ length: 80 }, (_, idx) =>
      criarArtigo({
        id: `art_ruido_${idx}`,
        numero: `${500 + idx}`,
        numeroSort: 500 + idx,
        ordem: idx,
        textoIntegral: `Prazo de 5 dias úteis no item ${idx}.`,
      })
    );
    const art5Prefixo = criarArtigo({
      id: 'art_50',
      numero: '50',
      numeroSort: 50,
      ordem: 81,
      textoIntegral: 'Artigo 50 de exemplo.',
    });
    const art5Sufixo = criarArtigo({
      id: 'art_5a',
      numero: '5º-A',
      numeroSort: 5.01,
      ordem: 82,
      textoIntegral: 'Artigo 5º-A de exemplo.',
    });
    const art5Exato = criarArtigo({
      id: 'art_5',
      numero: '5º',
      numeroSort: 5,
      ordem: 83,
      textoIntegral: 'Todos são iguais perante a lei.',
    });

    const resultados = buscarArtigosRankeados(
      [...ruidos, art5Prefixo, art5Sufixo, art5Exato],
      'Art. 5º',
      { limite: 20 }
    );

    expect(resultados.length).toBeGreaterThanOrEqual(3);
    expect(resultados[0].id).toBe('art_5');
    expect(resultados[1].id).toBe('art_5a');
    expect(resultados[2].id).toBe('art_50');
  });

  it('prioriza o código ativo em empates de correspondência exata', () => {
    const cf5 = criarArtigo({ id: 'cf_5', codigoId: 'cod_cf', numero: '5º', numeroSort: 5 });
    const cp5 = criarArtigo({ id: 'cp_5', codigoId: 'cod_cp', numero: '5º', numeroSort: 5 });

    const comPrioridadeCp = buscarArtigosRankeados([cf5, cp5], '5', {
      codigoPrioritarioId: 'cod_cp',
    });

    expect(comPrioridadeCp.map((a) => a.id)).toEqual(['cp_5', 'cf_5']);
  });

  it('pontua corretamente epígrafe, processo e texto integral sem acento', () => {
    const artEpigrafe = criarArtigo({
      id: 'a1',
      numero: '121',
      epigrafe: 'Homicídio qualificado',
      textoIntegral: 'Matar alguém.',
    });
    const artProcesso = criarArtigo({
      id: 'a2',
      numero: '1',
      tipoUnidade: 'decisao',
      subtipoMeta: { numeroProcesso: 'RE 123456' },
      textoIntegral: 'Acórdão paradigma.',
    });
    const artTexto = criarArtigo({
      id: 'a3',
      numero: '99',
      textoIntegral: 'Dispõe sobre execução provisória da pena.',
    });

    expect(pontuarArtigoParaBusca(artEpigrafe, 'homicidio')).toBe(3);
    expect(pontuarArtigoParaBusca(artProcesso, 'RE 123456')).toBe(3);
    expect(pontuarArtigoParaBusca(artTexto, 'execucao provisoria')).toBe(4);
    expect(pontuarArtigoParaBusca(artTexto, 'inexistente')).toBeNull();
  });

  it('não casa artigos aleatórios quando o usuário digita apenas a palavra "artigo"', () => {
    const art = criarArtigo({
      id: 'a1',
      numero: '5º',
      textoIntegral: 'Todos são iguais perante a lei.',
    });
    expect(pontuarArtigoParaBusca(art, 'artigo')).toBeNull();
  });
});

describe('Biblioteca — Pastas, subpastas e busca de códigos', () => {
  it('obtém todas as subpastas descendentes com segurança contra ciclos', () => {
    const pRaiz = criarPasta('p_vade', 'Vade Mecum');
    const pFilha1 = criarPasta('p_penal', 'Direito Penal', 'p_vade');
    const pNeta = criarPasta('p_esp', 'Leis Especiais', 'p_penal');
    const pOutra = criarPasta('p_civil', 'Direito Civil', null);

    // Simula ciclo defensivo
    const pCicloA = criarPasta('p_ca', 'Ciclo A', 'p_cb');
    const pCicloB = criarPasta('p_cb', 'Ciclo B', 'p_ca');

    const descendentes = obterPastasDescendentes([pRaiz, pFilha1, pNeta, pOutra], 'p_vade');
    expect(Array.from(descendentes).sort()).toEqual(['p_esp', 'p_penal', 'p_vade']);

    const cicloDesc = obterPastasDescendentes([pCicloA, pCicloB], 'p_ca');
    expect(Array.from(cicloDesc).sort()).toEqual(['p_ca', 'p_cb']);
  });

  it('constrói o caminho completo da pasta e busca códigos por nome ou sigla sem acento', () => {
    const p1 = criarPasta('p1', 'Vade Mecum');
    const p2 = criarPasta('p2', 'Direito Constitucional', 'p1');
    const mapa = new Map([p1, p2].map((p) => [p.id, p]));

    expect(obterCaminhoPasta(mapa, 'p2')).toBe('Vade Mecum › Direito Constitucional');
    expect(obterCaminhoPasta(mapa, undefined)).toBe('');

    const cod = criarCodigo('c1', 'Constituição da República Federativa', 'CF/88', 'p2');
    expect(codigoCorrespondeBusca(cod, 'constituicao')).toBe(true);
    expect(codigoCorrespondeBusca(cod, 'cf/88')).toBe(true);
    expect(codigoCorrespondeBusca(cod, 'codigo penal')).toBe(false);
  });
});
