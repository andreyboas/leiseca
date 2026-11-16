import type { RegistroDiarioEstudo } from '@/src/types/domain';

export const INTERVALOS_REVISAO_DIAS = [1, 3, 7, 15, 30] as const;

export function calcularProximaRevisao(repeticoes: number, baseTimestamp = Date.now()): number {
  const indice = Math.max(0, Math.min(INTERVALOS_REVISAO_DIAS.length - 1, repeticoes));
  const dias = INTERVALOS_REVISAO_DIAS[indice];
  return baseTimestamp + dias * 24 * 60 * 60 * 1000;
}

export function formatarIntervaloDias(repeticoes: number): string {
  const indice = Math.max(0, Math.min(INTERVALOS_REVISAO_DIAS.length - 1, repeticoes));
  const dias = INTERVALOS_REVISAO_DIAS[indice];
  return dias === 1 ? '1 dia' : `${dias} dias`;
}

export function calcularSequenciaDias(historico: RegistroDiarioEstudo[]): number {
  if (!historico || historico.length === 0) return 0;

  const datasAtivas = new Set(
    historico
      .filter((h) => h.artigosEstudados > 0 || h.grifosCriados > 0 || h.anotacoesCriadas > 0)
      .map((h) => h.data)
  );

  if (datasAtivas.size === 0) return 0;

  const formatarData = (d: Date) => {
    const ano = d.getFullYear();
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const dia = String(d.getDate()).padStart(2, '0');
    return `${ano}-${mes}-${dia}`;
  };

  let sequencia = 0;
  const cursor = new Date();

  // Se hoje ainda não estudou, verifica se estudou ontem para manter o streak vivo
  if (!datasAtivas.has(formatarData(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
    if (!datasAtivas.has(formatarData(cursor))) {
      return 0;
    }
  }

  while (datasAtivas.has(formatarData(cursor))) {
    sequencia += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return sequencia;
}

export interface TokenCloze {
  id: string;
  texto: string;
  ocultavel: boolean;
}

const PALAVRAS_CHAVE_JURIDICAS = new Set([
  'vedado',
  'vedada',
  'proibido',
  'proibida',
  'salvo',
  'exceto',
  'sempre',
  'nunca',
  'ninguém',
  'imprescritível',
  'inalienável',
  'inafiançável',
  'insuscetível',
  'imediata',
  'obrigatório',
  'obrigatória',
  'facultativo',
  'facultativa',
  'dolo',
  'culpa',
  'reclusão',
  'detenção',
  'multa',
  'flagrante',
  'desastre',
  'socorro',
  'unânime',
  'absoluta',
  'relativa',
  'nulo',
  'anulável',
  'decadência',
  'prescrição',
  'competência',
  'privativa',
  'exclusiva',
  'concorrente',
  'comum',
  'soberania',
  'cidadania',
  'dignidade',
]);

/**
 * Tokeniza um trecho de artigo para o Modo Memorização (Cloze / Lacunas),
 * identificando prazos, números, percentuais, frações e termos jurídicos-chave.
 */
export function gerarTokensMemorizacao(texto: string, prefixoId: string): TokenCloze[] {
  const partes = texto.split(/(\s+)/);
  return partes.map((parte, idx) => {
    if (/^\s+$/.test(parte) || !parte) {
      return { id: `${prefixoId}_${idx}`, texto: parte, ocultavel: false };
    }

    const limpa = parte.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '').toLowerCase();
    const ehNumeroOuPrazo =
      /^\d+(?:[.,]\d+)?%?$/.test(limpa) ||
      /^(?:um|dois|três|quatro|cinco|seis|sete|oito|nove|dez|quinze|vinte|trinta|sessenta|noventa|cento|dias|meses|anos|horas|terço|terços|sexto|metade|dobro|quintos)$/.test(
        limpa
      );
    const ehPalavraChave = PALAVRAS_CHAVE_JURIDICAS.has(limpa);

    return {
      id: `${prefixoId}_${idx}`,
      texto: parte,
      ocultavel: ehNumeroOuPrazo || ehPalavraChave,
    };
  });
}

export function formatarDataBR(timestamp: number): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(timestamp));
}

export function formatarDataHoraBR(timestamp: number): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

export const ROTULOS_TIPO_DOCUMENTO: Record<
  import('@/src/types/domain').TipoDocumento,
  string
> = {
  vade_mecum: 'Vade Mecum',
  lei_codigo: 'Lei / Código avulso',
  jurisprudencia: 'Jurisprudência / Informativo',
  sumula: 'Súmulas',
  doutrina: 'Doutrina / Apostila / Resumo',
  outro: 'Outro documento',
};

export function formatarRotuloUnidade(
  artigo: Pick<
    import('@/src/types/domain').Artigo,
    'numero' | 'tipoUnidade' | 'epigrafe' | 'subtipoMeta'
  >,
  opcoes?: { curto?: boolean }
): string {
  const tipo = artigo.tipoUnidade || 'artigo';
  if (tipo === 'artigo') {
    return `Art. ${artigo.numero}`;
  }
  if (tipo === 'sumula') {
    const trib = artigo.subtipoMeta?.tribunal ? ` (${artigo.subtipoMeta.tribunal})` : '';
    return `Súmula ${artigo.numero}${opcoes?.curto ? '' : trib}`;
  }
  if (tipo === 'decisao') {
    if (opcoes?.curto) {
      return artigo.subtipoMeta?.numeroProcesso || `Decisão ${artigo.numero}`;
    }
    const partes = [
      artigo.subtipoMeta?.tribunal,
      artigo.subtipoMeta?.numeroProcesso || `Decisão ${artigo.numero}`,
    ].filter(Boolean);
    return partes.join(' · ');
  }
  // secao (doutrina/apostila/outro)
  if (opcoes?.curto) {
    return artigo.epigrafe || `Seção ${artigo.numero}`;
  }
  return artigo.epigrafe ? `${artigo.numero}. ${artigo.epigrafe}` : `Seção ${artigo.numero}`;
}

export function formatarContagemUnidades(
  total: number,
  tipoDocumento?: import('@/src/types/domain').TipoDocumento
): string {
  if (tipoDocumento === 'jurisprudencia') {
    return `${total} ${total === 1 ? 'decisão' : 'decisões'}`;
  }
  if (tipoDocumento === 'sumula') {
    return `${total} ${total === 1 ? 'súmula' : 'súmulas'}`;
  }
  if (tipoDocumento === 'doutrina' || tipoDocumento === 'outro') {
    return `${total} ${total === 1 ? 'seção' : 'seções'}`;
  }
  return `${total} ${total === 1 ? 'artigo' : 'artigos'}`;
}

