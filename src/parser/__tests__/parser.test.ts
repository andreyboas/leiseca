import { describe, expect, it } from 'vitest';
import {
  calcularNumeroSort,
  detectarCodigosNoTexto,
  dividirTextoComRemissoes,
  limparPaginasPdf,
  normalizarQuebrasDeLinha,
  parseCodigoTexto,
  recalcularSegmentoPorLinhas,
  removerLinhasSumario,
} from '../legalParser';
import {
  parseDoutrinaTexto,
  parseJurisprudenciaTexto,
  parseSumulasTexto,
  sugerirTipoDocumento,
} from '../documentParsers';
import { reancorarGrifosNoBloco, segmentarTextoComGrifos } from '../anchor';
import { VADE_MECUM_AMOSTRA_TEXTO } from '../sampleVadeMecum';

describe('Parser inteligente de Lei Seca', () => {
  it('detecta múltiplos códigos dentro de um mesmo Vade Mecum', () => {
    const detectados = detectarCodigosNoTexto(VADE_MECUM_AMOSTRA_TEXTO, 'vade_mecum.pdf');
    expect(detectados.length).toBe(3);
    expect(detectados.map((c) => c.sigla)).toEqual(['CF/88', 'CP', 'CDC']);
    expect(detectados[0].artigosEstimados).toBeGreaterThanOrEqual(5);
  });

  it('ignora sumário do Vade Mecum e separa 4 códigos seguidos incluindo reinício em Art. 1º', () => {
    const vadeMecumReal = `
SUMÁRIO
CONSTITUIÇÃO DA REPÚBLICA FEDERATIVA DO BRASIL ............... 12
TÍTULO I - Dos Princípios Fundamentais ........................ 12
CÓDIGO PENAL .................................................. 180
DECRETO-LEI Nº 2.848 .......................................... 180
CÓDIGO CIVIL .................................................. 310
ESTATUTO DA TRANSPARÊNCIA DIGITAL ............................. 620
Art. 1º - Disposições Gerais .................................. 620

CONSTITUIÇÃO DA REPÚBLICA FEDERATIVA DO BRASIL
TÍTULO I
DOS PRINCÍPIOS FUNDAMENTAIS
Art. 1º A República Federativa do Brasil, formada pela união indissolúvel dos Estados e Municípios e do Distrito Federal, constitui-se em Estado Democrático de Direito.
Art. 2º São Poderes da União, independentes e harmônicos entre si, o Legislativo, o Executivo e o Judiciário.
Art. 3º Constituem objetivos fundamentais da República Federativa do Brasil:
I - construir uma sociedade livre, justa e solidária;
Art. 4º A República Federativa do Brasil rege-se nas suas relações internacionais pelos seguintes princípios:
Art. 5º Todos são iguais perante a lei, sem distinção de qualquer natureza.

CÓDIGO PENAL
DECRETO-LEI Nº 2.848, DE 7 DE DEZEMBRO DE 1940
PARTE GERAL
TÍTULO I
DA APLICAÇÃO DA LEI PENAL
Art. 1º Não há crime sem lei anterior que o defina. Não há pena sem prévia cominação legal.
Art. 2º Ninguém pode ser punido por fato que lei posterior deixa de considerar crime.
Art. 3º A lei excepcional ou temporária aplica-se ao fato praticado durante sua vigência.
Art. 4º Considera-se praticado o crime no momento da ação ou omissão.
Art. 5º Aplica-se a lei brasileira ao crime cometido no território nacional.

CÓDIGO CIVIL
PARTE GERAL
LIVRO I
DAS PESSOAS
Art. 1º Toda pessoa é capaz de direitos e deveres na ordem civil.
Art. 2º A personalidade civil da pessoa começa do nascimento com vida.
Art. 3º São absolutamente incapazes de exercer pessoalmente os atos da vida civil os menores de 16 (dezesseis) anos.
Art. 4º São incapazes, relativamente a certos atos ou à maneira de os exercer:
Art. 5º A menoridade cessa aos dezoito anos completos.
Art. 6º A existência da pessoa natural termina com a morte.

NORMAS GERAIS DE TRANSPARÊNCIA ADMINISTRATIVA
Art. 1º Esta norma estabelece diretrizes de transparência ativa nos concursos públicos.
Art. 2º Os editais deverão ser publicados em formato acessível.
Art. 3º O prazo de impugnação será de cinco dias úteis.
    `;

    const semSumario = removerLinhasSumario(vadeMecumReal);
    expect(semSumario).not.toContain('............... 12');
    expect(semSumario).not.toContain('620');

    const detectados = detectarCodigosNoTexto(vadeMecumReal, 'Vade_Mecum_2026.pdf');
    expect(detectados).toHaveLength(4);
    expect(detectados[0].sigla).toBe('CF/88');
    expect(detectados[1].sigla).toBe('CP');
    expect(detectados[2].sigla).toBe('CC');
    expect(detectados[3].nome).toBe('NORMAS GERAIS DE TRANSPARÊNCIA ADMINISTRATIVA');

    const arts0 = parseCodigoTexto(detectados[0].texto, 'c0');
    const arts1 = parseCodigoTexto(detectados[1].texto, 'c1');
    const arts2 = parseCodigoTexto(detectados[2].texto, 'c2');
    const arts3 = parseCodigoTexto(detectados[3].texto, 'c3');

    expect(arts0.map((a) => a.numero)).toEqual(['1º', '2º', '3º', '4º', '5º']);
    expect(arts1.map((a) => a.numero)).toEqual(['1º', '2º', '3º', '4º', '5º']);
    expect(arts2.map((a) => a.numero)).toEqual(['1º', '2º', '3º', '4º', '5º', '6º']);
    expect(arts3.map((a) => a.numero)).toEqual(['1º', '2º', '3º']);
  });

  it('recalcula segmento por linhaInicio e linhaFim corretamente', () => {
    const linhas = [
      'CONSTITUIÇÃO FEDERAL',
      'Art. 1º Texto primeiro.',
      'Art. 2º Texto segundo.',
      'CÓDIGO PENAL',
      'Art. 1º Não há crime.',
    ];
    const seg = recalcularSegmentoPorLinhas(linhas, 0, 2);
    expect(seg.artigosEstimados).toBe(2);
    expect(seg.texto).toContain('Art. 2º Texto segundo.');
    expect(seg.texto).not.toContain('CÓDIGO PENAL');
  });

  it('estrutura hierarquia completa e blocos de artigo (caput, incisos, alíneas e parágrafos)', () => {
    const detectados = detectarCodigosNoTexto(VADE_MECUM_AMOSTRA_TEXTO);
    const cf = detectados[0];
    const artigosCf = parseCodigoTexto(cf.texto, 'cod_cf');

    const art5 = artigosCf.find((a) => a.numero === '5º');
    expect(art5).toBeDefined();
    expect(art5?.hierarquia.titulo).toContain('TÍTULO II');
    expect(art5?.hierarquia.capitulo).toContain('CAPÍTULO I');

    const incisoLXX = art5?.blocos.find((b) => b.tipo === 'inciso' && b.rotulo.startsWith('LXX'));
    const alineaA = art5?.blocos.find((b) => b.tipo === 'alinea' && b.rotulo === 'a)');
    const par1 = art5?.blocos.find((b) => b.tipo === 'paragrafo' && b.rotulo === '§ 1º');
    const par3 = art5?.blocos.find((b) => b.tipo === 'paragrafo' && b.rotulo === '§ 3º');

    expect(incisoLXX).toBeDefined();
    expect(alineaA?.nivel).toBe(2);
    expect(par1?.texto).toContain('aplicação imediata');
    expect(par3?.texto).toContain('(Incluído pela Emenda Constitucional nº 45, de 2004)');
  });

  it('suporta artigos com sufixo (121-A, 5º-A, § 2º-A) e milhar (Art. 1.015)', () => {
    const texto = `
CÓDIGO CIVIL
PARTE ESPECIAL
Art. 5º-A Aplica-se integralmente esta norma especial.
Art. 121-A Matar mulher por razões da condição do sexo feminino:
§ 2º-A Considera-se que há razões de condição de sexo feminino.
Art. 1.015. Cabe agravo de instrumento contra as decisões interlocutórias.
    `;
    const artigos = parseCodigoTexto(texto, 'cod_teste');
    expect(artigos.map((a) => a.numero)).toEqual(['5º-A', '121-A', '1.015']);
    expect(calcularNumeroSort('121-A')).toBeGreaterThan(calcularNumeroSort('121'));
    expect(calcularNumeroSort('1.015')).toBe(1015);
    expect(artigos[1].blocos.some((b) => b.rotulo === '§ 2º-A')).toBe(true);
  });

  it('remove cabeçalhos/rodapés repetidos e numeração de página de PDF sem alterar texto legal', () => {
    const paginas = [
      ['Vade Mecum Digital 2026', 'Art. 1º A República Federativa do Brasil constitui-', 'se em Estado Democrático de Direito.', 'Página 1'],
      ['Vade Mecum Digital 2026', 'Art. 2º São Poderes da União, independentes e harmônicos entre si,', 'o Legislativo, o Executivo e o Judiciário.', '2'],
      ['Vade Mecum Digital 2026', 'Art. 3º Constituem objetivos fundamentais:', 'I - construir uma sociedade livre.', '- 3 -'],
    ];
    const limpo = limparPaginasPdf(paginas);
    expect(limpo).not.toContain('Vade Mecum Digital 2026');
    expect(limpo).not.toContain('Página 1');
    expect(limpo).toContain('constitui-se em Estado Democrático de Direito');
    const artigos = parseCodigoTexto(limpo, 'cod_pdf');
    expect(artigos).toHaveLength(3);
  });

  it('normaliza quebras de linha indevidas mantendo separação de itens e alíneas', () => {
    const bruto = `Art. 10. O servidor que deixar de praticar
ato de ofício responderá na forma da lei:
I - multa civil;
a) quando houver dolo;
1. em grau máximo;`;
    const normalizado = normalizarQuebrasDeLinha(bruto);
    const artigos = parseCodigoTexto(normalizado, 'cod_norm');
    expect(artigos[0].blocos.map((b) => b.tipo)).toEqual([
      'caput',
      'inciso',
      'alinea',
      'item',
    ]);
  });

  it('separa remissões legislativas de forma não destrutiva', () => {
    const frase = 'São direitos sociais a educação e a saúde. (Redação dada pela EC nº 90, de 2015) (Revogado)';
    const partes = dividirTextoComRemissoes(frase);
    expect(partes.some((p) => !p.ehRemissao && p.texto.includes('São direitos sociais'))).toBe(true);
    expect(partes.filter((p) => p.ehRemissao)).toHaveLength(2);
    expect(partes.map((p) => p.texto).join('')).toBe(frase);
  });

  it('segmenta grifos sobrepostos e re-ancora após edição de texto', () => {
    const texto = 'Todo o poder emana do povo, que o exerce por meio de representantes eleitos.';
    const grifos = [
      {
        id: 'g1',
        codigoId: 'c1',
        artigoId: 'a1',
        blocoId: 'b1',
        corId: 'amarelo',
        inicio: 0,
        fim: 26,
        trecho: 'Todo o poder emana do povo',
        contextoAntes: '',
        contextoDepois: ', que o exerce',
        criadoEm: 1,
        atualizadoEm: 1,
      },
      {
        id: 'g2',
        codigoId: 'c1',
        artigoId: 'a1',
        blocoId: 'b1',
        corId: 'azul',
        inicio: 13,
        fim: 39,
        trecho: 'emana do povo, que o exerce',
        contextoAntes: 'Todo o poder ',
        contextoDepois: ' por meio',
        criadoEm: 2,
        atualizadoEm: 2,
      },
    ];
    const segs = segmentarTextoComGrifos(texto, grifos);
    expect(segs.map((s) => s.texto).join('')).toBe(texto);
    expect(segs.some((s) => s.grifos.length === 2)).toBe(true);

    const blocoEditado = {
      id: 'b1',
      tipo: 'paragrafo' as const,
      rotulo: 'Parágrafo único',
      texto: 'Parágrafo único. Todo o poder emana do povo, que o exerce por meio de representantes eleitos.',
      nivel: 0,
    };
    const reancorados = reancorarGrifosNoBloco(blocoEditado, grifos);
    expect(reancorados[0].inicio).toBe(17);
    expect(blocoEditado.texto.slice(reancorados[0].inicio, reancorados[0].fim)).toBe(
      'Todo o poder emana do povo'
    );
  });
});

describe('Parsers de outros documentos jurídicos (Jurisprudência, Súmulas e Doutrina)', () => {
  it('sugere automaticamente o tipo de documento adequado', () => {
    expect(sugerirTipoDocumento(VADE_MECUM_AMOSTRA_TEXTO, 'meu_vade_mecum.pdf')).toBe('vade_mecum');
    expect(
      sugerirTipoDocumento(
        'EMENTA: HABEAS CORPUS. STF. Relator: Min. Fulano.\nEMENTA: REsp 123456. STJ.',
        'informativo_stf.pdf'
      )
    ).toBe('jurisprudencia');
    expect(
      sugerirTipoDocumento(
        'Súmula 473 do STF: A administração pode anular seus próprios atos.\nSúmula 597 do STJ: A cláusula contratual...',
        'sumulas_stj.txt'
      )
    ).toBe('sumula');
    expect(
      sugerirTipoDocumento(
        'CAPÍTULO I - Princípios do Direito Administrativo\nA supremacia do interesse público...',
        'apostila_direito_administrativo.pdf'
      )
    ).toBe('doutrina');
  });

  it('separa decisões em arquivo de Jurisprudência extraindo metadados e seções', () => {
    const texto = `
INFORMATIVO Nº 1120 — STF · RE 123456
Relator: Min. Luiz Fux
Julgado em: 14/03/2025
EMENTA: Direito Constitucional. Controle de constitucionalidade.
TESE: É constitucional a norma estadual de transparência.
---
INFORMATIVO Nº 810 — STJ · REsp 987654
Relator: Min. Nancy Andrighi
EMENTA: Direito Civil. Responsabilidade civil objetiva.
DESTAQUE: O dano moral presume-se no caso concreto.
    `;
    const unidades = parseJurisprudenciaTexto(texto, 'cod_jur');
    expect(unidades).toHaveLength(2);
    expect(unidades[0].tipoUnidade).toBe('decisao');
    expect(unidades[0].subtipoMeta?.tribunal).toBe('STF');
    expect(unidades[0].subtipoMeta?.numeroProcesso).toContain('RE 123456');
    expect(unidades[0].blocos.some((b) => b.rotulo.toLowerCase() === 'tese')).toBe(true);
    expect(unidades[1].subtipoMeta?.tribunal).toBe('STJ');
    expect(unidades[1].subtipoMeta?.numeroProcesso).toContain('REsp 987654');
  });

  it('separa Súmulas comuns e Súmulas Vinculantes preservando tribunal', () => {
    const texto = `
SÚMULAS DO STJ
Súmula 385: Da anotação irregular em cadastro de proteção ao crédito, não cabe indenização por dano moral, quando preexistente legítima inscrição.
Súmula 479: As instituições financeiras respondem objetivamente pelos danos gerados por fortuito interno.
Súmula Vinculante 13 (STF): A nomeação de cônjuge para cargo em comissão viola a Constituição Federal.
    `;
    const sumulas = parseSumulasTexto(texto, 'cod_sum');
    expect(sumulas).toHaveLength(3);
    expect(sumulas.map((s) => s.numero)).toEqual(['385', '479', 'SV 13']);
    expect(sumulas[0].subtipoMeta?.tribunal).toBe('STJ');
    expect(sumulas[2].subtipoMeta?.tribunal).toBe('STF');
    expect(sumulas[2].tipoUnidade).toBe('sumula');
  });

  it('separa apostilas/doutrina por capítulos e seções', () => {
    const texto = `
CAPÍTULO I - TEORIA GERAL DOS CONTRATOS
Os contratos constituem a principal fonte das obrigações negociais no direito privado.

A função social atua como limite interno e externo da autonomia privada.

CAPÍTULO II - VÍCIOS REDIBITÓRIOS
Vícios redibitórios são defeitos ocultos em coisa recebida em virtude de contrato comutativo.
    `;
    const secoes = parseDoutrinaTexto(texto, 'cod_doutr');
    expect(secoes).toHaveLength(2);
    expect(secoes[0].tipoUnidade).toBe('secao');
    expect(secoes[0].epigrafe).toContain('CAPÍTULO I');
    expect(secoes[0].blocos).toHaveLength(2);
    expect(secoes[1].epigrafe).toContain('CAPÍTULO II');
  });
});

