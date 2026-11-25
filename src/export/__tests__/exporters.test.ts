import { describe, expect, it, vi } from 'vitest';
import type { Anotacao, Artigo, Codigo, CorConfig, Grifo } from '@/src/types/domain';

const registrosPdf = {
  chamadasText: [] as Array<{ pagina: number; texto: string; x: number; y: number }>,
  addPageCount: 0,
  linhasDesenhadas: [] as Array<{ pagina: number; x1: number; y1: number; x2: number; y2: number }>,
};

vi.mock('jspdf', () => {
  class MockJsPDF {
    private paginaAtual = 1;
    internal = {
      pageSize: {
        getWidth: () => 595.28,
        getHeight: () => 841.89,
      },
    };
    constructor() {
      registrosPdf.chamadasText = [];
      registrosPdf.addPageCount = 0;
      registrosPdf.linhasDesenhadas = [];
    }
    setFont() {}
    setFontSize() {}
    setTextColor() {}
    setFillColor() {}
    setDrawColor() {}
    setLineWidth() {}
    rect() {}
    line(x1: number, y1: number, x2: number, y2: number) {
      registrosPdf.linhasDesenhadas.push({
        pagina: this.paginaAtual,
        x1,
        y1,
        x2,
        y2,
      });
    }
    addPage() {
      registrosPdf.addPageCount += 1;
      this.paginaAtual += 1;
    }
    getTextWidth(texto: string) {
      return String(texto).length * 4.5;
    }
    splitTextToSize(texto: string, maxWidth: number) {
      const palavras = String(texto).split(/\s+/);
      const linhas: string[] = [];
      let atual = '';
      for (const p of palavras) {
        const candidata = atual ? `${atual} ${p}` : p;
        if (candidata.length * 4.5 > maxWidth && atual) {
          linhas.push(atual);
          atual = p;
        } else {
          atual = candidata;
        }
      }
      if (atual) linhas.push(atual);
      return linhas.length > 0 ? linhas : [''];
    }
    text(texto: string | string[], x: number, y: number) {
      const linhas = Array.isArray(texto) ? texto : [texto];
      linhas.forEach((ln, idx) => {
        registrosPdf.chamadasText.push({
          pagina: this.paginaAtual,
          texto: String(ln),
          x,
          y: y + idx * 12,
        });
      });
    }
    output() {
      return new Blob(['mock-pdf'], { type: 'application/pdf' });
    }
  }
  return { jsPDF: MockJsPDF };
});

import {
  gerarPdfEsquematizado,
  obterTextoAnotacaoPreservandoQuebras,
  prepararDadosExportacao,
} from '../exporters';

const CORES_TESTE: CorConfig[] = [
  {
    id: 'amarelo',
    nome: 'Amarelo',
    significado: 'Regra geral',
    hexBg: '#fef08a',
    hexBgDark: 'rgba(234, 179, 8, 0.32)',
    hexBorder: '#eab308',
    atalho: '1',
  },
  {
    id: 'verde',
    nome: 'Verde',
    significado: 'Palavra-chave',
    hexBg: '#bbf7d0',
    hexBgDark: 'rgba(34, 197, 94, 0.28)',
    hexBorder: '#16a34a',
    atalho: '2',
  },
];

const CODIGO_TESTE: Codigo = {
  id: 'cod_cf',
  nome: 'Constituição Federal',
  sigla: 'CF/88',
  ordem: 0,
  totalArtigos: 14,
  criadoEm: Date.now(),
  atualizadoEm: Date.now(),
  syncVersion: 1,
};

describe('Exportação em PDF em 2 colunas e preservação de quebras', () => {
  it('extrai quebras de linha de anotações HTML com div, p, br e listas', () => {
    const nota: Pick<Anotacao, 'conteudoHtml' | 'conteudoTexto'> = {
      conteudoHtml:
        '<div>Primeira linha</div><div><br></div><div>Segunda linha<br>Terceira linha</div><ul><li>Ponto A</li><li>Ponto B</li></ul>',
      conteudoTexto: 'Primeira linhaSegunda linhaTerceira linha',
    };

    expect(obterTextoAnotacaoPreservandoQuebras(nota)).toBe(
      'Primeira linha\n\nSegunda linha\nTerceira linha\n• Ponto A\n• Ponto B'
    );
  });

  it('inicia artigos na primeira página abaixo da legenda após ~3 linhas e preenche esquerda depois direita', () => {
    const artigos: Artigo[] = Array.from({ length: 14 }, (_, idx) => ({
      id: `art_${idx + 1}`,
      codigoId: 'cod_cf',
      numero: String(idx + 1),
      numeroSort: idx + 1,
      ordem: idx,
      hierarquia: { titulo: 'Título I' },
      epigrafe: `Artigo ${idx + 1}`,
      blocos: [
        {
          id: `blk_${idx + 1}`,
          tipo: 'caput',
          rotulo: 'caput',
          nivel: 0,
          texto:
            'Todos são iguais perante a lei, sem distinção de qualquer natureza, garantindo-se aos brasileiros e aos estrangeiros residentes no País a inviolabilidade do direito à vida, à liberdade, à igualdade, à segurança e à propriedade.',
        },
      ],
      textoIntegral:
        'Todos são iguais perante a lei, sem distinção de qualquer natureza.',
      favorito: false,
      atualizadoEm: Date.now(),
    }));

    const grifos: Grifo[] = [
      {
        id: 'grf_1',
        codigoId: 'cod_cf',
        artigoId: 'art_1',
        blocoId: 'blk_1',
        corId: 'amarelo',
        inicio: 0,
        fim: 32,
        trecho: 'Todos são iguais perante a lei,',
        contextoAntes: '',
        contextoDepois: '',
        criadoEm: Date.now(),
        atualizadoEm: Date.now(),
      },
    ];

    const anotacoes: Anotacao[] = [
      {
        id: 'not_1',
        codigoId: 'cod_cf',
        artigoId: 'art_1',
        blocoId: 'blk_1',
        conteudoHtml: '<p>Linha 1 da nota</p><p><br></p><p>Linha 2 após espaço</p>',
        conteudoTexto: 'Linha 1 da notaLinha 2 após espaço',
        tags: [],
        criadoEm: Date.now(),
        atualizadoEm: Date.now(),
      },
    ];

    const dados = prepararDadosExportacao(
      CODIGO_TESTE,
      artigos,
      grifos,
      anotacoes,
      CORES_TESTE,
      {
        codigoId: 'cod_cf',
        escopo: 'codigo_inteiro',
        somenteTrechosGrifados: false,
        incluirTextoIntegral: true,
        incluirArtigosSemMarcacoes: true,
        agrupamento: 'ordem_codigo',
        formato: 'pdf',
      }
    );

    const blob = gerarPdfEsquematizado(dados);
    expect(blob.type).toBe('application/pdf');

    // Art. 1 deve começar na página 1 (não em página separada após a legenda)
    const chamadaArt1 = registrosPdf.chamadasText.find(
      (c) => c.texto.includes('Art. 1') && c.pagina === 1
    );
    expect(chamadaArt1).toBeDefined();

    // Deve haver pelo menos 3 linhas de folga (~36pt+) entre a legenda e o primeiro artigo
    const chamadaLegenda = registrosPdf.chamadasText.find((c) =>
      c.texto.includes('Amarelo:')
    );
    expect(chamadaLegenda).toBeDefined();
    expect(chamadaArt1!.y - chamadaLegenda!.y).toBeGreaterThanOrEqual(36);

    // Página 1 deve usar duas colunas: coluna esquerda (x ~ 34) e coluna direita (x > 290)
    const chamadasPagina1Conteudo = registrosPdf.chamadasText.filter(
      (c) => c.pagina === 1 && c.y >= chamadaArt1!.y - 12
    );
    const temColunaEsquerda = chamadasPagina1Conteudo.some((c) => c.x >= 34 && c.x < 100);
    const temColunaDireita = chamadasPagina1Conteudo.some((c) => c.x > 290);
    expect(temColunaEsquerda).toBe(true);
    expect(temColunaDireita).toBe(true);

    // Anotação deve renderizar as duas linhas separadas (não concatenadas) e com espaço da linha em branco
    const notaLinha1 = registrosPdf.chamadasText.find((c) =>
      c.texto.includes('Linha 1 da nota')
    );
    const notaLinha2 = registrosPdf.chamadasText.find((c) =>
      c.texto.includes('Linha 2 após espaço')
    );
    expect(notaLinha1).toBeDefined();
    expect(notaLinha2).toBeDefined();
    expect(notaLinha2!.y).toBeGreaterThan(notaLinha1!.y + 12);
  });

  it('exporta somente artigos marcados/anotados no modo esquematizado omitindo texto nao marcado', () => {
    const artigos: Artigo[] = [
      {
        id: 'art_1',
        codigoId: 'cod_cf',
        numero: '1º',
        numeroSort: 1,
        ordem: 0,
        hierarquia: { titulo: 'Título I' },
        blocos: [
          {
            id: 'blk_1',
            tipo: 'caput',
            rotulo: 'caput',
            nivel: 0,
            texto: 'Trecho marcado importante. Texto nao marcado deve ficar fora.',
          },
        ],
        textoIntegral: 'Trecho marcado importante. Texto nao marcado deve ficar fora.',
        favorito: false,
        atualizadoEm: Date.now(),
      },
      {
        id: 'art_2',
        codigoId: 'cod_cf',
        numero: '2º',
        numeroSort: 2,
        ordem: 1,
        hierarquia: { titulo: 'Título I' },
        blocos: [
          {
            id: 'blk_2',
            tipo: 'caput',
            rotulo: 'caput',
            nivel: 0,
            texto: 'Artigo completamente sem marcacao alguma.',
          },
        ],
        textoIntegral: 'Artigo completamente sem marcacao alguma.',
        favorito: false,
        atualizadoEm: Date.now(),
      },
      {
        id: 'art_3',
        codigoId: 'cod_cf',
        numero: '3º',
        numeroSort: 3,
        ordem: 2,
        hierarquia: { titulo: 'Título I' },
        blocos: [
          {
            id: 'blk_3',
            tipo: 'caput',
            rotulo: 'caput',
            nivel: 0,
            texto: 'Artigo apenas com anotacao vinculada.',
          },
        ],
        textoIntegral: 'Artigo apenas com anotacao vinculada.',
        favorito: false,
        atualizadoEm: Date.now(),
      },
    ];

    const grifos: Grifo[] = [
      {
        id: 'grf_1',
        codigoId: 'cod_cf',
        artigoId: 'art_1',
        blocoId: 'blk_1',
        corId: 'amarelo',
        inicio: 0,
        fim: 26,
        trecho: 'Trecho marcado importante.',
        contextoAntes: '',
        contextoDepois: '',
        criadoEm: Date.now(),
        atualizadoEm: Date.now(),
      },
    ];

    const anotacoes: Anotacao[] = [
      {
        id: 'not_3',
        codigoId: 'cod_cf',
        artigoId: 'art_3',
        blocoId: 'blk_3',
        conteudoHtml: '<p>Observacao do art 3</p>',
        conteudoTexto: 'Observacao do art 3',
        tags: [],
        criadoEm: Date.now(),
        atualizadoEm: Date.now(),
      },
    ];

    const dados = prepararDadosExportacao(
      CODIGO_TESTE,
      artigos,
      grifos,
      anotacoes,
      CORES_TESTE,
      {
        codigoId: 'cod_cf',
        escopo: 'somente_marcados',
        somenteTrechosGrifados: true,
        incluirTextoIntegral: false,
        incluirArtigosSemMarcacoes: false,
        agrupamento: 'ordem_codigo',
        formato: 'pdf',
      }
    );

    expect(dados.artigosFiltrados.map((a) => a.id)).toEqual(['art_1', 'art_3']);

    gerarPdfEsquematizado(dados);
    const todoTextoPdf = registrosPdf.chamadasText
      .map((c) => c.texto)
      .join(' ')
      .replace(/\s+/g, ' ');
    expect(todoTextoPdf).toContain('Trecho marcado importante.');
    expect(todoTextoPdf).toContain('Observacao do art 3');
    expect(todoTextoPdf).not.toContain('Texto nao marcado deve ficar fora.');
    expect(todoTextoPdf).not.toContain('Artigo completamente sem marcacao alguma.');
  });
});
