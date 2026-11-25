/**
 * Utilitários centrais de segurança defensiva:
 * - Sanitização estrita de HTML por allowlist (bloqueio de XSS)
 * - Validação de URLs externas (https-only por padrão)
 * - Guarda contra Prototype Pollution em JSON
 * - Validação de assinatura (magic bytes) e tamanho de arquivos enviados
 * - Proteção contra Formula Injection em exportações CSV/Anki
 * - Redação de mensagens internas para UI
 */

export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024; // 100 MB
export const MAX_BACKUP_JSON_BYTES = 50 * 1024 * 1024; // 50 MB

const TAGS_HTML_PERMITIDAS = new Set([
  'b',
  'strong',
  'i',
  'em',
  'u',
  's',
  'strike',
  'br',
  'p',
  'div',
  'span',
  'ul',
  'ol',
  'li',
  'blockquote',
  'code',
  'pre',
]);

const TAGS_HTML_DESCARTAR_CONTEUDO = new Set([
  'script',
  'style',
  'iframe',
  'frame',
  'frameset',
  'object',
  'embed',
  'applet',
  'svg',
  'math',
  'form',
  'input',
  'button',
  'textarea',
  'select',
  'option',
  'link',
  'meta',
  'base',
  'noscript',
  'template',
  'img',
  'video',
  'audio',
  'source',
  'track',
  'canvas',
  'title',
  'head',
]);

export interface SafeHtmlNode {
  tipo: 'texto' | 'elemento';
  texto?: string;
  tag?: string;
  filhos?: SafeHtmlNode[];
}

export function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function limparTagSemDom(html: string): string {
  // Fallback conservador quando DOMParser não existe (ex.: ambiente Node puro sem DOM)
  let limpo = html;
  for (const tagPerigosa of TAGS_HTML_DESCARTAR_CONTEUDO) {
    const rxBloco = new RegExp(`<${tagPerigosa}\\b[^>]*>[\\s\\S]*?<\\/${tagPerigosa}>`, 'gi');
    const rxSelf = new RegExp(`<${tagPerigosa}\\b[^>]*\\/?>`, 'gi');
    limpo = limpo.replace(rxBloco, '').replace(rxSelf, '');
  }
  return limpo.replace(/<\/?([a-zA-Z0-9-]+)([^>]*)>/g, (match, tagBruta: string) => {
    const tag = tagBruta.toLowerCase();
    if (!TAGS_HTML_PERMITIDAS.has(tag)) return '';
    if (match.startsWith('</')) return `</${tag}>`;
    if (tag === 'br') return '<br>';
    return `<${tag}>`;
  });
}

function coletarNosSegurosDom(node: Node): SafeHtmlNode[] {
  const saida: SafeHtmlNode[] = [];
  const filhos = Array.from(node.childNodes);

  for (const child of filhos) {
    if (child.nodeType === 3) {
      const val = child.nodeValue || '';
      if (val) {
        saida.push({ tipo: 'texto', texto: val });
      }
      continue;
    }

    if (child.nodeType !== 1) continue;
    const el = child as Element;
    const tag = el.tagName.toLowerCase();

    if (TAGS_HTML_DESCARTAR_CONTEUDO.has(tag)) {
      continue;
    }

    const netos = coletarNosSegurosDom(el);

    if (TAGS_HTML_PERMITIDAS.has(tag)) {
      saida.push({
        tipo: 'elemento',
        tag,
        filhos: tag === 'br' ? [] : netos,
      });
    } else {
      // Tag não permitida mas não executável: preserva somente o texto/filhos seguros
      saida.push(...netos);
    }
  }

  return saida;
}

function serializarNosSeguros(nos: SafeHtmlNode[]): string {
  let out = '';
  for (const n of nos) {
    if (n.tipo === 'texto') {
      out += escaparHtml(n.texto || '');
    } else if (n.tipo === 'elemento' && n.tag) {
      if (n.tag === 'br') {
        out += '<br>';
      } else {
        const inner = serializarNosSeguros(n.filhos || []);
        out += `<${n.tag}>${inner}</${n.tag}>`;
      }
    }
  }
  return out;
}

export function parsearHtmlSeguroParaNos(html: string | null | undefined): SafeHtmlNode[] {
  if (!html || typeof html !== 'string') return [];

  if (typeof DOMParser !== 'undefined') {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    return coletarNosSegurosDom(doc.body);
  }

  const limpo = limparTagSemDom(html);
  // Converte fallback em árvore simples preservando tags seguras e texto escapado
  const tokens = limpo.split(/(<\/?[a-z]+>)/gi);
  const root: SafeHtmlNode = { tipo: 'elemento', tag: 'div', filhos: [] };
  const pilha: SafeHtmlNode[] = [root];

  for (const token of tokens) {
    if (!token) continue;
    const matchOpen = /^<([a-z]+)>$/i.exec(token);
    const matchClose = /^<\/([a-z]+)>$/i.exec(token);
    if (matchOpen) {
      const tag = matchOpen[1].toLowerCase();
      if (!TAGS_HTML_PERMITIDAS.has(tag)) continue;
      const node: SafeHtmlNode = { tipo: 'elemento', tag, filhos: [] };
      pilha[pilha.length - 1].filhos!.push(node);
      if (tag !== 'br') {
        pilha.push(node);
      }
    } else if (matchClose) {
      const tag = matchClose[1].toLowerCase();
      for (let i = pilha.length - 1; i >= 1; i--) {
        if (pilha[i].tag === tag) {
          pilha.length = i;
          break;
        }
      }
    } else {
      pilha[pilha.length - 1].filhos!.push({ tipo: 'texto', texto: token });
    }
  }

  return root.filhos || [];
}

export function sanitizarHtmlSeguro(html: string | null | undefined): string {
  if (!html || typeof html !== 'string') return '';
  if (typeof DOMParser !== 'undefined') {
    const nos = parsearHtmlSeguroParaNos(html);
    return serializarNosSeguros(nos);
  }
  return serializarNosSeguros(parsearHtmlSeguroParaNos(html));
}

const TAGS_BLOCO_QUEBRA = new Set(['p', 'div', 'blockquote', 'pre', 'ul', 'ol']);

function blocoContemApenasBr(filhos: SafeHtmlNode[] = []): boolean {
  if (filhos.length === 0) return false;
  let temBr = false;
  for (const f of filhos) {
    if (f.tipo === 'elemento' && f.tag === 'br') {
      temBr = true;
      continue;
    }
    if (f.tipo === 'texto' && !(f.texto || '').replace(/\u00a0/g, ' ').trim()) {
      continue;
    }
    return false;
  }
  return temBr;
}

function extrairTextoDeNosSeguros(
  nos: SafeHtmlNode[],
  contextoLista?: { tipo: 'ul' | 'ol'; indice: number }
): string {
  let out = '';

  const garantirQuebraAntesDeBloco = () => {
    if (out.length > 0 && !out.endsWith('\n')) {
      out += '\n';
    }
  };

  for (const no of nos) {
    if (no.tipo === 'texto') {
      const txt = (no.texto || '').replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ');
      if (!txt) continue;
      // Evita duplicar quebra se um nó de texto começar com \n logo após fechamento de bloco
      if (out.endsWith('\n') && txt.startsWith('\n')) {
        out += txt.replace(/^\n+/, '');
      } else {
        out += txt;
      }
      continue;
    }

    if (no.tipo !== 'elemento' || !no.tag) continue;
    const tag = no.tag;
    const filhos = no.filhos || [];

    if (tag === 'br') {
      out += '\n';
      continue;
    }

    if (tag === 'ul' || tag === 'ol') {
      garantirQuebraAntesDeBloco();
      const listaCtx = { tipo: tag as 'ul' | 'ol', indice: 1 };
      const textoLista = extrairTextoDeNosSeguros(filhos, listaCtx);
      out += textoLista;
      garantirQuebraAntesDeBloco();
      continue;
    }

    if (tag === 'li') {
      garantirQuebraAntesDeBloco();
      const marcador =
        contextoLista?.tipo === 'ol' ? `${contextoLista.indice++}. ` : '• ';
      const textoItem = extrairTextoDeNosSeguros(filhos).replace(/^\n+|\n+$/g, '');
      if (textoItem) {
        out += `${marcador}${textoItem}\n`;
      }
      continue;
    }

    if (TAGS_BLOCO_QUEBRA.has(tag)) {
      garantirQuebraAntesDeBloco();
      if (blocoContemApenasBr(filhos)) {
        out += '\n';
        continue;
      }
      const textoBloco = extrairTextoDeNosSeguros(filhos);
      out += textoBloco;
      if (textoBloco && !out.endsWith('\n')) {
        out += '\n';
      }
      continue;
    }

    out += extrairTextoDeNosSeguros(filhos, contextoLista);
  }

  return out;
}

export function extrairTextoDeHtmlSeguro(html: string | null | undefined): string {
  if (!html || typeof html !== 'string') return '';
  const nos = parsearHtmlSeguroParaNos(html);
  const texto = extrairTextoDeNosSeguros(nos);
  return texto.replace(/\r\n?/g, '\n').replace(/^\n+|\n+$/g, '').trim();
}

export function sanitizarUrlSegura(
  urlBruta: string | null | undefined,
  opcoes?: { permitirHttp?: boolean; maxLength?: number }
): string | undefined {
  if (!urlBruta || typeof urlBruta !== 'string') return undefined;
  const maxLength = opcoes?.maxLength ?? 500;
  // Remove caracteres de controle e espaços nas extremidades
  const limpa = urlBruta.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (!limpa || limpa.length > maxLength) return undefined;

  try {
    const parsed = new URL(limpa);
    const protocoloPermitido =
      parsed.protocol === 'https:' ||
      (opcoes?.permitirHttp === true && parsed.protocol === 'http:');
    if (!protocoloPermitido) return undefined;
    if (parsed.username || parsed.password) return undefined;
    return parsed.toString().slice(0, maxLength);
  } catch {
    return undefined;
  }
}

const CHAVES_PROTOTIPO_BLOQUEADAS = new Set(['__proto__', 'constructor', 'prototype']);

export function sanitizarObjetoJson<T>(valor: T, profundidade = 0): T {
  if (profundidade > 32 || valor === null || typeof valor !== 'object') {
    return valor;
  }
  if (Array.isArray(valor)) {
    return valor.map((item) => sanitizarObjetoJson(item, profundidade + 1)) as unknown as T;
  }
  const limpo: Record<string, unknown> = {};
  for (const [chave, val] of Object.entries(valor as Record<string, unknown>)) {
    if (CHAVES_PROTOTIPO_BLOQUEADAS.has(chave)) continue;
    limpo[chave] = sanitizarObjetoJson(val, profundidade + 1);
  }
  return limpo as T;
}

export function parseJsonSeguro<T>(textoBruto: string, maxBytes = MAX_BACKUP_JSON_BYTES): T {
  if (typeof textoBruto !== 'string' || textoBruto.length === 0) {
    throw new Error('Arquivo JSON vazio.');
  }
  if (textoBruto.length > maxBytes) {
    throw new Error('O arquivo JSON excede o limite máximo permitido de 50 MB.');
  }
  const parsed = JSON.parse(textoBruto) as T;
  return sanitizarObjetoJson(parsed);
}

export function sanitizarNomeArquivo(nome: string, maxLen = 140): string {
  const base = (nome || 'arquivo')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .split(/[\\/]/)
    .pop() || 'arquivo';
  const semTraversal = base.replace(/\.{2,}/g, '.').trim();
  const limpo = semTraversal.replace(/[<>:"|?*]/g, '_');
  return (limpo || 'arquivo').slice(0, maxLen);
}

export function validarAssinaturaArquivo(
  buffer: ArrayBuffer,
  extensao: 'pdf' | 'docx' | 'txt',
  maxBytes = MAX_UPLOAD_BYTES
): void {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength === 0) {
    throw new Error('O arquivo selecionado está vazio.');
  }
  if (buffer.byteLength > maxBytes) {
    throw new Error('O arquivo excede o tamanho máximo suportado (100 MB).');
  }

  const bytes = new Uint8Array(buffer);

  if (extensao === 'pdf') {
    const limiteCabecalho = Math.min(bytes.length, 1024);
    const trecho = new TextDecoder('latin1').decode(bytes.subarray(0, limiteCabecalho));
    if (!trecho.includes('%PDF-')) {
      throw new Error('O arquivo não possui assinatura PDF válida (%PDF-).');
    }
    return;
  }

  if (extensao === 'docx') {
    const ehZip =
      bytes.length >= 4 &&
      bytes[0] === 0x50 &&
      bytes[1] === 0x4b &&
      ((bytes[2] === 0x03 && bytes[3] === 0x04) || (bytes[2] === 0x05 && bytes[3] === 0x06));
    if (!ehZip) {
      throw new Error('O arquivo não possui assinatura DOCX/ZIP válida.');
    }
    return;
  }

  // TXT: rejeita conteúdo binário com bytes NUL nos primeiros 8 KB
  const amostra = Math.min(bytes.length, 8192);
  for (let i = 0; i < amostra; i++) {
    if (bytes[i] === 0x00) {
      throw new Error('O arquivo TXT contém conteúdo binário inválido.');
    }
  }
}

export function escaparCelulaCsvSegura(valor: string): string {
  const texto = String(valor ?? '');
  const semQuebras = texto.replace(/\r?\n/g, '<br>');
  // Neutraliza CSV / Formula Injection em Excel e LibreOffice Calc
  const prefixoSeguro = /^[=+\-@\t\r]/.test(semQuebras.trimStart())
    ? `'${semQuebras}`
    : semQuebras;
  return `"${prefixoSeguro.replace(/"/g, '""')}"`;
}

export function escaparHtmlAnki(valor: string): string {
  return escaparHtml(String(valor ?? ''));
}

export function validarCorCssSegura(valor: string | undefined, fallback: string): string {
  if (typeof valor !== 'string') return fallback;
  const limpa = valor.trim();
  if (/^#[0-9a-fA-F]{3,8}$/.test(limpa)) return limpa;
  if (
    /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/.test(
      limpa
    )
  ) {
    return limpa;
  }
  return fallback;
}

export function validarForcaSenhaCadastro(senha: string): string | null {
  if (typeof senha !== 'string' || senha.length < 8) {
    return 'A senha precisa ter pelo menos 8 caracteres.';
  }
  if (senha.length > 256) {
    return 'A senha excede o tamanho máximo permitido (256 caracteres).';
  }
  if (!/[a-zA-Z]/.test(senha) || !/\d/.test(senha)) {
    return 'Use uma senha com pelo menos uma letra e um número.';
  }
  return null;
}

export function sanitizarMensagemErroUi(mensagem: string | undefined): string {
  const bruta = (mensagem || '').trim();
  if (!bruta) {
    return 'Ocorreu um erro inesperado na aplicação.';
  }
  // Evita exibir payload JSON interno (ex.: authInfo de erros do Firestore) na tela
  if (bruta.startsWith('{') && bruta.includes('"authInfo"')) {
    return 'Não foi possível concluir a operação por falta de permissão ou falha de rede.';
  }
  if (bruta.length > 260) {
    return `${bruta.slice(0, 260)}...`;
  }
  return bruta;
}
