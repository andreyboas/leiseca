import { Search, X } from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/src/db/database';
import { useLeiSecaStore } from '@/src/store/useLeiSecaStore';
import type { Artigo } from '@/src/types/domain';
import { formatarRotuloUnidade } from '@/src/utils/studyHelpers';

function destacarTermo(texto: string, termo: string): React.ReactNode {
  if (!termo.trim()) return texto;
  const limpo = termo.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${limpo})`, 'gi');
  const partes = texto.split(regex);
  return partes.map((parte, idx) =>
    regex.test(parte) ? (
      <mark key={idx} className="rounded bg-amber-200/80 px-0.5 text-slate-900 dark:bg-amber-400/35 dark:text-amber-100">
        {parte}
      </mark>
    ) : (
      <React.Fragment key={idx}>{parte}</React.Fragment>
    )
  );
}

export const GlobalSearchModal: React.FC = () => {
  const { buscaGlobalAberta, setBuscaGlobalAberta, abrirArtigoNoLeitor } = useLeiSecaStore();
  const [consulta, setConsulta] = useState('');
  const [filtroCodigoId, setFiltroCodigoId] = useState<string>('todos');
  const [resultados, setResultados] = useState<Artigo[]>([]);
  const [carregando, setCarregando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const codigos = useLiveQuery(() => db.codigos.orderBy('ordem').toArray(), []) || [];
  const mapaCodigos = useMemo(() => new Map(codigos.map((c) => [c.id, c])), [codigos]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setBuscaGlobalAberta(!buscaGlobalAberta);
      }
      if (e.key === 'Escape' && buscaGlobalAberta) {
        setBuscaGlobalAberta(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [buscaGlobalAberta, setBuscaGlobalAberta]);

  useEffect(() => {
    if (buscaGlobalAberta) {
      setTimeout(() => inputRef.current?.focus(), 40);
    } else {
      setConsulta('');
      setResultados([]);
    }
  }, [buscaGlobalAberta]);

  useEffect(() => {
    if (!buscaGlobalAberta) return;
    const termo = consulta.trim().toLowerCase();
    if (!termo) {
      setResultados([]);
      return;
    }

    let cancelado = false;
    setCarregando(true);

    const timer = setTimeout(async () => {
      try {
        const colecao =
          filtroCodigoId === 'todos'
            ? db.artigos
            : db.artigos.where('codigoId').equals(filtroCodigoId);

        const encontrados: Artigo[] = [];
        const termoNumero = termo.replace(/^art\.?\s*/i, '').replace(/[º°]/g, '').trim();

        await colecao.each((art) => {
          if (encontrados.length >= 60) return;
          const numLimpo = art.numero.replace(/[º°]/g, '').toLowerCase();
          const bateNumero = termoNumero && (numLimpo === termoNumero || numLimpo.startsWith(termoNumero));
          const bateTexto =
            art.textoIntegral.toLowerCase().includes(termo) ||
            (art.epigrafe?.toLowerCase().includes(termo) ?? false);

          if (bateNumero || bateTexto) {
            encontrados.push(art);
          }
        });

        encontrados.sort((a, b) => {
          const aExato = a.numero.replace(/[º°]/g, '').toLowerCase() === termoNumero ? 0 : 1;
          const bExato = b.numero.replace(/[º°]/g, '').toLowerCase() === termoNumero ? 0 : 1;
          if (aExato !== bExato) return aExato - bExato;
          return a.numeroSort - b.numeroSort;
        });

        if (!cancelado) {
          setResultados(encontrados);
          setCarregando(false);
        }
      } catch {
        if (!cancelado) setCarregando(false);
      }
    }, 120);

    return () => {
      cancelado = true;
      clearTimeout(timer);
    };
  }, [consulta, filtroCodigoId, buscaGlobalAberta]);

  if (!buscaGlobalAberta) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 px-4 pt-16 sm:pt-24"
      role="dialog"
      aria-modal="true"
      aria-label="Busca global na legislação"
      onClick={() => setBuscaGlobalAberta(false)}
    >
      <div
        className="w-full max-w-2xl overflow-hidden rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-[var(--border-hairline)] px-4 py-3">
          <Search className="h-4 w-4 text-[var(--text-muted)] shrink-0" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            value={consulta}
            onChange={(e) => setConsulta(e.target.value)}
            placeholder="Buscar por artigo (ex: 5º, 121-A) ou palavra-chave..."
            className="w-full bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
          />
          <select
            value={filtroCodigoId}
            onChange={(e) => setFiltroCodigoId(e.target.value)}
            aria-label="Filtrar por código"
            className="rounded-md border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2.5 py-1 text-xs text-[var(--text-secondary)] focus:outline-none"
          >
            <option value="todos">Todos os códigos</option>
            {codigos.map((c) => (
              <option key={c.id} value={c.id}>
                {c.sigla}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setBuscaGlobalAberta(false)}
            className="rounded-md p-1 text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] cursor-pointer"
            aria-label="Fechar busca"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="touch-scroll max-h-[60dvh] overflow-y-auto divide-y divide-[var(--border-hairline)]">
          {!consulta.trim() ? (
            <div className="px-6 py-10 text-center text-sm text-[var(--text-muted)]">
              Digite o número do artigo ou qualquer expressão da lei para buscar instantaneamente.
            </div>
          ) : carregando ? (
            <div className="px-6 py-8 text-center text-sm text-[var(--text-muted)]">
              Buscando nos códigos importados...
            </div>
          ) : resultados.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-[var(--text-muted)]">
              Nenhum artigo encontrado para "{consulta}".
            </div>
          ) : (
            resultados.map((art) => {
              const cod = mapaCodigos.get(art.codigoId);
              const trechoResumo =
                art.textoIntegral.length > 220
                  ? `${art.textoIntegral.slice(0, 220)}...`
                  : art.textoIntegral;
              return (
                <button
                  key={art.id}
                  type="button"
                  onClick={async () => {
                    await abrirArtigoNoLeitor(art.codigoId, art.id);
                    setBuscaGlobalAberta(false);
                  }}
                  className="w-full px-5 py-3.5 text-left hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer"
                >
                  <div className="flex items-center justify-between gap-2 text-xs text-[var(--text-muted)]">
                    <span className="font-medium text-[var(--text-primary)]">
                      {cod?.sigla || 'Doc'} · {destacarTermo(formatarRotuloUnidade(art, { curto: true }), consulta)}
                    </span>
                    {art.epigrafe && art.tipoUnidade !== 'secao' && (
                      <span className="truncate">{art.epigrafe}</span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-[var(--text-secondary)] line-clamp-2 leading-relaxed">
                    {destacarTermo(trechoResumo, consulta)}
                  </p>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
