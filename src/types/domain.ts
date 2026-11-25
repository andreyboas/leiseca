export type TemaLeitura = 'claro' | 'escuro' | 'sepia';
export type FamiliaFonte = 'sans' | 'serif';
export type ModoVisualizacao = 'foco' | 'lista';
export type StatusEstudo = 'nao_estudado' | 'estudado' | 'revisar' | 'dominado';

export type TipoDocumento =
  | 'vade_mecum'
  | 'lei_codigo'
  | 'jurisprudencia'
  | 'sumula'
  | 'doutrina'
  | 'outro';

export type TipoUnidade = 'artigo' | 'decisao' | 'sumula' | 'secao';

export type TipoBloco =
  | 'caput'
  | 'paragrafo'
  | 'inciso'
  | 'alinea'
  | 'item';

export interface Pasta {
  id: string;
  nome: string;
  parentId: string | null;
  tipoSistema?: TipoDocumento;
  fixa?: boolean;
  ordem: number;
  criadoEm: number;
  atualizadoEm: number;
}

export interface HierarquiaPath {
  parte?: string;
  livro?: string;
  titulo?: string;
  capitulo?: string;
  secao?: string;
  subsecao?: string;
}

export interface BlocoArtigo {
  id: string;
  tipo: TipoBloco;
  rotulo: string; // Ex.: "Caput", "§ 1º", "Parágrafo único", "I", "a)", "1.", "Ementa", "Tese"
  texto: string; // Texto literal preservado na íntegra
  nivel: number; // 0: caput/§, 1: inciso, 2: alínea, 3: item
}

export interface SubtipoMetadados {
  tribunal?: string;
  numeroProcesso?: string;
  relator?: string;
  dataJulgamento?: string;
  ementa?: string;
  tese?: string;
  situacao?: string;
}

export interface RegistroHifenizacao {
  id: string;
  antesEsquerda: string;
  antesDireita: string;
  originalComQuebra: string;
  palavraFinal: string;
  hifenRemovido: boolean;
  regraAplicada: 'usuario' | 'a' | 'b' | 'c' | 'd' | 'e';
  duvida: boolean;
  linha: number;
  pagina?: number;
}

export interface PreferenciaHifen {
  chave: string; // `${esquerda.toLowerCase()}|${direita.toLowerCase()}`
  esquerda: string;
  direita: string;
  manterHifen: boolean;
  atualizadoEm: number;
}

export interface Codigo {
  id: string;
  nome: string;
  sigla: string;
  pastaId?: string;
  tipoDocumento?: TipoDocumento;
  descricao?: string;
  fonteArquivo?: string;
  textoBrutoOriginal?: string;
  hifenizacaoVersao?: number;
  totalArtigos: number;
  ordem: number;
  criadoEm: number;
  atualizadoEm: number;
  syncVersion: number;
}

export interface Artigo {
  id: string;
  codigoId: string;
  numero: string; // Ex.: "1º", "5º-A", "121", "121-A", "1.015", ou nº da súmula/decisão/seção
  numeroSort: number;
  ordem: number;
  tipoUnidade?: TipoUnidade;
  subtipoMeta?: SubtipoMetadados;
  hierarquia: HierarquiaPath;
  epigrafe?: string;
  blocos: BlocoArtigo[];
  textoIntegral: string;
  rawText?: string;
  text?: string;
  reunioesHifen?: RegistroHifenizacao[];
  favorito: boolean;
  atualizadoEm: number;
}

export interface Grifo {
  id: string;
  codigoId: string;
  artigoId: string;
  blocoId: string;
  corId: string;
  inicio: number;
  fim: number;
  trecho: string;
  contextoAntes: string;
  contextoDepois: string;
  criadoEm: number;
  atualizadoEm: number;
}

export interface Anotacao {
  id: string;
  codigoId: string;
  artigoId: string;
  blocoId?: string;
  grifoId?: string;
  inicio?: number;
  fim?: number;
  trechoSelecionado?: string;
  conteudoHtml: string;
  conteudoTexto: string;
  jurisprudencia?: string;
  tags: string[];
  corId?: string;
  criadoEm: number;
  atualizadoEm: number;
}

export interface Tag {
  id: string;
  nome: string;
  criadoEm: number;
}

export interface Colecao {
  id: string;
  nome: string;
  descricao?: string;
  artigoIds: string[];
  criadoEm: number;
  atualizadoEm: number;
}

export interface Progresso {
  id: string; // igual a artigoId
  artigoId: string;
  codigoId: string;
  status: StatusEstudo;
  repeticoes: number; // 0..4 => intervalos [1, 3, 7, 15, 30] dias
  proximaRevisaoEm?: number;
  ultimaRevisaoEm?: number;
  acessadoEm: number;
}

export interface CorConfig {
  id: string;
  nome: string;
  significado: string;
  hexBg: string;
  hexBgDark: string;
  hexBorder: string;
  atalho: string; // '1'..'5' ou '' para marcadores personalizados
  personalizada?: boolean;
}

export interface PreferenciasLeitura {
  tema: TemaLeitura;
  familiaFonte: FamiliaFonte;
  tamanhoFonte: number; // px (16..26)
  escalaFonteInterface?: number; // % global da interface (100..135)
  espacamentoLinha: number; // 1.4..2.1
  modoVisualizacao: ModoVisualizacao;
  ocultarRemissoes: boolean;
  sidebarPrincipalRecolhida?: boolean;
  sidebarPrincipalLargura?: number;
  sidebarLeitorAberta?: boolean;
  sidebarLeitorLargura?: number;
  painelNotasAberto?: boolean;
  painelNotasLargura?: number;
  modoFocoTotal?: boolean;
}

export interface RegistroDiarioEstudo {
  data: string; // YYYY-MM-DD
  artigosEstudados: number;
  grifosCriados: number;
  anotacoesCriadas: number;
}

export interface ConfiguracaoUsuario {
  id: string; // 'default'
  cores: CorConfig[];
  preferencias: PreferenciasLeitura;
  metaDiariaArtigos: number;
  ultimoCodigoId?: string;
  ultimoArtigoId?: string;
  tutorialConcluido: boolean;
  historicoDiario: RegistroDiarioEstudo[];
  atualizadoEm: number;
}

export interface CodigoDetectado {
  idTemp: string;
  nome: string;
  sigla: string;
  texto: string;
  textoRaw?: string;
  artigosEstimados: number;
  linhaInicio: number;
  linhaFim: number;
}

export interface ResultadoExtracaoArquivo {
  textoBruto: string;
  textoPreHifen?: string;
  paginasLinhasLimpas?: string[][];
  linhasTotais: string[];
  nomeArquivo: string;
  formato: 'pdf' | 'docx' | 'txt';
  totalPaginas?: number;
  avisoOcr?: boolean;
  tipoSugerido: TipoDocumento;
  codigosDetectados: CodigoDetectado[];
  reunioesHifen?: RegistroHifenizacao[];
}

export interface BackupCompleto {
  versaoSchema: number;
  exportadoEm: number;
  aplicacao: 'lei-seca';
  pastas?: Pasta[];
  codigos: Codigo[];
  artigos: Artigo[];
  grifos: Grifo[];
  anotacoes: Anotacao[];
  tags: Tag[];
  colecoes: Colecao[];
  progressos: Progresso[];
  configuracao?: ConfiguracaoUsuario;
}
