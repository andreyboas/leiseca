import type { BackupCompleto } from '@/src/types/domain';
import { exportarBackupCompleto, importarBackupCompleto } from './database';

/**
 * Contrato preparado para sincronização futura com back-end
 * (Supabase, Firebase Firestore ou API Node.js + PostgreSQL).
 * No modo local-first padrão, utiliza exclusivamente o IndexedDB local.
 */
export interface ISyncAdapter {
  readonly nome: string;
  enviarAlteracoes(payload: BackupCompleto): Promise<{ sincronizadoEm: number }>;
  baixarAlteracoes(): Promise<BackupCompleto | null>;
}

export class LocalOnlySyncAdapter implements ISyncAdapter {
  readonly nome = 'Local-First (IndexedDB)';

  async enviarAlteracoes(payload: BackupCompleto): Promise<{ sincronizadoEm: number }> {
    return { sincronizadoEm: payload.exportadoEm };
  }

  async baixarAlteracoes(): Promise<BackupCompleto | null> {
    return exportarBackupCompleto();
  }
}

export async function sincronizarComAdaptador(adapter: ISyncAdapter): Promise<void> {
  const local = await exportarBackupCompleto();
  await adapter.enviarAlteracoes(local);
  const remoto = await adapter.baixarAlteracoes();
  if (remoto && remoto.exportadoEm > local.exportadoEm) {
    await importarBackupCompleto(remoto, 'mesclar');
  }
}
