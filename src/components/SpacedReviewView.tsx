import { ArrowUpRight, CalendarClock, Check, RotateCcw } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/src/db/database';
import { useLeiSecaStore } from '@/src/store/useLeiSecaStore';
import { formatarDataBR, formatarIntervaloDias, formatarRotuloUnidade } from '@/src/utils/studyHelpers';

export const SpacedReviewView: React.FC = () => {
  const { registrarRevisaoEspacada, abrirArtigoNoLeitor, mostrarToast } = useLeiSecaStore();
  const [expandidos, setExpandidos] = useState<Record<string, boolean>>({});

  const progressos = useLiveQuery(() => db.progressos.where('status').equals('revisar').toArray(), []) || [];
  const codigos = useLiveQuery(() => db.codigos.toArray(), []) || [];
  const artigos = useLiveQuery(() => db.artigos.toArray(), []) || [];

  const mapaCodigos = useMemo(() => new Map(codigos.map((c) => [c.id, c])), [codigos]);
  const mapaArtigos = useMemo(() => new Map(artigos.map((a) => [a.id, a])), [artigos]);

  const agora = Date.now();
  const { pendentesHoje, futuras } = useMemo(() => {
    const ordenados = [...progressos].sort(
      (a, b) => (a.proximaRevisaoEm || 0) - (b.proximaRevisaoEm || 0)
    );
    return {
      pendentesHoje: ordenados.filter((p) => !p.proximaRevisaoEm || p.proximaRevisaoEm <= agora),
      futuras: ordenados.filter((p) => p.proximaRevisaoEm && p.proximaRevisaoEm > agora),
    };
  }, [progressos, agora]);

  const responderRevisao = async (artigoId: string, codigoId: string, acertou: boolean) => {
    await registrarRevisaoEspacada(artigoId, codigoId, acertou);
    mostrarToast(
      acertou ? 'Revisão concluída — intervalo avançado.' : 'Agendado novamente para 1 dia.',
      'sucesso'
    );
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8 space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
          Revisão Espaçada
        </h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Ciclo progressivo de 1, 3, 7, 15 e 30 dias para artigos marcados como “Revisar” durante a leitura.
        </p>
      </div>

      {/* Pendentes Hoje */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">
            Para revisar agora ({pendentesHoje.length})
          </h2>
        </div>

        {pendentesHoje.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--border-hairline)] bg-[var(--bg-surface)] p-10 text-center">
            <CalendarClock className="mx-auto h-8 w-8 text-[var(--text-muted)]" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-[var(--text-primary)]">
              Nenhuma revisão vencida para hoje
            </p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Durante a leitura de qualquer artigo, clique em “Revisar” para adicioná-lo à fila espaçada.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {pendentesHoje.map((prog) => {
              const art = mapaArtigos.get(prog.artigoId);
              const cod = mapaCodigos.get(prog.codigoId);
              if (!art) return null;
              const aberto = !!expandidos[art.id];

              return (
                <div
                  key={prog.id}
                  className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5 space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                      <span className="text-sm font-semibold text-[var(--text-primary)] font-mono-tabular">
                        {cod?.sigla || 'Doc'} · {formatarRotuloUnidade(art, { curto: true })}
                      </span>
                      {art.epigrafe && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{art.epigrafe}</span>
                        </>
                      )}
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">
                        Ciclo atual: {formatarIntervaloDias(prog.repeticoes)}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandidos((prev) => ({ ...prev, [art.id]: !prev[art.id] }))
                        }
                        className="rounded-lg border border-[var(--border-hairline)] px-2.5 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
                      >
                        {aberto ? 'Ocultar texto' : 'Ler artigo aqui'}
                      </button>
                      <button
                        type="button"
                        onClick={() => abrirArtigoNoLeitor(art.codigoId, art.id)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-[var(--accent-primary)] hover:underline cursor-pointer"
                      >
                        Abrir no leitor
                        <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </div>

                  {aberto && (
                    <div className="rounded-lg bg-[var(--bg-canvas)] p-4 text-sm text-[var(--text-primary)] leading-relaxed whitespace-pre-line font-legal-serif">
                      {art.textoIntegral}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => responderRevisao(art.id, art.codigoId, false)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
                    >
                      <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                      Revisar novamente (1 dia)
                    </button>
                    <button
                      type="button"
                      onClick={() => responderRevisao(art.id, art.codigoId, true)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent-primary)] px-3.5 py-1.5 text-xs font-medium text-white hover:opacity-90 cursor-pointer"
                    >
                      <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      Lembrei — avançar para {formatarIntervaloDias(Math.min(4, prog.repeticoes + 1))}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Próximas Revisões */}
      {futuras.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">
            Agendadas para os próximos dias ({futuras.length})
          </h2>
          <div className="divide-y divide-[var(--border-hairline)] rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)]">
            {futuras.map((prog) => {
              const art = mapaArtigos.get(prog.artigoId);
              const cod = mapaCodigos.get(prog.codigoId);
              if (!art) return null;
              return (
                <div
                  key={prog.id}
                  className="flex items-center justify-between gap-4 px-5 py-3 text-xs"
                >
                  <div>
                    <span className="font-semibold text-[var(--text-primary)] font-mono-tabular">
                      {cod?.sigla} · {formatarRotuloUnidade(art, { curto: true })}
                    </span>
                    {art.epigrafe && (
                      <span className="ml-2 text-[var(--text-muted)]">{art.epigrafe}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-[var(--text-muted)] tabular-nums">
                    <span>Intervalo: {formatarIntervaloDias(prog.repeticoes)}</span>
                    {prog.proximaRevisaoEm && (
                      <span>Próxima: {formatarDataBR(prog.proximaRevisaoEm)}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
};
