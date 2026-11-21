import type { PaginaAtiva } from '@/src/store/useLeiSecaStore';

/**
 * Cada seção do site tem o seu próprio endereço (ex.: /biblioteca, /revisao).
 * Assim o botão voltar/avançar do navegador funciona, o link pode ser copiado
 * e, ao recarregar a página, o usuário continua na mesma seção.
 */
const SECOES: readonly PaginaAtiva[] = [
  'inicio',
  'biblioteca',
  'leitor',
  'anotacoes',
  'revisao',
  'flashcards',
  'exportar',
  'configuracoes',
];

/** "inicio" fica na raiz ("/"); as demais usam o próprio nome. */
export function caminhoDaPagina(pagina: PaginaAtiva): string {
  return pagina === 'inicio' ? '/' : `/${pagina}`;
}

/** Converte o endereço atual em seção. Devolve null se não for um endereço conhecido. */
export function paginaDoCaminho(pathname: string): PaginaAtiva | null {
  const limpo = pathname.replace(/^\/+|\/+$/g, '').toLowerCase();
  if (limpo === '') return 'inicio';
  return (SECOES as readonly string[]).includes(limpo) ? (limpo as PaginaAtiva) : null;
}

/** Seção com que o site deve abrir, conforme o endereço digitado ou recarregado. */
export function paginaInicialPelaUrl(): PaginaAtiva {
  if (typeof window === 'undefined') return 'inicio';
  return paginaDoCaminho(window.location.pathname) ?? 'inicio';
}
