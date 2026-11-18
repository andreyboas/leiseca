/**
 * Leitura do SUMÁRIO de um Vade Mecum para guiar a separação automática dos códigos.
 *
 * 1. extrairEntradasSumario: lê as linhas do sumário ("Código Penal ..... 215") e devolve a
 *    lista, NA ORDEM DO LIVRO, dos diplomas (códigos e leis) que o Vade Mecum contém.
 * 2. localizarEntradasNoCorpo: encontra no texto o título de cada diploma (na mesma ordem do
 *    sumário), confirmando que logo depois vem o "Art. 1º". Cada código termina onde o
 *    próximo começa.
 */

export interface EntradaSumario {
  ordem: number;
  titulo: string;
  pagina?: number;
  numeroLei?: string;
}

export interface MarcadorSumario {
  linha: number;
  entrada: EntradaSumario;
}

/** Devolve um identificador estável quando o texto é um diploma conhecido (ex.: "CP", "CF/88"). */
export type CanonizadorDiploma = (texto: string) => string | null;

const REGEX_CABECALHO_SUMARIO =
  /^(?:SUM[ÁA]RIO|[ÍI]NDICE(?:\s+(?:SISTEM[ÁA]TICO|GERAL|DA\s+OBRA|DE\s+LEGISLA[ÇC][ÃA]O))?|TABELA\s+DE\s+CONTE[ÚU]DO)\s*:?$/i;

const REGEX_ESTRUTURAL =
  /^(?:PARTE|LIVRO|T[ÍI]TULO|CAP[ÍI]TULO|SE[ÇC][ÃA]O|SUBSE[ÇC][ÃA]O|ANEXO|AP[ÊE]NDICE|Art\b|§)/i;

const REGEX_INICIO_DIPLOMA =
  /^(?:CONSTITUI[ÇC][ÃA]O|C[ÓO]DIGO|CONSOLIDA[ÇC][ÃA]O|ESTATUTO|LEI|DECRETO|MEDIDA\s+PROVIS[ÓO]RIA|EMENDA|REGIMENTO|S[ÚU]MULAS?|RESOLU[ÇC][ÃA]O|ATO\s+DAS|MARCO|NOVA\s+LEI)\b/i;

const REGEX_LEI_NUMERO =
  /(?:Lei(?:\s+Complementar)?|Decreto(?:-Lei)?|Medida\s+Provis[óo]ria)\s*(?:n[º°o.]*\s*)?(\d{1,3}(?:\.\d{3})+|\d{3,6})/i;

const REGEX_LINHA_ARTIGO = /^\s*Art(?:igo)?s?\.?\s*(\d+)(?!\.\d)/i;

const PALAVRAS_VAZIAS = new Set([
  'de', 'da', 'do', 'das', 'dos', 'e', 'a', 'o', 'as', 'os', 'no', 'na', 'nos', 'nas',
  'em', 'n', 'ao', 'aos', 'com', 'para', 'sobre',
]);

function normalizarTexto(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/(\d)\.(?=\d{3}\b)/g, '$1')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokensSignificativos(s: string): Set<string> {
  return new Set(
    normalizarTexto(s)
      .split(' ')
      .filter((t) => t && !PALAVRAS_VAZIAS.has(t))
  );
}

function extrairNumeroLei(texto: string): string | undefined {
  const m = texto.match(REGEX_LEI_NUMERO);
  return m ? m[1] : undefined;
}

/** "Código Penal – Decreto-Lei nº 2.848/1940" -> "Código Penal" */
export function nomePrincipal(titulo: string): string {
  const semParenteses = titulo.replace(/\([^)]*\)/g, ' ');
  const primeiro = semParenteses.split(/\s+[-–—]\s+|\s*,\s*|\s*:\s*/)[0];
  return primeiro.replace(/\s+/g, ' ').trim();
}

/** Nome para exibir na tela de revisão (usa o texto do sumário, sem lixo no final). */
export function nomeExibicaoSumario(titulo: string): string {
  const limpo = titulo.replace(/[\s.…_\-–—:,;]+$/, '').trim();
  return limpo.length > 90 ? nomePrincipal(limpo) : limpo;
}

/** Sigla escrita no próprio sumário, ex.: "(ECA)" ou "CLT – Consolidação...". */
export function siglaDoSumario(entrada: EntradaSumario): string | undefined {
  const entreParenteses = entrada.titulo.match(/\(([A-ZÇÃÕ]{2,8}(?:\/\d{2,4})?)\)/);
  if (entreParenteses) return entreParenteses[1];
  const inicio = entrada.titulo.match(/^([A-ZÇÃÕ]{2,6})\s*[-–—]\s+\S/);
  if (inicio) return inicio[1];
  if (entrada.numeroLei) return `Lei ${entrada.numeroLei}`;
  return undefined;
}

function limparTitulo(t: string): string {
  return t.replace(/[\s.…_\-–—:,;]+$/, '').replace(/\s+/g, ' ').trim();
}

interface LinhaInterpretada {
  titulo: string;
  pagina?: number;
  temLeader: boolean;
}

function interpretarLinhaSumario(bruta: string): LinhaInterpretada | null {
  const t = bruta.replace(/\s+/g, ' ').trim();
  if (t.length < 4 || t.length > 220) return null;

  // "Código Penal ........ 215"
  let m = t.match(/^(.+?)\s*(?:\.{2,}|…+|_{2,}|(?:\.\s){2,}\.?)\s*(\d{1,4})$/);
  if (m) return { titulo: limparTitulo(m[1]), pagina: Number(m[2]), temLeader: true };

  // "Código Penal 215" ou "Código Penal – 215"
  m = t.match(/^(.+?)\s+(\d{1,4})$/);
  if (
    m &&
    Number(m[2]) <= 3000 &&
    !/(?:\b(?:de|do|da|em|e|n[º°o]?|lei|art)\s*)$/i.test(m[1])
  ) {
    return { titulo: limparTitulo(m[1]), pagina: Number(m[2]), temLeader: false };
  }

  return { titulo: limparTitulo(t), temLeader: false };
}

function ehTituloDeDiploma(titulo: string): boolean {
  return REGEX_INICIO_DIPLOMA.test(titulo) || REGEX_LEI_NUMERO.test(titulo);
}

/**
 * Lê o sumário e devolve os diplomas na ordem do livro. Devolve lista vazia quando não
 * encontra um sumário utilizável (nesse caso o chamador usa a detecção por heurística).
 */
export function extrairEntradasSumario(linhas: string[]): EntradaSumario[] {
  const emBloco = new Array<boolean>(linhas.length).fill(false);

  // Blocos introduzidos por "SUMÁRIO" / "ÍNDICE"
  for (let i = 0; i < linhas.length; i++) {
    if (!REGEX_CABECALHO_SUMARIO.test(linhas[i].trim())) continue;
    let falhas = 0;
    let comPagina = 0;
    for (let j = i + 1; j < linhas.length && j <= i + 1500; j++) {
      const t = linhas[j].trim();
      if (!t) continue;
      // Texto real de lei começou: acabou o sumário
      if (/^\s*Art\.?\s*1[º°o]?[\.\s\-–—]+.{25,}/.test(t) && !/(?:\.{3,}|…)\s*\d+$/.test(t)) break;
      const p = interpretarLinhaSumario(t);

      // Depois de várias entradas com página, uma linha sem página que não é continuação
      // de título quebrado já é o corpo do livro (ex.: "CONSTITUIÇÃO DA REPÚBLICA ... DE 1988")
      if (p !== null && comPagina >= 2 && p.pagina === undefined && !p.temLeader) {
        let k = j + 1;
        while (k < linhas.length && !linhas[k].trim()) k += 1;
        const continua = k < linhas.length && /^[a-zà-ú]/.test(linhas[k].trim());
        if (!continua) break;
      }

      const parece =
        p !== null &&
        (p.pagina !== undefined ||
          p.temLeader ||
          ehTituloDeDiploma(p.titulo) ||
          REGEX_ESTRUTURAL.test(p.titulo));
      if (parece) {
        emBloco[j] = true;
        falhas = 0;
        if (p && p.pagina !== undefined) comPagina += 1;
      } else {
        falhas += 1;
        if (falhas >= 12) break;
      }
    }
  }

  interface Candidata {
    titulo: string;
    pagina?: number;
  }
  const candidatas: Candidata[] = [];
  const limiteSemBloco = Math.min(linhas.length, 1500);

  for (let i = 0; i < linhas.length; i++) {
    const p = interpretarLinhaSumario(linhas[i]);
    if (!p) continue;
    const valida = emBloco[i] || (p.temLeader && i < limiteSemBloco);
    if (!valida) continue;

    // Linha de continuação de um título quebrado em duas linhas ("... de 3 de outubro de 1941 .... 700")
    if (/^[a-zà-ú]/.test(p.titulo)) {
      const anterior = candidatas[candidatas.length - 1];
      if (anterior && anterior.pagina === undefined) {
        anterior.titulo = limparTitulo(`${anterior.titulo} ${p.titulo}`);
        anterior.pagina = p.pagina;
      }
      continue;
    }

    if (p.titulo.length < 4 || p.titulo.length > 160) continue;
    if (REGEX_ESTRUTURAL.test(p.titulo)) continue;

    const aceita =
      ehTituloDeDiploma(p.titulo) ||
      p.temLeader ||
      (emBloco[i] && p.pagina !== undefined && p.titulo.split(' ').length <= 12);
    if (!aceita) continue;

    candidatas.push({ titulo: p.titulo, pagina: p.pagina });
  }

  const resultado: EntradaSumario[] = [];
  const vistos = new Set<string>();
  let ultimaPagina: number | undefined;

  for (const c of candidatas) {
    // Páginas do sumário só crescem; queda = outro índice (ex.: remissivo), ignora
    if (c.pagina !== undefined && ultimaPagina !== undefined && c.pagina < ultimaPagina) continue;
    const chave = normalizarTexto(nomePrincipal(c.titulo));
    if (!chave || vistos.has(chave)) continue;
    vistos.add(chave);
    if (c.pagina !== undefined) ultimaPagina = c.pagina;
    resultado.push({
      ordem: resultado.length,
      titulo: c.titulo,
      pagina: c.pagina,
      numeroLei: extrairNumeroLei(c.titulo),
    });
  }

  return resultado;
}

interface LinhaCandidata {
  idx: number;
  tokens: Set<string>;
  canon: string | null;
  numeroLei?: string;
}

function casaComEntrada(
  entrada: EntradaSumario,
  canonEntrada: string | null,
  tokensEntrada: Set<string>,
  linha: LinhaCandidata
): boolean {
  if (canonEntrada && linha.canon && canonEntrada === linha.canon) return true;

  if (
    entrada.numeroLei &&
    linha.numeroLei &&
    entrada.numeroLei.replace(/\./g, '') === linha.numeroLei.replace(/\./g, '')
  ) {
    return true;
  }

  if (tokensEntrada.size === 0 || linha.tokens.size === 0) return false;
  let comuns = 0;
  for (const t of tokensEntrada) if (linha.tokens.has(t)) comuns += 1;
  const uniao = tokensEntrada.size + linha.tokens.size - comuns;
  return uniao > 0 && comuns / uniao >= 0.75;
}

/**
 * Encontra, em ordem, o título de cada entrada do sumário no corpo do texto.
 * O título só vale se logo depois (até 60 linhas) vier o "Art. 1º", o que descarta
 * cabeçalhos corridos e menções soltas. Entre várias possibilidades, escolhe a sequência
 * que casa o maior número de entradas respeitando a ordem do sumário.
 */
export function localizarEntradasNoCorpo(
  entradas: EntradaSumario[],
  linhas: string[],
  canonizar?: CanonizadorDiploma
): MarcadorSumario[] {
  const n = linhas.length;
  if (n === 0 || entradas.length === 0) return [];

  const numeroDoArtigo = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const m = linhas[i].match(REGEX_LINHA_ARTIGO);
    if (m) numeroDoArtigo[i] = parseInt(m[1], 10) || 0;
  }
  const proximoArtigo = new Int32Array(n + 1).fill(-1);
  let prox = -1;
  for (let i = n - 1; i >= 0; i--) {
    if (numeroDoArtigo[i] > 0) prox = i;
    proximoArtigo[i] = prox;
  }

  // Linhas que podem ser título de diploma: logo depois delas vem o Art. 1º
  const candidatas: LinhaCandidata[] = [];
  for (let i = 0; i < n; i++) {
    if (numeroDoArtigo[i] > 0) continue;
    const t = linhas[i].trim();
    if (t.length < 3 || t.length > 150 || t.startsWith('(') || /^[a-zà-ú]/.test(t)) continue;
    const a = i + 1 < n ? proximoArtigo[i + 1] : -1;
    if (a === -1 || a - i > 60 || numeroDoArtigo[a] !== 1) continue;
    candidatas.push({
      idx: i,
      tokens: tokensSignificativos(t),
      canon: canonizar ? canonizar(t) : null,
      numeroLei: extrairNumeroLei(t),
    });
  }

  interface No {
    k: number;
    linha: number;
    cont: number;
    prev: number;
  }
  const nos: No[] = [];

  entradas.forEach((entrada, k) => {
    const canonEntrada = canonizar ? canonizar(entrada.titulo) : null;
    const tokensEntrada = tokensSignificativos(nomePrincipal(entrada.titulo));
    let ultimaMantida = -Infinity;
    for (const c of candidatas) {
      if (!casaComEntrada(entrada, canonEntrada, tokensEntrada, c)) continue;
      // Várias linhas do mesmo cabeçalho (ex.: "CÓDIGO PENAL" + "DECRETO-LEI Nº 2.848"): fica a primeira
      if (c.idx - ultimaMantida <= 6) continue;
      ultimaMantida = c.idx;
      nos.push({ k, linha: c.idx, cont: 1, prev: -1 });
    }
  });

  nos.sort((a, b) => a.k - b.k || a.linha - b.linha);

  for (let a = 0; a < nos.length; a++) {
    for (let b = 0; b < a; b++) {
      if (nos[b].k < nos[a].k && nos[b].linha < nos[a].linha && nos[b].cont + 1 > nos[a].cont) {
        nos[a].cont = nos[b].cont + 1;
        nos[a].prev = b;
      }
    }
  }

  let melhor = -1;
  for (let a = 0; a < nos.length; a++) {
    if (
      melhor === -1 ||
      nos[a].cont > nos[melhor].cont ||
      (nos[a].cont === nos[melhor].cont && nos[a].linha < nos[melhor].linha)
    ) {
      melhor = a;
    }
  }
  if (melhor === -1) return [];

  const escolhidos: MarcadorSumario[] = [];
  for (let a = melhor; a !== -1; a = nos[a].prev) {
    escolhidos.push({ linha: nos[a].linha, entrada: entradas[nos[a].k] });
  }
  return escolhidos.reverse();
}
