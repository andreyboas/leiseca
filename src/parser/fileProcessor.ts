import type {
  Artigo,
  CodigoDetectado,
  RegistroHifenizacao,
  ResultadoExtracaoArquivo,
  TipoDocumento,
} from '@/src/types/domain';
import type { WorkerRequest, WorkerResponse } from '@/src/workers/parser.worker';
import { carregarPreferenciasHifenMapa } from './hyphenReunifier';

export interface ProgressoUpload {
  progresso: number;
  etapa: string;
}

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
  const extensao = arquivo.name.split('.').pop()?.toLowerCase();
  if (!extensao || !['pdf', 'docx', 'txt'].includes(extensao)) {
    throw new Error('Formato não suportado. Envie um arquivo PDF, DOCX ou TXT.');
  }

  const buffer = await arquivo.arrayBuffer();
  const id = `ext_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const preferenciasHifen = carregarPreferenciasHifenMapa();

  return new Promise((resolve, reject) => {
    const worker = criarWorker();

    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data;
      if (msg.id !== id) return;
      if (msg.tipo === 'PROGRESSO') {
        onProgresso?.({ progresso: msg.progresso, etapa: msg.etapa });
      } else if (msg.tipo === 'RESULTADO_EXTRACAO') {
        worker.terminate();
        resolve({
          textoBruto: msg.textoBruto,
          textoPreHifen: msg.textoPreHifen,
          paginasLinhasLimpas: msg.paginasLinhasLimpas,
          linhasTotais: msg.linhasTotais,
          nomeArquivo: arquivo.name,
          formato: msg.formato,
          totalPaginas: msg.totalPaginas,
          avisoOcr: msg.avisoOcr,
          tipoSugerido: msg.tipoSugerido,
          codigosDetectados: msg.codigosDetectados,
          reunioesHifen: msg.reunioesHifen,
        });
      } else if (msg.tipo === 'ERRO') {
        worker.terminate();
        reject(new Error(msg.mensagem));
      }
    };

    worker.onerror = (err) => {
      worker.terminate();
      reject(new Error(err.message || 'Falha no processamento em segundo plano.'));
    };

    const req: WorkerRequest = {
      id,
      tipo: 'EXTRAIR_ARQUIVO',
      nomeArquivo: arquivo.name,
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
