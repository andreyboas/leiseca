import { ArrowLeft, ArrowRight, Download, Layers, RotateCw } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/src/db/database';
import {
  exportarFlashcardsCsvAnki,
  gerarFlashcardsDosGrifos,
} from '@/src/export/exporters';
import { useLeiSecaStore } from '@/src/store/useLeiSecaStore';

export const FlashcardsView: React.FC = () => {
  const { configuracao, mostrarToast } = useLeiSecaStore();
  const [filtroCodigo, setFiltroCodigo] = useState('todos');
  const [filtroCor, setFiltroCor] = useState('todas');
  const [indiceAtual, setIndiceAtual] = useState(0);
  const [virado, setVirado] = useState(false);

  const codigos = useLiveQuery(() => db.codigos.orderBy('ordem').toArray(), []) || [];
  const artigos = useLiveQuery(() => db.artigos.toArray(), []) || [];
  const grifos = useLiveQuery(() => db.grifos.toArray(), []) || [];
  const anotacoes = useLiveQuery(() => db.anotacoes.toArray(), []) || [];

  const cards = useMemo(() => {
    const grifosFiltrados = grifos.filter((g) => {
      if (filtroCodigo !== 'todos' && g.codigoId !== filtroCodigo) return false;
      if (filtroCor !== 'todas' && g.corId !== filtroCor) return false;
      return true;
    });
    return gerarFlashcardsDosGrifos(
      codigos,
      artigos,
      grifosFiltrados,
      anotacoes,
      configuracao.cores
    );
  }, [codigos, artigos, grifos, anotacoes, configuracao.cores, filtroCodigo, filtroCor]);

  const indiceSeguro = Math.min(indiceAtual, Math.max(0, cards.length - 1));
  const cardAtual = cards[indiceSeguro];

  const handleExportarAnki = () => {
    if (cards.length === 0) return;
    exportarFlashcardsCsvAnki(cards);
    mostrarToast(`${cards.length} flashcard(s) exportado(s) para CSV do Anki.`, 'sucesso');
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
            Flashcards dos Grifos
          </h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Gerados automaticamente a partir dos seus marca-textos (frente com lacuna de contexto; verso com o trecho grifado e nota).
          </p>
        </div>

        <button
          type="button"
          onClick={handleExportarAnki}
          disabled={cards.length === 0}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent-primary)] px-4 py-2 text-xs font-medium text-white hover:opacity-90 disabled:opacity-40 cursor-pointer whitespace-nowrap"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          Exportar CSV para Anki ({cards.length})
        </button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4">
        <select
          value={filtroCodigo}
          onChange={(e) => {
            setFiltroCodigo(e.target.value);
            setIndiceAtual(0);
            setVirado(false);
          }}
          aria-label="Filtrar flashcards por código"
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
          value={filtroCor}
          onChange={(e) => {
            setFiltroCor(e.target.value);
            setIndiceAtual(0);
            setVirado(false);
          }}
          aria-label="Filtrar flashcards por cor"
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

      {/* Área do Card */}
      {!cardAtual ? (
        <div className="rounded-xl border border-dashed border-[var(--border-hairline)] bg-[var(--bg-surface)] p-12 text-center">
          <Layers className="mx-auto h-8 w-8 text-[var(--text-muted)]" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium text-[var(--text-primary)]">
            Nenhum flashcard disponível
          </p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Grife trechos nos seus artigos durante a leitura para gerar flashcards automáticos e exportar para o Anki.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div
            onClick={() => setVirado(!virado)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setVirado(!virado);
              }
            }}
            className="min-h-[260px] flex flex-col justify-between rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-8 cursor-pointer hover:border-[var(--accent-primary)]/50 transition-colors"
          >
            <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
              <span className="font-mono-tabular font-semibold text-[var(--text-primary)]">
                {cardAtual.codigoSigla} · Art. {cardAtual.artigoNumero}
              </span>
              <span>{virado ? 'Verso (Resposta)' : 'Frente (Complete a lacuna)'}</span>
            </div>

            <div className="my-6 space-y-4 text-center">
              {!virado ? (
                <p className="text-base sm:text-lg leading-relaxed text-[var(--text-primary)] whitespace-pre-line font-legal-serif">
                  {cardAtual.frente}
                </p>
              ) : (
                <>
                  <p className="text-lg sm:text-xl font-semibold text-[var(--accent-primary)] font-legal-serif">
                    {cardAtual.verso}
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">{cardAtual.corNome}</p>
                  {cardAtual.nota && (
                    <div className="mx-auto max-w-lg rounded-lg bg-[var(--bg-canvas)] p-3 text-xs text-[var(--text-secondary)]">
                      <strong>Nota:</strong> {cardAtual.nota}
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="flex items-center justify-center gap-1.5 text-xs text-[var(--text-muted)]">
              <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Clique no cartão para virar</span>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <button
              type="button"
              disabled={indiceSeguro <= 0}
              onClick={() => {
                setIndiceAtual(indiceSeguro - 1);
                setVirado(false);
              }}
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-4 py-2 text-xs font-medium text-[var(--text-primary)] disabled:opacity-40 cursor-pointer"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              Anterior
            </button>

            <span className="text-xs font-mono-tabular text-[var(--text-muted)]">
              {indiceSeguro + 1} / {cards.length}
            </span>

            <button
              type="button"
              disabled={indiceSeguro >= cards.length - 1}
              onClick={() => {
                setIndiceAtual(indiceSeguro + 1);
                setVirado(false);
              }}
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-4 py-2 text-xs font-medium text-[var(--text-primary)] disabled:opacity-40 cursor-pointer"
            >
              Próximo
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
