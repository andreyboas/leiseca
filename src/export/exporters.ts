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
    for (const cor of cores) {
      const itensCor: Array<{ art: Artigo; grifo: Grifo; notas: Anotacao[] }> = [];
      for (const art of artigosFiltrados) {
        const gs = (grifosPorArtigo.get(art.id) || []).filter((g) => g.corId === cor.id);
        const ns = anotacoesPorArtigo.get(art.id) || [];
        for (const g of gs) {
          itensCor.push({
            art,
            grifo: g,
            notas: ns.filter((n) => n.grifoId === g.id),
          });
        }
      }
      if (itensCor.length === 0) continue;
      linhas.push(`## ${cor.nome} — ${cor.significado}`);
      linhas.push('');
      for (const item of itensCor) {
        linhas.push(`### ${formatarRotuloUnidade(item.art)}`);
        linhas.push(`> ==${item.grifo.trecho}==`);
        for (const n of item.notas) {
          linhas.push(`- **Nota:** ${n.conteudoTexto}`);
          if (n.jurisprudencia) linhas.push(`  - *Jurisprudência:* ${n.jurisprudencia}`);
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

    if (opcoes.somenteTrechosGrifados || !opcoes.incluirTextoIntegral) {
      if (gs.length === 0) {
        linhas.push('*Sem trechos grifados neste item.*');
      } else {
        for (const g of gs) {
          const c = mapaCores.get(g.corId);
          linhas.push(`- **[${c?.nome || g.corId}]** ==${g.trecho}==`);
        }
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
        linhas.push(`- ${trechoInfo}${n.conteudoTexto}${tagsInfo}`);
        if (n.jurisprudencia) {
          linhas.push(`  - *Jurisprudência/Súmula:* ${n.jurisprudencia}`);
        }
      }
    }
    linhas.push('');
  }

  return linhas.join('\n');
}

function gerarPdfEsquematizado(dados: DadosExportacaoPreparados): Blob {
  const { codigo, cores, artigosFiltrados, grifosPorArtigo, anotacoesPorArtigo, opcoes } = dados;
  const mapaCores = new Map(cores.map((c) => [c.id, c]));
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const margemX = 48;
  const larguraUtil = doc.internal.pageSize.getWidth() - margemX * 2;
  const alturaPagina = doc.internal.pageSize.getHeight();
  let y = 80;

  const garantirEspaco = (alturaNecessaria: number) => {
    if (y + alturaNecessaria > alturaPagina - 54) {
      doc.addPage();
      y = 56;
    }
  };

  // CAPA
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(30, 58, 138);
  doc.text('LEI SECA · CADERNO ESQUEMATIZADO', margemX, y - 22);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(15, 23, 42);
  const tituloLinhas = doc.splitTextToSize(codigo.nome, larguraUtil);
  doc.text(tituloLinhas, margemX, y);
  y += tituloLinhas.length * 28 + 12;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(71, 85, 105);
  doc.text(`Sigla: ${codigo.sigla}  ·  Exportado em ${formatarDataBR(Date.now())}`, margemX, y);
  y += 18;
  doc.text(`Total de artigos incluídos: ${artigosFiltrados.length}`, margemX, y);
  y += 32;

  doc.setDrawColor(226, 232, 240);
  doc.line(margemX, y, margemX + larguraUtil, y);
  y += 24;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text('Legenda das Cores de Grifo', margemX, y);
  y += 20;

  for (const cor of cores) {
    const [r, g, b] = hexParaRgb(cor.hexBg);
    doc.setFillColor(r, g, b);
    doc.rect(margemX, y - 10, 14, 14, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text(`${cor.nome}:`, margemX + 22, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text(cor.significado, margemX + 95, y);
    y += 22;
  }

  doc.addPage();
  y = 56;

  const desenharLinhaTextoComGrifo = (
    texto: string,
    corHexBg: string | null,
    xInicio: number,
    larguraMax: number,
    negrito = false
  ) => {
    doc.setFont('helvetica', negrito ? 'bold' : 'normal');
    doc.setFontSize(10.5);
    const linhas = doc.splitTextToSize(texto, larguraMax);
    for (const ln of linhas) {
      garantirEspaco(16);
      if (corHexBg) {
        const [r, g, b] = hexParaRgb(corHexBg);
        const w = doc.getTextWidth(ln);
        doc.setFillColor(r, g, b);
        doc.rect(xInicio - 1, y - 10, Math.min(larguraMax, w + 2), 13, 'F');
      }
      doc.setTextColor(15, 23, 42);
      doc.text(ln, xInicio, y);
      y += 15;
    }
  };

  if (opcoes.agrupamento === 'por_cor') {
    for (const cor of cores) {
      const itens: Array<{ art: Artigo; grifo: Grifo; notas: Anotacao[] }> = [];
      for (const art of artigosFiltrados) {
        const gs = (grifosPorArtigo.get(art.id) || []).filter((g) => g.corId === cor.id);
        const ns = anotacoesPorArtigo.get(art.id) || [];
        for (const g of gs) {
          itens.push({ art, grifo: g, notas: ns.filter((n) => n.grifoId === g.id) });
        }
      }
      if (itens.length === 0) continue;

      garantirEspaco(36);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(15, 23, 42);
      doc.text(`${cor.nome} — ${cor.significado}`, margemX, y);
      y += 20;

      for (const item of itens) {
        desenharLinhaTextoComGrifo(
          `${formatarRotuloUnidade(item.art)}:`,
          null,
          margemX,
          larguraUtil,
          true
        );
        desenharLinhaTextoComGrifo(item.grifo.trecho, cor.hexBg, margemX + 10, larguraUtil - 10);
        for (const n of item.notas) {
          doc.setFont('helvetica', 'italic');
          doc.setFontSize(9.5);
          doc.setTextColor(71, 85, 105);
          const nLinhas = doc.splitTextToSize(`Nota: ${n.conteudoTexto}`, larguraUtil - 16);
          for (const nl of nLinhas) {
            garantirEspaco(14);
            doc.text(nl, margemX + 16, y);
            y += 13;
          }
        }
        y += 8;
      }
    }
    return doc.output('blob');
  }

  for (const art of artigosFiltrados) {
    const gs = grifosPorArtigo.get(art.id) || [];
    const ns = anotacoesPorArtigo.get(art.id) || [];
    garantirEspaco(42);

    const hier = formatarHierarquiaResumo(art.hierarquia);
    if (hier) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(100, 116, 139);
      const hLinhas = doc.splitTextToSize(hier, larguraUtil);
      for (const hl of hLinhas) {
        garantirEspaco(12);
        doc.text(hl, margemX, y);
        y += 11;
      }
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42);
    const tituloItem = `${formatarRotuloUnidade(art)}${
      art.epigrafe && art.tipoUnidade !== 'secao' ? ` — ${art.epigrafe}` : ''
    }`;
    doc.text(doc.splitTextToSize(tituloItem, larguraUtil), margemX, y);
    y += 18;

    if (opcoes.somenteTrechosGrifados || !opcoes.incluirTextoIntegral) {
      for (const g of gs) {
        const cor = mapaCores.get(g.corId);
        desenharLinhaTextoComGrifo(g.trecho, cor?.hexBg || '#fef08a', margemX + 8, larguraUtil - 8);
        y += 4;
      }
    } else {
      for (const bloco of art.blocos) {
        const xBloco = margemX + bloco.nivel * 14;
        const largBloco = larguraUtil - bloco.nivel * 14;
        const gsBloco = gs.filter((g) => g.blocoId === bloco.id);

        if (gsBloco.length === 0) {
          const textoCompleto =
            bloco.tipo === 'caput' ? bloco.texto : `${bloco.rotulo} ${bloco.texto}`;
          desenharLinhaTextoComGrifo(textoCompleto, null, xBloco, largBloco);
        } else {
          // Renderiza segmentos com cor de destaque preservada
          if (bloco.tipo !== 'caput') {
            desenharLinhaTextoComGrifo(bloco.rotulo, null, xBloco, largBloco, true);
          }
          const segs = segmentarTextoComGrifoFallback(bloco.texto, gsBloco);
          for (const seg of segs) {
            const cor = seg.corId ? mapaCores.get(seg.corId) : null;
            desenharLinhaTextoComGrifo(seg.texto, cor?.hexBg || null, xBloco + 4, largBloco - 4);
          }
        }
        y += 3;
      }
    }

    if (ns.length > 0) {
      garantirEspaco(24);
      y += 4;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(51, 65, 85);
      doc.text('Anotações vinculadas:', margemX + 8, y);
      y += 14;
      for (const n of ns) {
        const prefixo = n.trechoSelecionado ? `[Trecho: "${n.trechoSelecionado}"] ` : '';
        const textoNota = `${prefixo}${n.conteudoTexto}${n.jurisprudencia ? ` (Jur.: ${n.jurisprudencia})` : ''}`;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9.5);
        doc.setTextColor(71, 85, 105);
        const linhasNota = doc.splitTextToSize(`• ${textoNota}`, larguraUtil - 16);
        for (const ln of linhasNota) {
          garantirEspaco(14);
          doc.text(ln, margemX + 12, y);
          y += 13;
        }
      }
    }

    y += 12;
    doc.setDrawColor(241, 245, 249);
    doc.line(margemX, y, margemX + larguraUtil, y);
    y += 16;
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
