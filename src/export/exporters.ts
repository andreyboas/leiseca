import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';
import { jsPDF } from 'jspdf';
import { exportarBackupCompleto } from '@/src/db/database';
import { segmentarTextoComGrifos } from '@/src/parser/anchor';
import { formatarHierarquiaResumo } from '@/src/parser/legalParser';
import type {
  Anotacao,
  Artigo,
  Codigo,
  CorConfig,
  Grifo,
} from '@/src/types/domain';
import {
  escaparCelulaCsvSegura,
  escaparHtmlAnki,
  extrairTextoDeHtmlSeguro,
  sanitizarNomeArquivo,
} from '@/src/utils/security';
import { formatarDataBR, formatarRotuloUnidade } from '@/src/utils/studyHelpers';

export type EscopoExportacao = 'codigo_inteiro' | 'intervalo' | 'somente_marcados';
export type AgrupamentoExportacao = 'ordem_codigo' | 'por_cor';
export type FormatoExportacao = 'pdf' | 'docx' | 'markdown' | 'json';

export interface OpcoesExportacao {
  codigoId: string;
  escopo: EscopoExportacao;
  artigoInicio?: number;
  artigoFim?: number;
  somenteTrechosGrifados: boolean;
  incluirTextoIntegral: boolean;
  incluirArtigosSemMarcacoes: boolean;
  agrupamento: AgrupamentoExportacao;
  formato: FormatoExportacao;
}

export interface DadosExportacaoPreparados {
  codigo: Codigo;
  cores: CorConfig[];
  artigosFiltrados: Artigo[];
  grifosPorArtigo: Map<string, Grifo[]>;
  anotacoesPorArtigo: Map<string, Anotacao[]>;
  opcoes: OpcoesExportacao;
}

export function prepararDadosExportacao(
  codigo: Codigo,
  todosArtigos: Artigo[],
  todosGrifos: Grifo[],
  todasAnotacoes: Anotacao[],
  cores: CorConfig[],
  opcoes: OpcoesExportacao
): DadosExportacaoPreparados {
  const grifosPorArtigo = new Map<string, Grifo[]>();
  for (const g of todosGrifos) {
    const arr = grifosPorArtigo.get(g.artigoId) || [];
    arr.push(g);
    grifosPorArtigo.set(g.artigoId, arr);
  }

  const anotacoesPorArtigo = new Map<string, Anotacao[]>();
  for (const n of todasAnotacoes) {
    const arr = anotacoesPorArtigo.get(n.artigoId) || [];
    arr.push(n);
    anotacoesPorArtigo.set(n.artigoId, arr);
  }

  let filtrados = [...todosArtigos].sort((a, b) => a.ordem - b.ordem);

  if (opcoes.escopo === 'intervalo') {
    const ini = opcoes.artigoInicio ?? 0;
    const fim = opcoes.artigoFim ?? 999999;
    filtrados = filtrados.filter((a) => a.numeroSort >= ini && a.numeroSort <= fim);
  }

  if (opcoes.escopo === 'somente_marcados' || !opcoes.incluirArtigosSemMarcacoes) {
    filtrados = filtrados.filter(
      (a) =>
        (grifosPorArtigo.get(a.id)?.length || 0) > 0 ||
        (anotacoesPorArtigo.get(a.id)?.length || 0) > 0
    );
  }

  return {
    codigo,
    cores,
    artigosFiltrados: filtrados,
    grifosPorArtigo,
    anotacoesPorArtigo,
    opcoes,
  };
}

function baixarBlob(blob: Blob, nomeArquivo: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = sanitizarNomeArquivo(nomeArquivo);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function hexParaRgb(hex: string): [number, number, number] {
  const limpo = hex.replace('#', '');
  if (limpo.length !== 6) return [254, 240, 138];
  const r = parseInt(limpo.slice(0, 2), 16);
  const g = parseInt(limpo.slice(2, 4), 16);
  const b = parseInt(limpo.slice(4, 6), 16);
  return [r, g, b];
}

function corParaDocxHighlight(
  corId: string
): 'yellow' | 'green' | 'cyan' | 'magenta' | 'darkYellow' | 'lightGray' {
  switch (corId) {
    case 'amarelo':
      return 'yellow';
    case 'verde':
      return 'green';
    case 'azul':
      return 'cyan';
    case 'rosa':
      return 'magenta';
    case 'laranja':
      return 'darkYellow';
    default:
      return 'yellow';
  }
}

export async function executarExportacao(dados: DadosExportacaoPreparados): Promise<void> {
  const { codigo, opcoes } = dados;
  const slug = codigo.sigla.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  const dataStr = new Date().toISOString().slice(0, 10);

  if (opcoes.formato === 'json') {
    const backup = await exportarBackupCompleto();
    const blob = new Blob([JSON.stringify(backup, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    baixarBlob(blob, `leiseca_backup_${dataStr}.json`);
    return;
  }

  if (opcoes.formato === 'markdown') {
    const md = gerarMarkdownEsquematizado(dados);
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    baixarBlob(blob, `leiseca_${slug}_${dataStr}.md`);
    return;
  }

  if (opcoes.formato === 'docx') {
    const blob = await gerarDocxEsquematizado(dados);
    baixarBlob(blob, `leiseca_${slug}_${dataStr}.docx`);
    return;
  }

  if (opcoes.formato === 'pdf') {
    const blob = gerarPdfEsquematizado(dados);
    baixarBlob(blob, `leiseca_${slug}_${dataStr}.pdf`);
  }
}

export function gerarMarkdownEsquematizado(dados: DadosExportacaoPreparados): string {
  const { codigo, cores, artigosFiltrados, grifosPorArtigo, anotacoesPorArtigo, opcoes } = dados;
  const mapaCores = new Map(cores.map((c) => [c.id, c]));
  const linhas: string[] = [];

  linhas.push(`# ${codigo.nome} (${codigo.sigla})`);
  linhas.push(`*Exportado via Lei Seca em ${formatarDataBR(Date.now())}*`);
  linhas.push('');
  linhas.push('## Legenda das Cores');
  for (const cor of cores) {
    linhas.push(`- **${cor.nome}**: ${cor.significado}`);
  }
  linhas.push('');
  linhas.push('---');
  linhas.push('');

  if (opcoes.agrupamento === 'por_cor') {
    const notasIncluidas = new Set<string>();
    for (const cor of cores) {
      const itensCor: Array<{ art: Artigo; grifo: Grifo; notas: Anotacao[] }> = [];
      const notasAvulsasCor: Array<{ art: Artigo; nota: Anotacao }> = [];
      for (const art of artigosFiltrados) {
        const gs = (grifosPorArtigo.get(art.id) || []).filter((g) => g.corId === cor.id);
        const ns = anotacoesPorArtigo.get(art.id) || [];
        for (const g of gs) {
          const vinculadas = ns.filter((n) => n.grifoId === g.id);
          vinculadas.forEach((n) => notasIncluidas.add(n.id));
          itensCor.push({
            art,
            grifo: g,
            notas: vinculadas,
          });
        }
        for (const n of ns) {
          if (!n.grifoId && n.corId === cor.id) {
            notasIncluidas.add(n.id);
            notasAvulsasCor.push({ art, nota: n });
          }
        }
      }
      if (itensCor.length === 0 && notasAvulsasCor.length === 0) continue;
      linhas.push(`## ${cor.nome}${cor.significado ? ` — ${cor.significado}` : ''}`);
      linhas.push('');
      for (const item of itensCor) {
        linhas.push(`### ${formatarRotuloUnidade(item.art)}`);
        linhas.push(`> ==${item.grifo.trecho}==`);
        for (const n of item.notas) {
          linhas.push(`- **Nota:** ${obterTextoAnotacaoPreservandoQuebras(n)}`);
          if (n.jurisprudencia) linhas.push(`  - *Jurisprudência:* ${n.jurisprudencia}`);
        }
        linhas.push('');
      }
      for (const av of notasAvulsasCor) {
        linhas.push(`### ${formatarRotuloUnidade(av.art)}`);
        if (av.nota.trechoSelecionado) {
          linhas.push(`> "${av.nota.trechoSelecionado}"`);
        }
        linhas.push(`- **Nota:** ${obterTextoAnotacaoPreservandoQuebras(av.nota)}`);
        if (av.nota.jurisprudencia) {
          linhas.push(`  - *Jurisprudência:* ${av.nota.jurisprudencia}`);
        }
        linhas.push('');
      }
    }

    const notasSemCor: Array<{ art: Artigo; nota: Anotacao }> = [];
    for (const art of artigosFiltrados) {
      const ns = anotacoesPorArtigo.get(art.id) || [];
      for (const n of ns) {
        if (!notasIncluidas.has(n.id)) {
          notasSemCor.push({ art, nota: n });
        }
      }
    }
    if (notasSemCor.length > 0) {
      linhas.push('## Anotações gerais');
      linhas.push('');
      for (const item of notasSemCor) {
        linhas.push(`### ${formatarRotuloUnidade(item.art)}`);
        if (item.nota.trechoSelecionado) {
          linhas.push(`> "${item.nota.trechoSelecionado}"`);
        }
        linhas.push(`- **Nota:** ${obterTextoAnotacaoPreservandoQuebras(item.nota)}`);
        if (item.nota.jurisprudencia) {
          linhas.push(`  - *Jurisprudência:* ${item.nota.jurisprudencia}`);
        }
        linhas.push('');
      }
    }
    return linhas.join('\n');
  }

  for (const art of artigosFiltrados) {
    const hier = formatarHierarquiaResumo(art.hierarquia);
    if (hier) linhas.push(`*${hier}*`);
    linhas.push(
      `## ${formatarRotuloUnidade(art)}${
        art.epigrafe && art.tipoUnidade !== 'secao' ? ` — ${art.epigrafe}` : ''
      }`
    );
    linhas.push('');

    const gs = grifosPorArtigo.get(art.id) || [];
    const ns = anotacoesPorArtigo.get(art.id) || [];
    const mapaBlocos = new Map(art.blocos.map((b) => [b.id, b]));

    if (opcoes.somenteTrechosGrifados || !opcoes.incluirTextoIntegral) {
      for (const g of gs) {
        const c = mapaCores.get(g.corId);
        const bloco = mapaBlocos.get(g.blocoId);
        const rotuloBloco =
          bloco && bloco.tipo !== 'caput' && art.tipoUnidade !== 'secao'
            ? `${bloco.rotulo} · `
            : '';
        linhas.push(`- **[${c?.nome || g.corId}]** ${rotuloBloco}==${g.trecho}==`);
      }
    } else {
      for (const bloco of art.blocos) {
        const gsBloco = gs.filter((g) => g.blocoId === bloco.id);
        const segs = segmentarTextoComGrifos(bloco.texto, gsBloco);
        const textoComMarcacao = segs
          .map((s) => {
            if (s.grifos.length === 0) return s.texto;
            const c = mapaCores.get(s.grifos[0].corId);
            return `==${s.texto}== [${c?.nome || s.grifos[0].corId}]`;
          })
          .join('');
        const prefixo =
          bloco.tipo === 'caput'
            ? !art.tipoUnidade || art.tipoUnidade === 'artigo'
              ? `**Art. ${art.numero}.** `
              : art.tipoUnidade === 'secao'
              ? ''
              : `**${bloco.rotulo}:** `
            : art.tipoUnidade === 'secao'
            ? ''
            : `**${bloco.rotulo}** `;
        const indent = bloco.nivel > 0 ? '  '.repeat(bloco.nivel) : '';
        linhas.push(`${indent}${prefixo}${textoComMarcacao}`);
      }
    }

    if (ns.length > 0) {
      linhas.push('');
      linhas.push('**Anotações:**');
      for (const n of ns) {
        const trechoInfo = n.trechoSelecionado ? `*(Sobre "${n.trechoSelecionado}")* ` : '';
        const tagsInfo = n.tags.length > 0 ? ` \`[${n.tags.join(', ')}]\`` : '';
        const corpoMd = obterTextoAnotacaoPreservandoQuebras(n).replace(/\n/g, '\n  ');
        linhas.push(`- ${trechoInfo}${corpoMd}${tagsInfo}`);
        if (n.jurisprudencia) {
          linhas.push(`  - *Jurisprudência/Súmula:* ${n.jurisprudencia}`);
        }
      }
    }
    linhas.push('');
  }

  return linhas.join('\n');
}

export function obterTextoAnotacaoPreservandoQuebras(
  n: Pick<Anotacao, 'conteudoHtml' | 'conteudoTexto'>
): string {
  const deHtml = n.conteudoHtml ? extrairTextoDeHtmlSeguro(n.conteudoHtml) : '';
  const base = deHtml || n.conteudoTexto || '';
  return base.replace(/\r\n?/g, '\n').trim();
}

export function gerarPdfEsquematizado(dados: DadosExportacaoPreparados): Blob {
  const { codigo, cores, artigosFiltrados, grifosPorArtigo, anotacoesPorArtigo, opcoes } = dados;
  const mapaCores = new Map(cores.map((c) => [c.id, c]));
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const larguraPagina = doc.internal.pageSize.getWidth();
  const alturaPagina = doc.internal.pageSize.getHeight();

  const margemX = 34;
  const margemTopo = 42;
  const margemRodape = 38;
  const limiteY = alturaPagina - margemRodape;
  const gapColunas = 18;
  const larguraTotal = larguraPagina - margemX * 2;
  const larguraColuna = (larguraTotal - gapColunas) / 2;
  const xCentroDivisor = margemX + larguraColuna + gapColunas / 2;

  let y = 42;

  // CABEÇALHO E LEGENDA COMPACTA NO TOPO DA PRIMEIRA FOLHA
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(30, 58, 138);
  doc.text('LEI SECA · CADERNO ESQUEMATIZADO', margemX, y);
  y += 18;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42);
  const tituloLinhas = doc.splitTextToSize(codigo.nome, larguraTotal);
  doc.text(tituloLinhas, margemX, y);
  y += tituloLinhas.length * 19 + 2;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text(
    `Sigla: ${codigo.sigla}  ·  Exportado em ${formatarDataBR(Date.now())}  ·  Total de artigos incluídos: ${artigosFiltrados.length}`,
    margemX,
    y
  );
  y += 12;

  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.75);
  doc.line(margemX, y, margemX + larguraTotal, y);
  y += 14;

  if (cores.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text('Legenda das Cores de Grifo', margemX, y);
    y += 13;

    // Exibe a legenda em duas colunas compactas para aproveitar melhor a primeira folha
    for (let i = 0; i < cores.length; i += 2) {
      const corEsq = cores[i];
      const corDir = cores[i + 1];

      const renderItemLegenda = (cor: CorConfig, xBase: number): number => {
        const [r, g, b] = hexParaRgb(cor.hexBg);
        doc.setFillColor(r, g, b);
        doc.rect(xBase, y - 7.5, 9, 9, 'F');
        doc.setDrawColor(203, 213, 225);
        doc.setLineWidth(0.4);
        doc.rect(xBase, y - 7.5, 9, 9, 'S');

        const textoLegenda = cor.significado
          ? `${cor.nome}: ${cor.significado}`
          : cor.nome;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(51, 65, 85);
        const linhas = doc.splitTextToSize(textoLegenda, larguraColuna - 15);
        linhas.forEach((ln: string, idxLn: number) => {
          doc.text(ln, xBase + 14, y + idxLn * 10.5);
        });
        return linhas.length * 10.5 + 3;
      };

      const altEsq = renderItemLegenda(corEsq, margemX);
      const altDir = corDir
        ? renderItemLegenda(corDir, margemX + larguraColuna + gapColunas)
        : 0;
      y += Math.max(altEsq, altDir);
    }

    y += 4;
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.75);
    doc.line(margemX, y, margemX + larguraTotal, y);
  }

  // Espaço de pelo menos 3 linhas (~38pt) antes de iniciar os artigos em duas colunas na mesma página
  y += 38;

  let topoColunaAtual = y;
  let colunaAtual: 0 | 1 = 0;

  const xColuna = (col: 0 | 1): number =>
    col === 0 ? margemX : margemX + larguraColuna + gapColunas;

  const desenharDivisorColunas = (yInicio: number) => {
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.5);
    doc.line(xCentroDivisor, yInicio, xCentroDivisor, limiteY);
  };

  if (limiteY - topoColunaAtual < 72) {
    doc.addPage();
    topoColunaAtual = margemTopo;
  }

  y = topoColunaAtual;
  desenharDivisorColunas(topoColunaAtual);

  const avancarColunaOuPagina = () => {
    if (colunaAtual === 0) {
      colunaAtual = 1;
      y = topoColunaAtual;
    } else {
      doc.addPage();
      colunaAtual = 0;
      topoColunaAtual = margemTopo;
      y = topoColunaAtual;
      desenharDivisorColunas(topoColunaAtual);
    }
  };

  const garantirEspaco = (alturaNecessaria: number) => {
    if (y + alturaNecessaria > limiteY) {
      avancarColunaOuPagina();
    }
  };

  const desenharTextoMultilinha = (
    texto: string,
    offsetX: number,
    larguraMax: number,
    fontSize: number,
    lineHeight: number,
    estilo: 'normal' | 'bold' | 'italic' = 'normal',
    corTexto: [number, number, number] = [15, 23, 42],
    prefixoPrimeiraLinha = ''
  ) => {
    const larguraEfetiva = Math.max(40, larguraMax);
    const paragrafos = texto.replace(/\r\n?/g, '\n').split('\n');

    paragrafos.forEach((paragrafo, idxParagrafo) => {
      const linhaTexto =
        idxParagrafo === 0 && prefixoPrimeiraLinha
          ? `${prefixoPrimeiraLinha}${paragrafo}`
          : paragrafo;

      if (!linhaTexto.trim()) {
        garantirEspaco(lineHeight * 0.75);
        y += lineHeight * 0.75;
        return;
      }

      doc.setFont('helvetica', estilo);
      doc.setFontSize(fontSize);
      const subLinhas: string[] = doc.splitTextToSize(linhaTexto, larguraEfetiva);
      for (const ln of subLinhas) {
        garantirEspaco(lineHeight);
        doc.setFont('helvetica', estilo);
        doc.setFontSize(fontSize);
        doc.setTextColor(corTexto[0], corTexto[1], corTexto[2]);
        doc.text(ln, xColuna(colunaAtual) + offsetX, y);
        y += lineHeight;
      }
    });
  };

  const desenharRunsNoFluxo = (
    runs: Array<{ texto: string; corHexBg: string | null; negrito?: boolean }>,
    offsetX: number,
    larguraMax: number,
    fontSize = 9,
    lineHeight = 12
  ) => {
    const larguraEfetiva = Math.max(40, larguraMax);

    interface TokenLinha {
      texto: string;
      corHexBg: string | null;
      negrito: boolean;
      largura: number;
    }

    let linhaAtual: TokenLinha[] = [];
    let larguraLinha = 0;

    const flushLinha = () => {
      if (linhaAtual.length === 0) return;
      garantirEspaco(lineHeight);
      const xInicio = xColuna(colunaAtual) + offsetX;

      let cursorX = xInicio;
      for (const tok of linhaAtual) {
        if (tok.corHexBg && tok.texto.trim().length > 0) {
          const [r, g, b] = hexParaRgb(tok.corHexBg);
          doc.setFillColor(r, g, b);
          doc.rect(cursorX - 0.5, y - fontSize * 0.84, tok.largura + 1, fontSize * 1.15, 'F');
        }
        cursorX += tok.largura;
      }

      cursorX = xInicio;
      doc.setTextColor(15, 23, 42);
      for (const tok of linhaAtual) {
        doc.setFont('helvetica', tok.negrito ? 'bold' : 'normal');
        doc.setFontSize(fontSize);
        doc.text(tok.texto, cursorX, y);
        cursorX += tok.largura;
      }

      y += lineHeight;
      linhaAtual = [];
      larguraLinha = 0;
    };

    const adicionarToken = (textoToken: string, corHexBg: string | null, negrito: boolean) => {
      doc.setFont('helvetica', negrito ? 'bold' : 'normal');
      doc.setFontSize(fontSize);
      const larguraToken = doc.getTextWidth(textoToken);
      const ehEspaco = /^\s+$/.test(textoToken);

      if (linhaAtual.length === 0 && ehEspaco) return;

      if (linhaAtual.length > 0 && larguraLinha + larguraToken > larguraEfetiva) {
        flushLinha();
        if (ehEspaco) return;
      }

      if (linhaAtual.length === 0 && larguraToken > larguraEfetiva) {
        const pedacos: string[] = doc.splitTextToSize(textoToken, larguraEfetiva);
        pedacos.forEach((pedaco, idxPedaco) => {
          doc.setFont('helvetica', negrito ? 'bold' : 'normal');
          doc.setFontSize(fontSize);
          const wPedaco = doc.getTextWidth(pedaco);
          linhaAtual.push({ texto: pedaco, corHexBg, negrito, largura: wPedaco });
          larguraLinha += wPedaco;
          if (idxPedaco < pedacos.length - 1) {
            flushLinha();
          }
        });
        return;
      }

      linhaAtual.push({
        texto: textoToken,
        corHexBg,
        negrito,
        largura: larguraToken,
      });
      larguraLinha += larguraToken;
    };

    for (const run of runs) {
      const partesPorQuebra = run.texto.replace(/\r\n?/g, '\n').split('\n');
      partesPorQuebra.forEach((parte, idxQuebra) => {
        if (idxQuebra > 0) {
          if (linhaAtual.length > 0) {
            flushLinha();
          } else {
            garantirEspaco(lineHeight * 0.75);
            y += lineHeight * 0.75;
          }
        }
        const tokens = parte.split(/(\s+)/).filter((t) => t.length > 0);
        for (const token of tokens) {
          adicionarToken(token, run.corHexBg, !!run.negrito);
        }
      });
    }

    flushLinha();
  };

  if (opcoes.agrupamento === 'por_cor') {
    const notasIncluidas = new Set<string>();
    for (const cor of cores) {
      const itens: Array<{ art: Artigo; grifo: Grifo; notas: Anotacao[] }> = [];
      const notasAvulsasCor: Array<{ art: Artigo; nota: Anotacao }> = [];
      for (const art of artigosFiltrados) {
        const gs = (grifosPorArtigo.get(art.id) || []).filter((g) => g.corId === cor.id);
        const ns = anotacoesPorArtigo.get(art.id) || [];
        for (const g of gs) {
          const vinculadas = ns.filter((n) => n.grifoId === g.id);
          vinculadas.forEach((n) => notasIncluidas.add(n.id));
          itens.push({ art, grifo: g, notas: vinculadas });
        }
        for (const n of ns) {
          if (!n.grifoId && n.corId === cor.id) {
            notasIncluidas.add(n.id);
            notasAvulsasCor.push({ art, nota: n });
          }
        }
      }
      if (itens.length === 0 && notasAvulsasCor.length === 0) continue;

      garantirEspaco(28);
      const cabecalhoCor = cor.significado ? `${cor.nome} — ${cor.significado}` : cor.nome;
      desenharTextoMultilinha(cabecalhoCor, 0, larguraColuna, 10.5, 13, 'bold', [15, 23, 42]);
      y += 3;

      for (const item of itens) {
        desenharTextoMultilinha(
          `${formatarRotuloUnidade(item.art)}:`,
          0,
          larguraColuna,
          9,
          12,
          'bold',
          [15, 23, 42]
        );
        desenharRunsNoFluxo(
          [{ texto: item.grifo.trecho, corHexBg: cor.hexBg }],
          6,
          larguraColuna - 6,
          9,
          12
        );
        for (const n of item.notas) {
          const corpoNota = obterTextoAnotacaoPreservandoQuebras(n);
          if (corpoNota) {
            desenharTextoMultilinha(
              corpoNota,
              8,
              larguraColuna - 8,
              8.5,
              11,
              'italic',
              [71, 85, 105],
              'Nota: '
            );
          }
          if (n.jurisprudencia) {
            desenharTextoMultilinha(
              `Jurisprudência: ${n.jurisprudencia}`,
              8,
              larguraColuna - 8,
              8,
              10.5,
              'italic',
              [100, 116, 139]
            );
          }
        }
        y += 6;
      }

      for (const av of notasAvulsasCor) {
        desenharTextoMultilinha(
          `${formatarRotuloUnidade(av.art)}:`,
          0,
          larguraColuna,
          9,
          12,
          'bold',
          [15, 23, 42]
        );
        if (av.nota.trechoSelecionado) {
          desenharTextoMultilinha(
            `Sobre "${av.nota.trechoSelecionado}":`,
            6,
            larguraColuna - 6,
            8,
            10.5,
            'italic',
            [100, 116, 139]
          );
        }
        const corpoAv = obterTextoAnotacaoPreservandoQuebras(av.nota);
        if (corpoAv) {
          desenharTextoMultilinha(
            corpoAv,
            8,
            larguraColuna - 8,
            8.5,
            11,
            'italic',
            [71, 85, 105],
            'Nota: '
          );
        }
        if (av.nota.jurisprudencia) {
          desenharTextoMultilinha(
            `Jurisprudência: ${av.nota.jurisprudencia}`,
            8,
            larguraColuna - 8,
            8,
            10.5,
            'italic',
            [100, 116, 139]
          );
        }
        y += 6;
      }
      y += 4;
    }

    const notasSemCor: Array<{ art: Artigo; nota: Anotacao }> = [];
    for (const art of artigosFiltrados) {
      const ns = anotacoesPorArtigo.get(art.id) || [];
      for (const n of ns) {
        if (!notasIncluidas.has(n.id)) {
          notasSemCor.push({ art, nota: n });
        }
      }
    }
    if (notasSemCor.length > 0) {
      garantirEspaco(28);
      desenharTextoMultilinha('Anotações gerais', 0, larguraColuna, 10.5, 13, 'bold', [15, 23, 42]);
      y += 3;
      for (const item of notasSemCor) {
        desenharTextoMultilinha(
          `${formatarRotuloUnidade(item.art)}:`,
          0,
          larguraColuna,
          9,
          12,
          'bold',
          [15, 23, 42]
        );
        if (item.nota.trechoSelecionado) {
          desenharTextoMultilinha(
            `Sobre "${item.nota.trechoSelecionado}":`,
            6,
            larguraColuna - 6,
            8,
            10.5,
            'italic',
            [100, 116, 139]
          );
        }
        const corpo = obterTextoAnotacaoPreservandoQuebras(item.nota);
        if (corpo) {
          desenharTextoMultilinha(
            corpo,
            8,
            larguraColuna - 8,
            8.5,
            11,
            'italic',
            [71, 85, 105],
            'Nota: '
          );
        }
        if (item.nota.jurisprudencia) {
          desenharTextoMultilinha(
            `Jurisprudência: ${item.nota.jurisprudencia}`,
            8,
            larguraColuna - 8,
            8,
            10.5,
            'italic',
            [100, 116, 139]
          );
        }
        y += 6;
      }
    }
    return doc.output('blob');
  }

  for (const art of artigosFiltrados) {
    const gs = grifosPorArtigo.get(art.id) || [];
    const ns = anotacoesPorArtigo.get(art.id) || [];
    garantirEspaco(34);

    const hier = formatarHierarquiaResumo(art.hierarquia);
    if (hier) {
      desenharTextoMultilinha(hier, 0, larguraColuna, 7.5, 9.5, 'normal', [100, 116, 139]);
    }

    const tituloItem = `${formatarRotuloUnidade(art)}${
      art.epigrafe && art.tipoUnidade !== 'secao' ? ` — ${art.epigrafe}` : ''
    }`;
    desenharTextoMultilinha(tituloItem, 0, larguraColuna, 10, 12.5, 'bold', [15, 23, 42]);
    y += 2;

    if (opcoes.somenteTrechosGrifados || !opcoes.incluirTextoIntegral) {
      const mapaBlocos = new Map(art.blocos.map((b) => [b.id, b]));
      for (const g of gs) {
        const cor = mapaCores.get(g.corId);
        const bloco = mapaBlocos.get(g.blocoId);
        const runsTrecho: Array<{ texto: string; corHexBg: string | null; negrito?: boolean }> = [];
        if (bloco && bloco.tipo !== 'caput' && art.tipoUnidade !== 'secao') {
          runsTrecho.push({ texto: `${bloco.rotulo} · `, corHexBg: null, negrito: true });
        }
        runsTrecho.push({ texto: g.trecho, corHexBg: cor?.hexBg || '#fef08a' });
        desenharRunsNoFluxo(runsTrecho, 4, larguraColuna - 4, 9, 12);
        y += 3;
      }
    } else {
      for (const bloco of art.blocos) {
        const recuoBloco = Math.min(bloco.nivel * 8, 24);
        const largBloco = larguraColuna - recuoBloco;
        const gsBloco = gs.filter((g) => g.blocoId === bloco.id);

        const runsBloco: Array<{ texto: string; corHexBg: string | null; negrito?: boolean }> = [];
        if (bloco.tipo !== 'caput' && art.tipoUnidade !== 'secao') {
          runsBloco.push({ texto: `${bloco.rotulo} `, corHexBg: null, negrito: true });
        }

        if (gsBloco.length === 0) {
          runsBloco.push({ texto: bloco.texto, corHexBg: null });
        } else {
          const segs = segmentarTextoComGrifoFallback(bloco.texto, gsBloco);
          for (const seg of segs) {
            const cor = seg.corId ? mapaCores.get(seg.corId) : null;
            runsBloco.push({ texto: seg.texto, corHexBg: cor?.hexBg || null });
          }
        }

        desenharRunsNoFluxo(runsBloco, recuoBloco, largBloco, 9, 12);
        y += 2.5;
      }
    }

    if (ns.length > 0) {
      garantirEspaco(20);
      y += 2;
      desenharTextoMultilinha(
        'Anotações vinculadas:',
        4,
        larguraColuna - 4,
        8.5,
        11,
        'bold',
        [30, 58, 138]
      );
      for (const n of ns) {
        if (n.trechoSelecionado) {
          desenharTextoMultilinha(
            `Sobre "${n.trechoSelecionado}":`,
            6,
            larguraColuna - 6,
            8,
            10.5,
            'italic',
            [100, 116, 139]
          );
        }
        const corpoNota = obterTextoAnotacaoPreservandoQuebras(n);
        if (corpoNota) {
          desenharTextoMultilinha(
            corpoNota,
            8,
            larguraColuna - 8,
            8.5,
            11,
            'normal',
            [51, 65, 85],
            '• '
          );
        }
        if (n.jurisprudencia) {
          desenharTextoMultilinha(
            `Jurisprudência: ${n.jurisprudencia}`,
            8,
            larguraColuna - 8,
            8,
            10.5,
            'italic',
            [71, 85, 105]
          );
        }
        y += 3;
      }
    }

    y += 5;
    if (y + 10 <= limiteY) {
      const xLinha = xColuna(colunaAtual);
      doc.setDrawColor(241, 245, 249);
      doc.setLineWidth(0.5);
      doc.line(xLinha, y, xLinha + larguraColuna, y);
      y += 9;
    } else {
      y += 4;
    }
  }

  return doc.output('blob');
}

function segmentarTextoComGrifoFallback(
  texto: string,
  grifos: Grifo[]
): Array<{ texto: string; corId: string | null }> {
  const segs = segmentarTextoComGrifos(texto, grifos);
  return segs.map((s) => ({
    texto: s.texto,
    corId: s.grifos[0]?.corId || null,
  }));
}

async function gerarDocxEsquematizado(dados: DadosExportacaoPreparados): Promise<Blob> {
  const { codigo, cores, artigosFiltrados, grifosPorArtigo, anotacoesPorArtigo, opcoes } = dados;
  const mapaCores = new Map(cores.map((c) => [c.id, c]));
  const children: Paragraph[] = [];

  children.push(
    new Paragraph({
      text: `${codigo.nome} (${codigo.sigla})`,
      heading: HeadingLevel.TITLE,
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `Exportado via Lei Seca em ${formatarDataBR(Date.now())} · ${artigosFiltrados.length} artigo(s)`,
          italics: true,
          color: '475569',
        }),
      ],
    }),
    new Paragraph({ text: '' }),
    new Paragraph({
      text: 'Legenda das Cores',
      heading: HeadingLevel.HEADING_2,
    })
  );

  for (const cor of cores) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: ` ${cor.nome} `,
            bold: true,
            highlight: corParaDocxHighlight(cor.id),
          }),
          new TextRun({ text: ` — ${cor.significado}` }),
        ],
      })
    );
  }

  children.push(new Paragraph({ text: '' }));

  for (const art of artigosFiltrados) {
    const gs = grifosPorArtigo.get(art.id) || [];
    const ns = anotacoesPorArtigo.get(art.id) || [];
    const hier = formatarHierarquiaResumo(art.hierarquia);

    if (hier) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: hier, size: 18, color: '64748B', italics: true })],
        })
      );
    }

    children.push(
      new Paragraph({
        text: `${formatarRotuloUnidade(art)}${
          art.epigrafe && art.tipoUnidade !== 'secao' ? ` — ${art.epigrafe}` : ''
        }`,
        heading: HeadingLevel.HEADING_2,
      })
    );

    if (opcoes.somenteTrechosGrifados || !opcoes.incluirTextoIntegral) {
      for (const g of gs) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: g.trecho,
                highlight: corParaDocxHighlight(g.corId),
              }),
            ],
          })
        );
      }
    } else {
      for (const bloco of art.blocos) {
        const gsBloco = gs.filter((g) => g.blocoId === bloco.id);
        const segs = segmentarTextoComGrifos(bloco.texto, gsBloco);
        const runs: TextRun[] = [];
        if (bloco.tipo !== 'caput') {
          if (art.tipoUnidade !== 'secao') {
            runs.push(new TextRun({ text: `${bloco.rotulo} `, bold: true }));
          }
        } else if (!art.tipoUnidade || art.tipoUnidade === 'artigo') {
          runs.push(new TextRun({ text: `Art. ${art.numero}. `, bold: true }));
        } else if (art.tipoUnidade !== 'secao') {
          runs.push(new TextRun({ text: `${bloco.rotulo}: `, bold: true }));
        }
        for (const s of segs) {
          runs.push(
            new TextRun({
              text: s.texto,
              highlight: s.grifos[0] ? corParaDocxHighlight(s.grifos[0].corId) : undefined,
            })
          );
        }
        children.push(
          new Paragraph({
            indent: { left: bloco.nivel * 360 },
            children: runs,
          })
        );
      }
    }

    if (ns.length > 0) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: 'Anotações:', bold: true, size: 20 })],
        })
      );
      for (const n of ns) {
        const c = n.corId ? mapaCores.get(n.corId) : null;
        const resumo = `${n.trechoSelecionado ? `[${n.trechoSelecionado}] ` : ''}${n.conteudoTexto}${c ? ` (${c.nome})` : ''}`;
        children.push(
          new Paragraph({
            bullet: { level: 0 },
            children: [new TextRun({ text: resumo, size: 20, color: '334155' })],
          })
        );
        if (n.jurisprudencia) {
          children.push(
            new Paragraph({
              indent: { left: 720 },
              children: [
                new TextRun({
                  text: `Jurisprudência: ${n.jurisprudencia}`,
                  italics: true,
                  size: 18,
                  color: '475569',
                }),
              ],
            })
          );
        }
      }
    }
  }

  const doc = new Document({
    sections: [{ children }],
  });
  return Packer.toBlob(doc);
}

export interface FlashcardGerado {
  id: string;
  codigoSigla: string;
  artigoNumero: string;
  frente: string;
  verso: string;
  corNome: string;
  nota?: string;
}

export function gerarFlashcardsDosGrifos(
  codigos: Codigo[],
  artigos: Artigo[],
  grifos: Grifo[],
  anotacoes: Anotacao[],
  cores: CorConfig[]
): FlashcardGerado[] {
  const mapaCod = new Map(codigos.map((c) => [c.id, c]));
  const mapaArt = new Map(artigos.map((a) => [a.id, a]));
  const mapaCor = new Map(cores.map((c) => [c.id, c]));
  const notasPorGrifo = new Map<string, Anotacao>();
  for (const n of anotacoes) {
    if (n.grifoId) notasPorGrifo.set(n.grifoId, n);
  }

  const cards: FlashcardGerado[] = [];
  for (const g of grifos) {
    const art = mapaArt.get(g.artigoId);
    const cod = mapaCod.get(g.codigoId);
    if (!art || !cod) continue;
    const bloco = art.blocos.find((b) => b.id === g.blocoId);
    if (!bloco) continue;
    const cor = mapaCor.get(g.corId);
    const nota = notasPorGrifo.get(g.id);

    const antes = bloco.texto.slice(0, g.inicio);
    const depois = bloco.texto.slice(g.fim);
    const contextoComLacuna = `${antes}[...]${depois}`;
    const frente = `${cod.sigla} · ${formatarRotuloUnidade(art, { curto: true })}${
      bloco.tipo !== 'caput' ? ` (${bloco.rotulo})` : ''
    }\n${contextoComLacuna}`;

    cards.push({
      id: g.id,
      codigoSigla: cod.sigla,
      artigoNumero: art.numero,
      frente,
      verso: g.trecho,
      corNome: cor ? `${cor.nome} (${cor.significado})` : g.corId,
      nota: nota?.conteudoTexto,
    });
  }
  return cards;
}

export function exportarFlashcardsCsvAnki(cards: FlashcardGerado[]): void {
  const linhas = cards.map((c) => {
    const frenteEscapada = escaparHtmlAnki(c.frente);
    const versoBase = escaparHtmlAnki(c.verso);
    const versoCompleto = c.nota
      ? `${versoBase}<br><br><i>Nota: ${escaparHtmlAnki(c.nota)}</i>`
      : versoBase;
    const tag = `leiseca::${c.codigoSigla.replace(/\s+/g, '_')}`;
    return `${escaparCelulaCsvSegura(frenteEscapada)};${escaparCelulaCsvSegura(versoCompleto)};${escaparCelulaCsvSegura(tag)}`;
  });

  // UTF-8 BOM para compatibilidade direta com Anki e Excel
  const conteudo = `\uFEFF${linhas.join('\n')}`;
  const blob = new Blob([conteudo], { type: 'text/csv;charset=utf-8' });
  const dataStr = new Date().toISOString().slice(0, 10);
  baixarBlob(blob, `leiseca_anki_flashcards_${dataStr}.csv`);
}
