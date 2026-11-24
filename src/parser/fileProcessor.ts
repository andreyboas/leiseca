import type {
  Artigo,
  CodigoDetectado,
  RegistroHifenizacao,
  ResultadoExtracaoArquivo,
  TipoDocumento,
} from '@/src/types/domain';
import {
  MAX_UPLOAD_BYTES,
  sanitizarNomeArquivo,
  validarAssinaturaArquivo,
} from '@/src/utils/security';
import type { WorkerRequest, WorkerResponse } from '@/src/workers/parser.worker';
import { carregarPreferenciasHifenMapa } from './hyphenReunifier';

export interface ProgressoUpload {
  progresso: number;
  etapa: string;
}

const WORKER_TIMEOUT_MS = 120_000;

function criarWorker(): Worker {
  return new Worker(new URL('../workers/parser.worker.ts', import.meta.url), {
    type: 'module',
  });
}

export async function extrairArquivoEmWorker(
  arquivo: File,
  onProgresso?: (info: ProgressoUpload) => void,
  tipoPreferido?: TipoDocumento
): Promise<ResultadoExtracaoArquivo> {
  const nomeSeguro = sanitizarNomeArquivo(arquivo.name);
  const extensao = nomeSeguro.split('.').pop()?.toLowerCase();
  if (!extensao || !['pdf', 'docx', 'txt'].includes(extensao)) {
    throw new Error('Formato não suportado. Envie um arquivo PDF, DOCX ou TXT.');
  }
  if (arquivo.size <= 0) {
    throw new Error('O arquivo selecionado está vazio.');
  }
  if (arquivo.size > MAX_UPLOAD_BYTES) {
    throw new Error('O arquivo excede o tamanho máximo suportado (100 MB).');
  }

  const buffer = await arquivo.arrayBuffer();
  validarAssinaturaArquivo(buffer, extensao as 'pdf' | 'docx' | 'txt');

  const id = `ext_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const preferenciasHifen = carregarPreferenciasHifenMapa();

  return new Promise((resolve, reject) => {
    const worker = criarWorker();
    const timer = window.setTimeout(() => {
      worker.terminate();
      reject(new Error('Tempo limite excedido ao processar o arquivo.'));
    }, WORKER_TIMEOUT_MS);

    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data;
      if (msg.id !== id) return;
      if (msg.tipo === 'PROGRESSO') {
        onProgresso?.({ progresso: msg.progresso, etapa: msg.etapa });
      } else if (msg.tipo === 'RESULTADO_EXTRACAO') {
        window.clearTimeout(timer);
        worker.terminate();
        resolve({
          textoBruto: msg.textoBruto,
          textoPreHifen: msg.textoPreHifen,
          paginasLinhasLimpas: msg.paginasLinhasLimpas,
          linhasTotais: msg.linhasTotais,
          nomeArquivo: nomeSeguro,
          formato: msg.formato,
          totalPaginas: msg.totalPaginas,
          avisoOcr: msg.avisoOcr,
          tipoSugerido: msg.tipoSugerido,
          codigosDetectados: msg.codigosDetectados,
          reunioesHifen: msg.reunioesHifen,
        });
      } else if (msg.tipo === 'ERRO') {
        window.clearTimeout(timer);
        worker.terminate();
        reject(new Error(msg.mensagem));
      }
    };

    worker.onerror = (err) => {
      window.clearTimeout(timer);
      worker.terminate();
      reject(new Error(err.message || 'Falha no processamento em segundo plano.'));
    };

    const req: WorkerRequest = {
      id,
      tipo: 'EXTRAIR_ARQUIVO',
      nomeArquivo: nomeSeguro,
      buffer,
      tipoPreferido,
      preferenciasHifen,
    };
    worker.postMessage(req, [buffer]);
  });
}

export async function parsearCodigosEmWorker(
  itens: Array<{ codigoId: string; detectado: CodigoDetectado }>,
  tipoDocumento: TipoDocumento,
  onProgresso?: (info: ProgressoUpload) => void,
  opcoes?: {
    reunioesHifen?: RegistroHifenizacao[];
    overridesPorId?: Record<string, boolean>;
  }
): Promise<Record<string, Artigo[]>> {
  const id = `parse_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const preferenciasHifen = carregarPreferenciasHifenMapa();

  return new Promise((resolve, reject) => {
    const worker = criarWorker();

    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data;
      if (msg.id !== id) return;
      if (msg.tipo === 'PROGRESSO') {
        onProgresso?.({ progresso: msg.progresso, etapa: msg.etapa });
      } else if (msg.tipo === 'RESULTADO_PARSE') {
        worker.terminate();
        resolve(msg.artigosPorCodigo);
      } else if (msg.tipo === 'ERRO') {
        worker.terminate();
        reject(new Error(msg.mensagem));
      }
    };

    worker.onerror = (err) => {
      worker.terminate();
      reject(new Error(err.message || 'Erro ao estruturar documento no Worker.'));
    };

    const req: WorkerRequest = {
      id,
      tipo: 'PARSEAR_CODIGOS',
      tipoDocumento,
      itens,
      reunioesHifen: opcoes?.reunioesHifen,
      preferenciasHifen,
      overridesPorId: opcoes?.overridesPorId,
    };
    worker.postMessage(req);
  });
}
