import * as pdfjsLib from 'pdfjs-dist';
import * as pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs';
import mammoth from 'mammoth';
import {
  detectarSegmentosPorTipo,
  parseDocumentoPorTipo,
  sugerirTipoDocumento,
} from '../parser/documentParsers';
import { reunirPalavrasHifenizadas } from '../parser/hyphenReunifier';
import {
  juntarLinhasQuebradasDeFrases,
  limparPaginasPdfDetalhado,
  removerLinhasSumario,
} from '../parser/legalParser';
import { ordenarItensPdfPorColunas, type PdfTextItem } from '../parser/pdfLayout';
import type {
  Artigo,
  CodigoDetectado,
  RegistroHifenizacao,
  TipoDocumento,
} from '../types/domain';

(globalThis as unknown as { pdfjsWorker?: unknown }).pdfjsWorker = pdfjsWorker;

export type WorkerRequest =
  | {
      id: string;
      tipo: 'EXTRAIR_ARQUIVO';
      nomeArquivo: string;
      buffer: ArrayBuffer;
      tipoPreferido?: TipoDocumento;
      preferenciasHifen?: Record<string, boolean>;
    }
  | {
      id: string;
      tipo: 'PARSEAR_CODIGOS';
      tipoDocumento: TipoDocumento;
      itens: Array<{ codigoId: string; detectado: CodigoDetectado }>;
      reunioesHifen?: RegistroHifenizacao[];
      preferenciasHifen?: Record<string, boolean>;
      overridesPorId?: Record<string, boolean>;
    };

export type WorkerResponse =
  | {
      id: string;
      tipo: 'PROGRESSO';
      progresso: number; // 0..100
      etapa: string;
    }
  | {
      id: string;
      tipo: 'RESULTADO_EXTRACAO';
      textoBruto: string;
      textoPreHifen: string;
      paginasLinhasLimpas?: string[][];
      linhasTotais: string[];
      formato: 'pdf' | 'docx' | 'txt';
      totalPaginas?: number;
      avisoOcr: boolean;
      tipoSugerido: TipoDocumento;
      codigosDetectados: CodigoDetectado[];
      reunioesHifen: RegistroHifenizacao[];
    }
  | {
      id: string;
      tipo: 'RESULTADO_PARSE';
      artigosPorCodigo: Record<string, Artigo[]>;
    }
  | {
      id: string;
      tipo: 'ERRO';
      mensagem: string;
    };

function postar(msg: WorkerResponse) {
  self.postMessage(msg);
}

function associarTrechosBrutos(
  codigos: CodigoDetectado[],
  textoPreHifen: string
): CodigoDetectado[] {
  if (!textoPreHifen || codigos.length === 0) return codigos;
  if (codigos.length === 1) {
    return [{ ...codigos[0], textoRaw: codigos[0].textoRaw || textoPreHifen }];
  }

  let cursor = 0;
  const inicios: number[] = [];

  for (const cod of codigos) {
    const primeiraLinha =
      cod.texto
        .split('\n')
        .map((l) => l.trim())
        .find((l) => l.length >= 4) || cod.nome;
    const prefixoBusca = primeiraLinha.slice(0, 48);
    const idx = textoPreHifen.indexOf(prefixoBusca, cursor);
    if (idx !== -1) {
      inicios.push(idx);
      cursor = idx + prefixoBusca.length;
    } else {
      inicios.push(cursor);
    }
  }

  return codigos.map((cod, idx) => {
    const ini = inicios[idx];
    const fim = idx + 1 < inicios.length ? Math.max(ini, inicios[idx + 1]) : textoPreHifen.length;
    return {
      ...cod,
      textoRaw: cod.textoRaw || textoPreHifen.slice(ini, fim).trim(),
    };
  });
}

async function extrairTextoPdf(
  id: string,
  buffer: ArrayBuffer,
  preferenciasHifen?: Record<string, boolean>
): Promise<{
  texto: string;
  textoPreHifen: string;
  paginasLinhasLimpas: string[][];
  reunioesHifen: RegistroHifenizacao[];
  totalPaginas: number;
  avisoOcr: boolean;
}> {
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
  });

  const pdf = await loadingTask.promise;
  const totalPaginas = pdf.numPages;
  const paginasLinhas: string[][] = [];
  let totalCaracteres = 0;

  for (let p = 1; p <= totalPaginas; p++) {
    const page = await pdf.getPage(p);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();

    const itensBrutos: PdfTextItem[] = [];
    for (const item of content.items) {
      if (!('str' in item) || !item.str) continue;
      const transform = item.transform as number[];
      itensBrutos.push({
        x: transform[4] ?? 0,
        y: transform[5] ?? 0,
        w: typeof item.width === 'number' ? item.width : item.str.length * 4,
        str: item.str,
      });
    }

    const linhasPagina = ordenarItensPdfPorColunas(itensBrutos, viewport.width);
    for (const limpa of linhasPagina) {
      totalCaracteres += limpa.length;
    }

    paginasLinhas.push(linhasPagina);
    const pct = Math.min(85, Math.round((p / Math.max(1, totalPaginas)) * 80) + 5);
    if (p % 3 === 0 || p === totalPaginas) {
      postar({
        id,
        tipo: 'PROGRESSO',
        progresso: pct,
        etapa: `Lendo página ${p} de ${totalPaginas}...`,
      });
    }
  }

  const mediaPorPagina = totalPaginas > 0 ? totalCaracteres / totalPaginas : 0;
  const avisoOcr = totalPaginas > 0 && mediaPorPagina < 35;

  postar({
    id,
    tipo: 'PROGRESSO',
    progresso: 90,
    etapa: 'Removendo cabeçalhos, reunindo palavras hifenizadas e limpando quebras...',
  });

  const resLimpeza = limparPaginasPdfDetalhado(paginasLinhas, {
    preferenciasUsuario: preferenciasHifen,
  });

  return {
    texto: resLimpeza.textoTratado,
    textoPreHifen: resLimpeza.textoPreHifen,
    paginasLinhasLimpas: resLimpeza.paginasLinhasLimpas,
    reunioesHifen: resLimpeza.reunioesHifen,
    totalPaginas,
    avisoOcr,
  };
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const req = event.data;
  try {
    if (req.tipo === 'EXTRAIR_ARQUIVO') {
      const ext = req.nomeArquivo.split('.').pop()?.toLowerCase();
      postar({
        id: req.id,
        tipo: 'PROGRESSO',
        progresso: 5,
        etapa: 'Iniciando leitura do arquivo...',
      });

      let textoBruto = '';
      let textoPreHifen = '';
      let paginasLinhasLimpas: string[][] | undefined;
      let reunioesHifen: RegistroHifenizacao[] = [];
      let formato: 'pdf' | 'docx' | 'txt' = 'txt';
      let totalPaginas: number | undefined;
      let avisoOcr = false;

      if (ext === 'pdf') {
        formato = 'pdf';
        const res = await extrairTextoPdf(req.id, req.buffer, req.preferenciasHifen);
        textoBruto = res.texto;
        textoPreHifen = res.textoPreHifen;
        paginasLinhasLimpas = res.paginasLinhasLimpas;
        reunioesHifen = res.reunioesHifen;
        totalPaginas = res.totalPaginas;
        avisoOcr = res.avisoOcr;
      } else if (ext === 'docx') {
        formato = 'docx';
        postar({
          id: req.id,
          tipo: 'PROGRESSO',
          progresso: 45,
          etapa: 'Extraindo texto do documento Word...',
        });
        const res = await mammoth.extractRawText({ arrayBuffer: req.buffer });
        const brutoDocx = res.value || '';
        const resHifen = reunirPalavrasHifenizadas(brutoDocx, {
          preferenciasUsuario: req.preferenciasHifen,
        });
        textoPreHifen = resHifen.textoBruto;
        reunioesHifen = resHifen.reunioes;
        textoBruto = juntarLinhasQuebradasDeFrases(resHifen.textoTratado);
      } else {
        formato = 'txt';
        postar({
          id: req.id,
          tipo: 'PROGRESSO',
          progresso: 45,
          etapa: 'Decodificando texto UTF-8...',
        });
        const decoder = new TextDecoder('utf-8');
        const brutoTxt = decoder.decode(req.buffer);
        const resHifen = reunirPalavrasHifenizadas(brutoTxt, {
          preferenciasUsuario: req.preferenciasHifen,
        });
        textoPreHifen = resHifen.textoBruto;
        reunioesHifen = resHifen.reunioes;
        textoBruto = juntarLinhasQuebradasDeFrases(resHifen.textoTratado);
      }

      postar({
        id: req.id,
        tipo: 'PROGRESSO',
        progresso: 94,
        etapa: 'Classificando tipo de documento e separando conteúdo...',
      });

      const tipoSugerido = req.tipoPreferido || sugerirTipoDocumento(textoBruto, req.nomeArquivo);
      const textoBaseLimpo =
        tipoSugerido === 'vade_mecum' || tipoSugerido === 'lei_codigo'
          ? removerLinhasSumario(textoBruto)
          : textoBruto;
      const textoRawLimpo =
        tipoSugerido === 'vade_mecum' || tipoSugerido === 'lei_codigo'
          ? removerLinhasSumario(textoPreHifen)
          : textoPreHifen;

      const linhasTotais = textoBaseLimpo.replace(/\r\n?/g, '\n').split('\n');
      const detectadosBase = detectarSegmentosPorTipo(
        textoBaseLimpo,
        req.nomeArquivo,
        tipoSugerido,
        { preferenciasUsuario: req.preferenciasHifen }
      );
      const codigosDetectados = associarTrechosBrutos(detectadosBase, textoRawLimpo);

      postar({
        id: req.id,
        tipo: 'PROGRESSO',
        progresso: 100,
        etapa: 'Extração concluída',
      });

      postar({
        id: req.id,
        tipo: 'RESULTADO_EXTRACAO',
        textoBruto: textoBaseLimpo,
        textoPreHifen: textoRawLimpo,
        paginasLinhasLimpas,
        linhasTotais,
        formato,
        totalPaginas,
        avisoOcr,
        tipoSugerido,
        codigosDetectados,
        reunioesHifen,
      });
      return;
    }

    if (req.tipo === 'PARSEAR_CODIGOS') {
      const artigosPorCodigo: Record<string, Artigo[]> = {};
      const total = req.itens.length;

      for (let i = 0; i < total; i++) {
        const { codigoId, detectado } = req.itens[i];
        postar({
          id: req.id,
          tipo: 'PROGRESSO',
          progresso: Math.round(((i + 0.3) / Math.max(1, total)) * 90),
          etapa: `Estruturando ${detectado.nome}...`,
        });
        artigosPorCodigo[codigoId] = parseDocumentoPorTipo(
          detectado.texto,
          codigoId,
          req.tipoDocumento,
          {
            rawTextOriginal: detectado.textoRaw,
            reunioesExternas: req.reunioesHifen,
            opcoesHifen: {
              preferenciasUsuario: req.preferenciasHifen,
              overridesPorId: req.overridesPorId,
            },
          }
        );
      }

      postar({
        id: req.id,
        tipo: 'PROGRESSO',
        progresso: 100,
        etapa: 'Documento estruturado com sucesso',
      });

      postar({
        id: req.id,
        tipo: 'RESULTADO_PARSE',
        artigosPorCodigo,
      });
    }
  } catch (err) {
    postar({
      id: req.id,
      tipo: 'ERRO',
      mensagem:
        err instanceof Error
          ? err.message
          : 'Erro inesperado ao processar o arquivo no navegador.',
    });
  }
};
