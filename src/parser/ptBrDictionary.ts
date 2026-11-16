import {
  COMPOSTOS_EXCECOES_SET,
  PREFIXOS_HIFEN_SET,
  PRONOMES_ENCLITICOS_SET,
} from './hyphenExceptions';

/**
 * Dicionário offline enxuto de Português Jurídico e Vocabulário Geral (pt-BR)
 * usado como critério lexical na desambiguação de hífens (Regra d) e proteção contra
 * falsos positivos em prefixos que coincidem com sílabas iniciais (ex.: "contra-to", "ex-clusivo").
 */
const PALAVRAS_BASE_PT_BR = `
a o e em de da do das dos na no nas nos por para com sem sob sobre entre contra ate após
lei decreto codigo código artigo paragrafo parágrafo inciso alinea alínea item estatuto regimento
constituicao constituição emenda norma resolucao resolução portaria medida provisoria provisória
republica república federativa uniao união estado estados municipio municipios município municípios distrito federal
poder poderes legislativo executivo judiciario judiciário ministerio ministério publico público defensoria advocacia
independente independentes harmonico harmonicos harmônico harmônicos soberania cidadania dignidade
pessoa pessoas natural juridica jurídica fisica física incapaz incapazes capaz capazes personalidade
direito direitos garantia garantias dever deveres obrigacao obrigação obrigacoes obrigações
sociedade livre justa solidaria solidária desenvolvimento nacional erradicar pobreza marginalizacao marginalização
desigualdade desigualdades regional regionais promover bem todos preconceito origem raca raça sexo cor idade
relacao relação internacional internacionais principio principios princípio princípios fundamento fundamentos
igualdade liberdade seguranca segurança propriedade vida saude saúde educacao educação alimentacao alimentação
trabalho moradia transporte lazer previdencia previdência social protecao proteção maternidade infancia infância
assistencia assistência desamparado desamparados administracao administração direta indireta autarquia fundacao fundação
empresa publica pública economia mista legalidade impessoalidade moralidade publicidade eficiencia eficiência
cargo cargos emprego empregos funcao funções função servidor servidores concurso provimento efetivo comissao comissão
nomeacao nomeação exoneracao exoneração aposentadoria estabilidade vencimento vencimentos remuneracao remuneração
processo procedimento processo judicial administrativo inquerito inquérito acao ação recurso recursos agravo
apelacao apelação embargo embargos mandado seguranca segurança habeas corpus data injuncao injunção
competencia competência jurisdicao jurisdição juiz juizes juízes tribunal tribunais supremo superior magistrado
sentenca sentença acordao acórdão decisao decisão interlocutoria interlocutória despacho liminar tutela cautelar
prova provas testemunha pericia perícia documento documental confissao confissão citacao citação intimacao intimação
prazo prazos prescricao prescrição decadencia decadência preclusao preclusão nulidade anulabilidade
crime crimes delito delitos contravencao contravenção pena penas reclusao reclusão detencao detenção prisao prisão
multa culpabilidade ilicitude tipicidade dolo culpa doloso culposo tentativa consumado consumacao consumação
homicidio homicídio lesao lesão corporal furto roubo extorsao extorsão estelionato apropriacao apropriação
corrupcao corrupção peculato prevaricacao prevaricação concussao concussão calunia calúnia difamacao difamação injuria injúria
contrato contratos obrigacao obrigações compra venda doacao doação locacao locação emprestimo empréstimo mutuo mútuo
comodato deposito depósito mandato fianca fiança hipoteca penhor anticrese posse propriedade usufruto servidao servidão
familia família casamento uniao união estavel estável divorcio divórcio filiacao filiação alimentos guarda tutela curatela
sucessao sucessão heranca herança inventario inventário partilha testamento legado herdeiro legatario legatário
consumidor fornecedor produto servico serviço vicio vício defeito responsabilidade objetiva subjetiva solidaria solidária
tributo tributos imposto impostos taxa taxas contribuicao contribuição melhoria emprestimo empréstimo compulsorio compulsório
fato gerador lancamento lançamento credito crédito tributario tributário isencao isenção imunidade anistia remissao remissão
empregado empregador salario salário ferias férias aviso previo prévio rescisao rescisão justa causa greve sindicato
sempre nunca antes depois agora logo apenas somente inclusive exclusivo exclusiva exclusivamente
executivo executiva executar execucao execução extensao extensão extenso extensa extinto extinta extinguir
contrato contratar contratual contraente contrair contrario contrário contrariedade contrapor
anterior anteriores posterior posteriores interior interno interna internacional internacionais
antigo antiga antigos antigas antecipado antecipada antecipacao antecipação antecipar
autoridade autoridades autorizacao autorização autorizar autonomo autônomo autonomia autoral autoria
autoctone autóctone automovel automóvel automatico automático automatica automática autopsia autópsia
submetido submetida submeter submissao submissão subalterno subordinado subordinada subvencao subvenção
substituto substituta substituicao substituição substancial subscricao subscrição subscrever subsistir
superior superiores superficie superfície superveniente superveniência superacao superação superar
ministro ministra ministerio ministério minimo mínimo minima mínima minoritario minoritário minoria minucia minúcia
proximo próximo proxima próxima aproximado aproximar proximo
previo prévio previa prévia previamente previsao previsão previsto prevista prever prevenir preventivo
prejudicial pretexto preambulo preâmbulo preceito preceitos precario precário preciso precisa precisao precisão
posse posses possuir possui possuidor possuido possuído possivel possível possivelmente possibilidade
fosse fossem tivesse tivessem estivesse estivessem houvesse houvessem pudesse pudessem quisesse quisessem
soubesse soubessem dissesse dissessem fizesse fizessem trouxesse coubesse parecesse merecesse
interesse interesses interessar interessado classe classes massa passo passos passe passar passado
nosso nossa nossos nossas vosso vossa posso possa possam
disse disseram disposicao disposição dispor dispoe dispõe disponivel disponível dispositivo
considera considerar consideracao consideração constituir constitui constituem constituido constituído
constitucional constitucionais inconstitucional inconstitucionais constitucionalidade
compreender compreende compreensao compreensão comissao comissão cometer comete cometido cometida
comum comuns comunidade comunicacao comunicação comunicar conforme conformidade
requerer requer requerido requerida requisito requisitos requerimento
fundamental fundamentais objetivo objetivos finalidade finalidades realizacao realização realizar
efetivo efetiva efetividade eficacia eficácia vigencia vigência vigente vigora vigorar
aplicar aplica aplicam aplicacao aplicação aplicavel aplicável aplicabilidade
estabelecer estabelece estabelecem estabelecido estabelecida estabelecimento
reconhecer reconhece reconhecido reconhecida reconhecimento
permanecer permanece permanente permanencia permanência
transcorrer transcorre transcurso transcorrido
incorrer incorre incorrido recorrer recorre recurso recorrido
comparecer comparece comparecimento
oferecer oferece oferecimento oferecido
sofrer sofre sofrido sofrimento
ocorrer ocorre ocorrido ocorrencia ocorrência
acontecer acontece acontecido acontecimento
pertencer pertence pertencente
receber recebe recebido recebimento
escrever escreve escrito escrita
viver vive vivido vivencia vivência
nascer nasce nascido nascimento
crescer cresce crescido crescimento
descer desce descido descida
morrer morre morto morte
correr corre corrido corrida
nacional nacionais federal federais estadual estaduais municipal municipais distrital distritais
legitimo legítimo legitima legítima legitimidade ilicito ilícito ilicita ilícita
valido válido valida válida validade invalido inválido nulidade nulo nula
publico público publica pública privado privada privados privadas
civil civis penal penais trabalhista trabalhistas eleitoral eleitorais tributario tributário ambiental
administrativo administrativa financeiros financeira economico econômico economica econômica
social sociais politico político politica política cultural culturais economico
humano humana humanos humanas fundamental fundamentais individual individuais coletivo coletiva
geral gerais especial especiais comum comuns unico único unica única
inteiro inteira integral integralmente total totalmente parcial parcialmente
direto direta diretamente indireto indireta indiretamente imediato imediata imediatamente
mediante perante atraves através segundo conforme consoante durante enquanto
porque portanto todavia contudo entretanto porem porém embora conquanto caso salvo exceto
qualquer quaisquer algum alguma alguns algumas nenhum nenhuma ninguém tudo todos todas cada outro outra outros outras
mesmo mesma mesmos mesmas proprio próprio propria própria tal tais semelhante semelhantes
muito muita muitos muitas pouco pouca poucos poucas mais menos maior menor melhor pior
primeiro primeira segundo segunda terceiro terceira quarto quinto sexto setimo sétimo oitavo nono decimo décimo
`;

const SET_PALAVRAS_PT_BR = new Set<string>();

for (const token of PALAVRAS_BASE_PT_BR.split(/\s+/)) {
  const limpa = token.trim().toLowerCase();
  if (limpa) {
    SET_PALAVRAS_PT_BR.add(limpa);
  }
}

/**
 * Palavras conhecidamente sólidas (sem hífen) cujo prefixo inicial poderia coincidir
 * com a lista de prefixos de exceção (ex.: "ex-clusivo" vs "exclusivo", "contra-to" vs "contrato").
 */
const SOLIDAS_QUE_INICIAM_COM_PREFIXO = new Set<string>([
  'exclusivo',
  'exclusiva',
  'exclusivos',
  'exclusivas',
  'exclusivamente',
  'executivo',
  'executiva',
  'executivos',
  'executivas',
  'execucao',
  'execução',
  'extinto',
  'extinta',
  'extintos',
  'extintas',
  'extincao',
  'extinção',
  'extensao',
  'extensão',
  'extenso',
  'extensa',
  'exame',
  'exames',
  'exato',
  'exata',
  'exemplo',
  'exemplos',
  'exercer',
  'exerce',
  'exercicio',
  'exercício',
  'exigir',
  'exige',
  'exigencia',
  'exigência',
  'existir',
  'existe',
  'existencia',
  'existência',
  'contrato',
  'contratos',
  'contratual',
  'contratuais',
  'contratante',
  'contrario',
  'contrário',
  'contraria',
  'contrária',
  'contrariedade',
  'contribuicao',
  'contribuição',
  'sempre',
  'semelhante',
  'semelhantes',
  'antigo',
  'antiga',
  'antigos',
  'antigas',
  'anterior',
  'anteriores',
  'antecipado',
  'antecipada',
  'antecipacao',
  'antecipação',
  'autoridade',
  'autoridades',
  'autorizacao',
  'autorização',
  'autorizar',
  'autonomo',
  'autônomo',
  'autonoma',
  'autônoma',
  'autonomia',
  'autoral',
  'autoria',
  'interno',
  'interna',
  'internos',
  'internas',
  'internacional',
  'internacionais',
  'interesse',
  'interesses',
  'interessado',
  'interessada',
  'submetido',
  'submetida',
  'submeter',
  'submissao',
  'submissão',
  'substituto',
  'substituta',
  'substituicao',
  'substituição',
  'subordinado',
  'subordinada',
  'superior',
  'superiores',
  'superficie',
  'superfície',
  'superveniente',
  'superar',
  'ministro',
  'ministra',
  'ministerio',
  'ministério',
  'minimo',
  'mínimo',
  'minima',
  'mínima',
  'proximo',
  'próximo',
  'proxima',
  'próxima',
  'proprio',
  'próprio',
  'propria',
  'própria',
  'previo',
  'prévio',
  'previa',
  'prévia',
  'previamente',
  'posterior',
  'posteriores',
  'extraordinario',
  'extraordinário',
  'extraordinaria',
  'extraordinária',
  'extrato',
  'extradicao',
  'extradição',
  'cooperacao',
  'cooperação',
  'coordenacao',
  'coordenação',
  'coabitacao',
  'coabitação',
  'coautor',
  'coautora',
  'coautores',
  'comissao',
  'comissão',
  'competencia',
  'competência',
  'consumidor',
  'constituicao',
  'constituição',
  'conhecimento',
  'conjunto',
  'conjunta',
  'condicao',
  'condição',
  'conclusao',
  'conclusão',
  'infracao',
  'infração',
  'infraestrutura',
  'ultraje',
  'ultrapassar',
  'ulterior',
  'neonatal',
  'neoplasia',
  'semestral',
  'semestre',
  'seminario',
  'seminário',
  'vicejar',
  'vicissitude',
]);

function checarFlexoesNoSet(palavra: string): boolean {
  if (SET_PALAVRAS_PT_BR.has(palavra)) return true;
  // Plural simples -s
  if (palavra.length > 3 && palavra.endsWith('s') && SET_PALAVRAS_PT_BR.has(palavra.slice(0, -1))) {
    return true;
  }
  // Plural -es (ex.: "particulares", "juízes", "poderes")
  if (palavra.length > 4 && palavra.endsWith('es') && SET_PALAVRAS_PT_BR.has(palavra.slice(0, -2))) {
    return true;
  }
  // Plural -ões -> -ão (ex.: "disposições")
  if (
    palavra.length > 5 &&
    palavra.endsWith('ões') &&
    SET_PALAVRAS_PT_BR.has(`${palavra.slice(0, -3)}ão`)
  ) {
    return true;
  }
  // Plural -is -> -l (ex.: "constitucionais", "municipais")
  if (
    palavra.length > 4 &&
    palavra.endsWith('ais') &&
    SET_PALAVRAS_PT_BR.has(`${palavra.slice(0, -2)}l`)
  ) {
    return true;
  }
  if (
    palavra.length > 4 &&
    palavra.endsWith('eis') &&
    SET_PALAVRAS_PT_BR.has(`${palavra.slice(0, -3)}el`)
  ) {
    return true;
  }
  // Advérbios -mente (ex.: "independentemente", "exclusivamente")
  if (
    palavra.length > 7 &&
    palavra.endsWith('mente') &&
    SET_PALAVRAS_PT_BR.has(palavra.slice(0, -5))
  ) {
    return true;
  }
  return false;
}

/**
 * Verifica se uma palavra simples (sem hífen) existe no vocabulário pt-BR integrado.
 */
export function existeNoDicionarioPtBr(palavra: string): boolean {
  const limpa = palavra
    .trim()
    .toLowerCase()
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
  if (!limpa || limpa.includes('-')) return false;
  return checarFlexoesNoSet(limpa) || SOLIDAS_QUE_INICIAM_COM_PREFIXO.has(limpa);
}

/**
 * Verifica se a forma sem hífen é comprovadamente uma palavra sólida do português
 * que não deve ser quebrada por coincidir com prefixo (ex.: "contrato", "exclusivo").
 */
export function ehPalavraSolidaConhecida(palavraSemHifen: string): boolean {
  const limpa = palavraSemHifen.trim().toLowerCase();
  return SOLIDAS_QUE_INICIAM_COM_PREFIXO.has(limpa) || checarFlexoesNoSet(limpa);
}

/**
 * Verifica se uma palavra COM hífen (esquerda-direita) existe no português:
 * 1) Na lista de compostos excepcionais (decreto-lei, bem-estar, má-fé, etc.)
 * 2) Como verbo + pronome enclítico válido (constitui-se, aplica-lhe, diz-se, etc.),
 *    desde que a junção sem hífen não seja uma palavra sólida (como "fosse", "posse", "interesse").
 * 3) Como prefixo com hífen segundo o Acordo Ortográfico (ex.: vogal igual "micro-ondas",
 *    consoante igual "inter-regional", ou prefixos sempre hifenizados como "pré-", "pós-", "vice-", "ex-").
 */
export function existeCompostoComHifenPtBr(esquerda: string, direita: string): boolean {
  const esq = esquerda.trim().toLowerCase();
  const dir = direita.trim().toLowerCase();
  if (!esq || !dir) return false;

  const composto = `${esq}-${dir}`;
  if (COMPOSTOS_EXCECOES_SET.has(composto)) return true;

  // Ênclise em português (ex.: "constitui-se", "aplica-lhe", "far-se")
  if (PRONOMES_ENCLITICOS_SET.has(dir)) {
    const junto = `${esq}${dir}`;
    if (ehPalavraSolidaConhecida(junto)) {
      return false;
    }
    // Evita falsos positivos com substantivos/palavras curtas terminando em consoante não verbal
    const terminaComoVerbo =
      /(?:[aeiouáéíóúâêôãõ]|ar|er|ir|or|am|em|ão|mos|ste|ram|sse|ria|rá|ei|ou|eu|iu|iz|az|ez|oz|uz)$/i.test(
        esq
      );
    if (terminaComoVerbo && esq.length >= 2) {
      return true;
    }
  }

  // Compostos com prefixos do Acordo Ortográfico (vogais/consoantes idênticas ou h após prefixo)
  if (PREFIXOS_HIFEN_SET.has(esq)) {
    const ultimaEsq = esq[esq.length - 1];
    const primeiraDir = dir[0];
    if (primeiraDir === 'h' || ultimaEsq === primeiraDir) {
      return true;
    }
  }

  return false;
}
