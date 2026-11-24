import { ArrowUpRight, MessageSquareText, Search, Trash2 } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { SafeHtmlContent } from '@/src/components/SafeHtmlContent';
import { db } from '@/src/db/database';
import { useLeiSecaStore } from '@/src/store/useLeiSecaStore';
import { formatarDataHoraBR, formatarRotuloUnidade } from '@/src/utils/studyHelpers';

export const NotesDirectoryView: React.FC = () => {
  const { configuracao, abrirArtigoNoLeitor, removerAnotacao } = useLeiSecaStore();
  const [busca, setBusca] = useState('');
  const [filtroCodigo, setFiltroCodigo] = useState('todos');
  const [filtroTag, setFiltroTag] = useState('todas');
  const [filtroCor, setFiltroCor] = useState('todas');

  const codigos = useLiveQuery(() => db.codigos.orderBy('ordem').toArray(), []) || [];
  const artigos = useLiveQuery(() => db.artigos.toArray(), []) || [];
  const anotacoes =
    useLiveQuery(() => db.anotacoes.orderBy('atualizadoEm').reverse().toArray(), []) || [];
  const tags = useLiveQuery(() => db.tags.orderBy('nome').toArray(), []) || [];

  const mapaCodigos = useMemo(() => new Map(codigos.map((c) => [c.id, c])), [codigos]);
  const mapaArtigos = useMemo(() => new Map(artigos.map((a) => [a.id, a])), [artigos]);
  const mapaCores = useMemo(
    () => new Map(configuracao.cores.map((c) => [c.id, c])),
    [configuracao.cores]
  );

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return anotacoes.filter((n) => {
      if (filtroCodigo !== 'todos' && n.codigoId !== filtroCodigo) return false;
      if (filtroCor !== 'todas' && n.corId !== filtroCor) return false;
      if (filtroTag !== 'todas' && !n.tags.includes(filtroTag)) return false;
      if (termo) {
        const art = mapaArtigos.get(n.artigoId);
        const bate =
          n.conteudoTexto.toLowerCase().includes(termo) ||
          (n.trechoSelecionado?.toLowerCase().includes(termo) ?? false) ||
          (n.jurisprudencia?.toLowerCase().includes(termo) ?? false) ||
          (art?.numero.toLowerCase().includes(termo) ?? false);
        if (!bate) return false;
      }
      return true;
    });
  }, [anotacoes, filtroCodigo, filtroCor, filtroTag, busca, mapaArtigos]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
          Caderno de Anotações
        </h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Consulte todas as notas vinculadas a trechos ou artigos, filtrando por código, tag ou cor do marca-texto.
        </p>
      </div>

      {/* Barra de Filtros */}
      <div className="grid grid-cols-1 gap-3 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-[var(--text-muted)]"
            aria-hidden="true"
          />
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar texto, súmula ou art..."
            className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-canvas)] py-1.5 pl-8 pr-3 text-xs text-[var(--text-primary)]"
          />
        </div>

        <select
          value={filtroCodigo}
          onChange={(e) => setFiltroCodigo(e.target.value)}
          aria-label="Filtrar por código"
          className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3 py-1.5 text-xs text-[var(--text-primary)]"
        >
          <option value="todos">Todos os códigos</option>
          {codigos.map((c) => (
            <option key={c.id} value={c.id}>
              {c.sigla} — {c.nome}
            </option>
          ))}
        </select>

        <select
          value={filtroTag}
          onChange={(e) => setFiltroTag(e.target.value)}
          aria-label="Filtrar por tag"
          className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3 py-1.5 text-xs text-[var(--text-primary)]"
        >
          <option value="todas">Todas as tags</option>
          {tags.map((t) => (
            <option key={t.id} value={t.nome}>
              #{t.nome}
            </option>
          ))}
        </select>

        <select
          value={filtroCor}
          onChange={(e) => setFiltroCor(e.target.value)}
          aria-label="Filtrar por cor do grifo"
          className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3 py-1.5 text-xs text-[var(--text-primary)]"
        >
          <option value="todas">Todas as cores</option>
          {configuracao.cores.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome} — {c.significado}
            </option>
          ))}
        </select>
      </div>

      {/* Lista de Anotações */}
      {filtradas.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border-hairline)] bg-[var(--bg-surface)] p-12 text-center">
          <MessageSquareText className="mx-auto h-8 w-8 text-[var(--text-muted)]" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium text-[var(--text-primary)]">
            Nenhuma anotação encontrada
          </p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Selecione trechos no Leitor para criar notas vinculadas ao texto legal ou ajuste os filtros acima.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-[var(--border-hairline)] rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)]">
          {filtradas.map((nota) => {
            const cod = mapaCodigos.get(nota.codigoId);
            const art = mapaArtigos.get(nota.artigoId);
            const cor = nota.corId ? mapaCores.get(nota.corId) : null;

            return (
              <div key={nota.id} className="p-5 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--text-muted)]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-[var(--text-primary)] font-mono-tabular">
                      {cod?.sigla || 'Doc'} · {art ? formatarRotuloUnidade(art, { curto: true }) : '?'}
                    </span>
                    {cor && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            className="inline-block h-2.5 w-2.5 rounded-xs"
                            style={{ backgroundColor: cor.hexBorder }}
                          />
                          {cor.nome}
                        </span>
                      </>
                    )}
                    {nota.tags.length > 0 && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{nota.tags.map((t) => `#${t}`).join(' ')}</span>
                      </>
                    )}
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums">{formatarDataHoraBR(nota.atualizadoEm)}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    {art && (
                      <button
                        type="button"
                        onClick={() => abrirArtigoNoLeitor(art.codigoId, art.id)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-[var(--accent-primary)] hover:underline cursor-pointer"
                      >
                        Abrir no leitor
                        <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => removerAnotacao(nota.id)}
                      className="rounded p-1 text-[var(--text-muted)] hover:text-red-600 cursor-pointer"
                      aria-label="Excluir anotação"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {nota.trechoSelecionado && (
                  <p className="rounded-md bg-[var(--bg-canvas)] px-3 py-2 text-xs italic text-[var(--text-secondary)]">
                    “{nota.trechoSelecionado}”
                  </p>
                )}

                <SafeHtmlContent
                  html={nota.conteudoHtml || nota.conteudoTexto}
                  className="legal-prose-wrap text-sm text-[var(--text-primary)] leading-relaxed [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
                />

                {nota.jurisprudencia && (
                  <p className="text-xs text-[var(--text-secondary)]">
                    <strong>Jurisprudência / Súmula:</strong> {nota.jurisprudencia}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
