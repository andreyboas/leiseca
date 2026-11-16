import Dexie, { type Table } from 'dexie';
import type {
  Anotacao,
  Artigo,
  BackupCompleto,
  Codigo,
  Colecao,
  ConfiguracaoUsuario,
  CorConfig,
  Grifo,
  Pasta,
  Progresso,
  Tag,
  TemaLeitura,
  TipoDocumento,
} from '@/src/types/domain';

export const CORES_PADRAO: CorConfig[] = [
  {
    id: 'amarelo',
    nome: 'Amarelo',
    significado: 'Importante / Regra geral',
    hexBg: '#fef08a',
    hexBgDark: 'rgba(234, 179, 8, 0.32)',
    hexBorder: '#eab308',
    atalho: '1',
  },
  {
    id: 'verde',
    nome: 'Verde',
    significado: 'Decorar / Palavra-chave',
    hexBg: '#bbf7d0',
    hexBgDark: 'rgba(34, 197, 94, 0.28)',
    hexBorder: '#16a34a',
    atalho: '2',
  },
  {
    id: 'azul',
    nome: 'Azul',
    significado: 'Prazos, números e competência',
    hexBg: '#bae6fd',
    hexBgDark: 'rgba(56, 189, 248, 0.28)',
    hexBorder: '#0284c7',
    atalho: '3',
  },
  {
    id: 'rosa',
    nome: 'Rosa',
    significado: 'Pegadinha / Exceção de prova',
    hexBg: '#fecdd3',
    hexBgDark: 'rgba(244, 63, 94, 0.28)',
    hexBorder: '#e11d48',
    atalho: '4',
  },
  {
    id: 'laranja',
    nome: 'Laranja',
    significado: 'Jurisprudência / Súmula',
    hexBg: '#fed7aa',
    hexBgDark: 'rgba(249, 115, 22, 0.3)',
    hexBorder: '#ea580c',
    atalho: '5',
  },
];

export function detectarTemaSistemaInicial(): TemaLeitura {
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'escuro' : 'claro';
  }
  return 'claro';
}

export const CONFIGURACAO_PADRAO: ConfiguracaoUsuario = {
  id: 'default',
  cores: CORES_PADRAO,
  preferencias: {
    tema: 'claro',
    familiaFonte: 'serif',
    tamanhoFonte: 19,
    espacamentoLinha: 1.75,
    modoVisualizacao: 'foco',
    ocultarRemissoes: false,
    sidebarPrincipalRecolhida: false,
    sidebarPrincipalLargura: 256,
    sidebarLeitorAberta: true,
    sidebarLeitorLargura: 312,
    painelNotasAberto: true,
    painelNotasLargura: 360,
    modoFocoTotal: false,
  },
  metaDiariaArtigos: 15,
  tutorialConcluido: false,
  historicoDiario: [],
  atualizadoEm: Date.now(),
};

export const ID_PASTAS_RAIZ = {
  vade_mecum: 'pasta_raiz_vade_mecum',
  lei_codigo: 'pasta_raiz_vade_mecum',
  jurisprudencia: 'pasta_raiz_jurisprudencia',
  sumula: 'pasta_raiz_sumulas',
  doutrina: 'pasta_raiz_doutrina',
  outro: 'pasta_raiz_meus_arquivos',
} as const;

export const PASTAS_RAIZ_DEFINICOES: Array<{
  id: string;
  nome: string;
  tipoSistema: TipoDocumento;
  ordem: number;
}> = [
  {
    id: ID_PASTAS_RAIZ.vade_mecum,
    nome: 'Vade Mecum',
    tipoSistema: 'vade_mecum',
    ordem: 0,
  },
  {
    id: ID_PASTAS_RAIZ.jurisprudencia,
    nome: 'Jurisprudência',
    tipoSistema: 'jurisprudencia',
    ordem: 1,
  },
  {
    id: ID_PASTAS_RAIZ.sumula,
    nome: 'Súmulas',
    tipoSistema: 'sumula',
    ordem: 2,
  },
  {
    id: ID_PASTAS_RAIZ.doutrina,
    nome: 'Doutrina',
    tipoSistema: 'doutrina',
    ordem: 3,
  },
  {
    id: ID_PASTAS_RAIZ.outro,
    nome: 'Meus Arquivos',
    tipoSistema: 'outro',
    ordem: 4,
  },
];

const NOME_BANCO_ATUAL = 'LeiSecaEstudoDB';
const CHAVE_MIGRACAO_LEGADA = 'leiseca_migracao_db_ok';

export class LeiSecaDatabase extends Dexie {
  pastas!: Table<Pasta, string>;
  codigos!: Table<Codigo, string>;
  artigos!: Table<Artigo, string>;
  grifos!: Table<Grifo, string>;
  anotacoes!: Table<Anotacao, string>;
  tags!: Table<Tag, string>;
  colecoes!: Table<Colecao, string>;
  progressos!: Table<Progresso, string>;
  configuracoes!: Table<ConfiguracaoUsuario, string>;

  constructor() {
    super(NOME_BANCO_ATUAL);
    this.version(1).stores({
      codigos: 'id, sigla, ordem, atualizadoEm',
      artigos: 'id, codigoId, [codigoId+ordem], numero, numeroSort, favorito',
      grifos: 'id, codigoId, artigoId, [artigoId+blocoId], corId, criadoEm',
      anotacoes: 'id, codigoId, artigoId, grifoId, corId, *tags, atualizadoEm',
      tags: 'id, &nome',
      colecoes: 'id, nome, atualizadoEm',
      progressos: 'id, artigoId, codigoId, status, proximaRevisaoEm, acessadoEm',
      configuracoes: 'id',
    });

    this.version(2)
      .stores({
        pastas: 'id, parentId, tipoSistema, ordem',
        codigos: 'id, pastaId, tipoDocumento, sigla, ordem, atualizadoEm',
        artigos: 'id, codigoId, [codigoId+ordem], numero, numeroSort, favorito',
        grifos: 'id, codigoId, artigoId, [artigoId+blocoId], corId, criadoEm',
        anotacoes: 'id, codigoId, artigoId, grifoId, corId, *tags, atualizadoEm',
        tags: 'id, &nome',
        colecoes: 'id, nome, atualizadoEm',
        progressos: 'id, artigoId, codigoId, status, proximaRevisaoEm, acessadoEm',
        configuracoes: 'id',
      })
      .upgrade(async (tx) => {
        const agora = Date.now();
        const pastaTable = tx.table<Pasta, string>('pastas');
        for (const def of PASTAS_RAIZ_DEFINICOES) {
          const existe = await pastaTable.get(def.id);
          if (!existe) {
            await pastaTable.put({
              id: def.id,
              nome: def.nome,
              parentId: null,
              tipoSistema: def.tipoSistema,
              fixa: true,
              ordem: def.ordem,
              criadoEm: agora,
              atualizadoEm: agora,
            });
          }
        }

        const codigosTable = tx.table<Codigo, string>('codigos');
        await codigosTable.toCollection().modify((cod) => {
          if (!cod.pastaId) cod.pastaId = ID_PASTAS_RAIZ.vade_mecum;
          if (!cod.tipoDocumento) cod.tipoDocumento = 'lei_codigo';
        });
      });

    this.version(3)
      .stores({
        pastas: 'id, parentId, tipoSistema, ordem',
        codigos: 'id, pastaId, tipoDocumento, sigla, ordem, atualizadoEm',
        artigos: 'id, codigoId, [codigoId+ordem], numero, numeroSort, favorito',
        grifos: 'id, codigoId, artigoId, [artigoId+blocoId], corId, criadoEm',
        anotacoes: 'id, codigoId, artigoId, grifoId, corId, *tags, atualizadoEm',
        tags: 'id, &nome',
        colecoes: 'id, nome, atualizadoEm',
        progressos: 'id, artigoId, codigoId, status, proximaRevisaoEm, acessadoEm',
        configuracoes: 'id',
      })
      .upgrade(async (tx) => {
        const cfgTable = tx.table<ConfiguracaoUsuario, string>('configuracoes');
        const atual = await cfgTable.get('default');
        if (atual?.preferencias) {
          const novoTamanho =
            atual.preferencias.tamanhoFonte === 17 ? 19 : atual.preferencias.tamanhoFonte;
          await cfgTable.update('default', {
            preferencias: {
              ...atual.preferencias,
              tamanhoFonte: novoTamanho,
              painelNotasLargura: atual.preferencias.painelNotasLargura ?? 360,
            },
            atualizadoEm: Date.now(),
          });
        }
      });
  }
}

export const db = new LeiSecaDatabase();

let migracaoEmAndamento: Promise<void> | null = null;

export async function migrarBancoLegado(): Promise<void> {
  if (typeof window === 'undefined' || typeof indexedDB === 'undefined') return;
  try {
    if (localStorage.getItem(CHAVE_MIGRACAO_LEGADA) === '1') return;
  } catch {
    // Segue sem localStorage
  }

  if (migracaoEmAndamento) return migracaoEmAndamento;

  migracaoEmAndamento = (async () => {
    try {
      const codigosAtuais = await db.codigos.count();
      if (codigosAtuais > 0) {
        try {
          localStorage.setItem(CHAVE_MIGRACAO_LEGADA, '1');
        } catch {
          // noop
        }
        return;
      }

      if (typeof indexedDB.databases !== 'function') return;
      const bancos = await indexedDB.databases();
      const legadoInfo = bancos.find(
        (b) => b.name && b.name !== NOME_BANCO_ATUAL && /LeiSecaDB$/i.test(b.name)
      );
      if (!legadoInfo?.name) {
        try {
          localStorage.setItem(CHAVE_MIGRACAO_LEGADA, '1');
        } catch {
          // noop
        }
        return;
      }

      const legadoDb = new Dexie(legadoInfo.name);
      await legadoDb.open();
      try {
        const nomesTabelas = new Set(legadoDb.tables.map((t) => t.name));
        const lerTabela = async <T>(nome: string): Promise<T[]> =>
          nomesTabelas.has(nome) ? ((await legadoDb.table(nome).toArray()) as T[]) : [];

        const [
          pastas,
          codigos,
          artigos,
          grifos,
          anotacoes,
          tags,
          colecoes,
          progressos,
          configuracoes,
        ] = await Promise.all([
          lerTabela<Pasta>('pastas'),
          lerTabela<Codigo>('codigos'),
          lerTabela<Artigo>('artigos'),
          lerTabela<Grifo>('grifos'),
          lerTabela<Anotacao>('anotacoes'),
          lerTabela<Tag>('tags'),
          lerTabela<Colecao>('colecoes'),
          lerTabela<Progresso>('progressos'),
          lerTabela<ConfiguracaoUsuario>('configuracoes'),
        ]);

        if (codigos.length > 0 || configuracoes.length > 0) {
          await db.transaction(
            'rw',
            [
              db.pastas,
              db.codigos,
              db.artigos,
              db.grifos,
              db.anotacoes,
              db.tags,
              db.colecoes,
              db.progressos,
              db.configuracoes,
            ],
            async () => {
              if (pastas.length) await db.pastas.bulkPut(pastas);
              if (codigos.length) await db.codigos.bulkPut(codigos);
              if (artigos.length) await db.artigos.bulkPut(artigos);
              if (grifos.length) await db.grifos.bulkPut(grifos);
              if (anotacoes.length) await db.anotacoes.bulkPut(anotacoes);
              if (tags.length) await db.tags.bulkPut(tags);
              if (colecoes.length) await db.colecoes.bulkPut(colecoes);
              if (progressos.length) await db.progressos.bulkPut(progressos);
              if (configuracoes.length) {
                const normalizadas = configuracoes.map((c) => ({
                  ...c,
                  preferencias: {
                    ...CONFIGURACAO_PADRAO.preferencias,
                    ...(c.preferencias || {}),
                    tamanhoFonte:
                      c.preferencias?.tamanhoFonte === 17
                        ? 19
                        : c.preferencias?.tamanhoFonte ?? 19,
                  },
                }));
                await db.configuracoes.bulkPut(normalizadas);
              }
            }
          );
        }
      } finally {
        legadoDb.close();
      }

      try {
        localStorage.setItem(CHAVE_MIGRACAO_LEGADA, '1');
      } catch {
        // noop
      }
    } catch (err) {
      console.warn('Falha ao verificar banco legado IndexedDB:', err);
    }
  })();

  return migracaoEmAndamento;
}

export async function garantirPastasRaiz(): Promise<Pasta[]> {
  const agora = Date.now();
  const existentes = await db.pastas.toArray();
  const mapa = new Map(existentes.map((p) => [p.id, p]));
  const faltantes: Pasta[] = [];

  for (const def of PASTAS_RAIZ_DEFINICOES) {
    if (!mapa.has(def.id)) {
      faltantes.push({
        id: def.id,
        nome: def.nome,
        parentId: null,
        tipoSistema: def.tipoSistema,
        fixa: true,
        ordem: def.ordem,
        criadoEm: agora,
        atualizadoEm: agora,
      });
    }
  }

  if (faltantes.length > 0) {
    await db.pastas.bulkPut(faltantes);
    return [...existentes, ...faltantes].sort((a, b) => a.ordem - b.ordem);
  }
  return existentes.sort((a, b) => a.ordem - b.ordem);
}

export async function garantirConfiguracaoInicial(): Promise<ConfiguracaoUsuario> {
  await migrarBancoLegado();
  await garantirPastasRaiz();
  const existente = await db.configuracoes.get('default');
  if (existente) {
    const mesclada: ConfiguracaoUsuario = {
      ...CONFIGURACAO_PADRAO,
      ...existente,
      preferencias: {
        ...CONFIGURACAO_PADRAO.preferencias,
        ...(existente.preferencias || {}),
      },
    };
    return mesclada;
  }
  const temaInicial = detectarTemaSistemaInicial();
  const nova: ConfiguracaoUsuario = {
    ...CONFIGURACAO_PADRAO,
    preferencias: {
      ...CONFIGURACAO_PADRAO.preferencias,
      tema: temaInicial,
    },
    atualizadoEm: Date.now(),
  };
  await db.configuracoes.put(nova);
  return nova;
}

export function obterDataHojeISO(): string {
  const agora = new Date();
  const ano = agora.getFullYear();
  const mes = String(agora.getMonth() + 1).padStart(2, '0');
  const dia = String(agora.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

export async function registrarAtividadeDiaria(tipo: 'artigo' | 'grifo' | 'anotacao'): Promise<void> {
  const cfg = await garantirConfiguracaoInicial();
  const hoje = obterDataHojeISO();
  const historico = [...(cfg.historicoDiario || [])];
  let idx = historico.findIndex((h) => h.data === hoje);
  if (idx === -1) {
    historico.push({
      data: hoje,
      artigosEstudados: 0,
      grifosCriados: 0,
      anotacoesCriadas: 0,
    });
    idx = historico.length - 1;
  }
  const item = { ...historico[idx] };
  if (tipo === 'artigo') item.artigosEstudados += 1;
  if (tipo === 'grifo') item.grifosCriados += 1;
  if (tipo === 'anotacao') item.anotacoesCriadas += 1;
  historico[idx] = item;

  await db.configuracoes.update('default', {
    historicoDiario: historico.slice(-90),
    atualizadoEm: Date.now(),
  });
}

export async function exportarBackupCompleto(): Promise<BackupCompleto> {
  const [pastas, codigos, artigos, grifos, anotacoes, tags, colecoes, progressos, configuracao] =
    await Promise.all([
      db.pastas.toArray(),
      db.codigos.toArray(),
      db.artigos.toArray(),
      db.grifos.toArray(),
      db.anotacoes.toArray(),
      db.tags.toArray(),
      db.colecoes.toArray(),
      db.progressos.toArray(),
      db.configuracoes.get('default'),
    ]);

  return {
    versaoSchema: 3,
    exportadoEm: Date.now(),
    aplicacao: 'lei-seca',
    pastas,
    codigos,
    artigos,
    grifos,
    anotacoes,
    tags,
    colecoes,
    progressos,
    configuracao,
  };
}

export async function importarBackupCompleto(
  payload: BackupCompleto,
  modo: 'mesclar' | 'substituir' = 'mesclar'
): Promise<{ codigosImportados: number; artigosImportados: number }> {
  const estruturaValida =
    !!payload &&
    Array.isArray(payload.codigos) &&
    Array.isArray(payload.artigos) &&
    (payload.aplicacao === 'lei-seca' || typeof payload.versaoSchema === 'number');

  if (!estruturaValida) {
    throw new Error('Arquivo de backup inválido ou incompatível com o Lei Seca.');
  }

  await db.transaction(
    'rw',
    [db.pastas, db.codigos, db.artigos, db.grifos, db.anotacoes, db.tags, db.colecoes, db.progressos, db.configuracoes],
    async () => {
      if (modo === 'substituir') {
        await Promise.all([
          db.pastas.clear(),
          db.codigos.clear(),
          db.artigos.clear(),
          db.grifos.clear(),
          db.anotacoes.clear(),
          db.tags.clear(),
          db.colecoes.clear(),
          db.progressos.clear(),
        ]);
      }

      if (payload.pastas?.length) await db.pastas.bulkPut(payload.pastas);
      if (payload.codigos.length) {
        const codsNormalizados = payload.codigos.map((c) => ({
          ...c,
          pastaId: c.pastaId || ID_PASTAS_RAIZ.vade_mecum,
          tipoDocumento: c.tipoDocumento || 'lei_codigo',
        }));
        await db.codigos.bulkPut(codsNormalizados);
      }
      if (payload.artigos.length) await db.artigos.bulkPut(payload.artigos);
      if (payload.grifos.length) await db.grifos.bulkPut(payload.grifos);
      if (payload.anotacoes.length) await db.anotacoes.bulkPut(payload.anotacoes);
      if (payload.tags.length) await db.tags.bulkPut(payload.tags);
      if (payload.colecoes.length) await db.colecoes.bulkPut(payload.colecoes);
      if (payload.progressos.length) await db.progressos.bulkPut(payload.progressos);
      if (payload.configuracao && modo === 'substituir') {
        await db.configuracoes.put(payload.configuracao);
      }
    }
  );

  await garantirPastasRaiz();

  return {
    codigosImportados: payload.codigos.length,
    artigosImportados: payload.artigos.length,
  };
}
