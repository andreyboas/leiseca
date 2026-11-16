import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Flame,
  FolderOpen,
  ShieldCheck,
  Sparkles,
  Target,
  Upload,
  X,
} from 'lucide-react';
import React, { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { BrandLogo } from '@/src/components/BrandLogo';
import { db, obterDataHojeISO } from '@/src/db/database';
import { useLeiSecaStore } from '@/src/store/useLeiSecaStore';
import { calcularSequenciaDias, formatarDataHoraBR, formatarRotuloUnidade } from '@/src/utils/studyHelpers';

interface HomeDashboardViewProps {
  onAbrirUpload: () => void;
}

export const HomeDashboardView: React.FC<HomeDashboardViewProps> = ({ onAbrirUpload }) => {
  const {
    configuracao,
    abrirArtigoNoLeitor,
    navegarPara,
    carregarAmostraDemonstracao,
    concluirTutorial,
    atualizarMetaDiaria,
  } = useLeiSecaStore();

  const codigos = useLiveQuery(() => db.codigos.orderBy('ordem').toArray(), []) || [];
  const colecoes = useLiveQuery(() => db.colecoes.toArray(), []) || [];
  const totalGrifos = useLiveQuery(() => db.grifos.count(), []) ?? 0;
  const totalAnotacoes = useLiveQuery(() => db.anotacoes.count(), []) ?? 0;
  const progressos = useLiveQuery(() => db.progressos.toArray(), []) || [];

  const ultimosProgressos = useMemo(
    () =>
      [...progressos]
        .sort((a, b) => b.acessadoEm - a.acessadoEm)
        .slice(0, 6),
    [progressos]
  );

  const ultimosArtigos =
    useLiveQuery(async () => {
      if (ultimosProgressos.length === 0) return [];
      const ids = ultimosProgressos.map((p) => p.artigoId);
      const arts = await db.artigos.bulkGet(ids);
      return arts.filter((a): a is NonNullable<typeof a> => !!a);
    }, [ultimosProgressos]) || [];

  const mapaCodigos = useMemo(() => new Map(codigos.map((c) => [c.id, c])), [codigos]);
  const mapaProgresso = useMemo(
    () => new Map(progressos.map((p) => [p.artigoId, p])),
    [progressos]
  );

  const hojeISO = obterDataHojeISO();
  const registroHoje = configuracao.historicoDiario.find((h) => h.data === hojeISO);
  const artigosHoje = registroHoje?.artigosEstudados || 0;
  const metaDiaria = configuracao.metaDiariaArtigos || 15;
  const pctMeta = Math.min(100, Math.round((artigosHoje / metaDiaria) * 100));
  const sequenciaDias = calcularSequenciaDias(configuracao.historicoDiario);

  const revisoesPendentes = useMemo(() => {
    const agora = Date.now();
    return progressos.filter(
      (p) => p.status === 'revisar' && (!p.proximaRevisaoEm || p.proximaRevisaoEm <= agora)
    ).length;
  }, [progressos]);

  const ultimoCodigo = configuracao.ultimoCodigoId
    ? mapaCodigos.get(configuracao.ultimoCodigoId)
    : codigos[0];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8 space-y-8">
      {/* Cabeçalho de boas-vindas e Ação Principal */}
      <section className="flex flex-col gap-6 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5 sm:p-8 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-2xl space-y-2.5">
          <BrandLogo size="md" showWordmark wordmarkClassName="text-sm font-semibold" />
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[var(--text-primary)] [text-wrap:balance]">
            Estudo focado de Lei Seca, artigo por artigo
          </h1>
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
            Importe seu Vade Mecum, isole cada dispositivo legal, grife com legendas personalizadas, registre anotações vinculadas ao texto e revise com repetição espaçada.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          {ultimoCodigo ? (
            <button
              type="button"
              onClick={() =>
                abrirArtigoNoLeitor(ultimoCodigo.id, configuracao.ultimoArtigoId)
              }
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent-primary)] px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 cursor-pointer whitespace-nowrap"
            >
              <span>Continuar de onde parei</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onAbrirUpload}
                className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent-primary)] px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 cursor-pointer whitespace-nowrap"
              >
                <Upload className="h-4 w-4" aria-hidden="true" />
                <span>Importar Vade Mecum</span>
              </button>
              <button
                type="button"
                onClick={carregarAmostraDemonstracao}
                className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-4 py-2.5 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] cursor-pointer whitespace-nowrap"
              >
                <BookOpen className="h-4 w-4" aria-hidden="true" />
                <span>Carregar amostra (CF/88 + CP + CDC)</span>
              </button>
            </>
          )}
        </div>
      </section>

      {/* Tutorial rápido de primeiro uso */}
      {!configuracao.tutorialConcluido && (
        <section className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                Como aproveitar o Lei Seca em 4 passos
              </h2>
              <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                Fluxo pensado para estudo ativo e retenção de longo prazo
              </p>
            </div>
            <button
              type="button"
              onClick={concluirTutorial}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] cursor-pointer"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              Ocultar guia
            </button>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-[var(--text-primary)] tabular-nums">
                01. Importe seu arquivo
              </p>
              <p className="text-xs text-[var(--text-secondary)]">
                Envie um PDF, DOCX ou TXT. O parser separa códigos e estrutura títulos, capítulos e artigos.
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold text-[var(--text-primary)] tabular-nums">
                02. Grife por categoria
              </p>
              <p className="text-xs text-[var(--text-secondary)]">
                Selecione qualquer trecho e pressione 1 a 5 (ou toque na cor) para marcar prazos, regras e pegadinhas.
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold text-[var(--text-primary)] tabular-nums">
                03. Anote e memorize
              </p>
              <p className="text-xs text-[var(--text-secondary)]">
                Vincule notas e súmulas ao trecho exato e ative o Modo Memorização para ocultar palavras-chave.
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold text-[var(--text-primary)] tabular-nums">
                04. Revise e exporte
              </p>
              <p className="text-xs text-[var(--text-secondary)]">
                Use a fila espaçada (1, 3, 7, 15 e 30 dias), gere flashcards Anki e exporte PDFs esquematizados.
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Métricas reais do estudante */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5 space-y-3">
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
            <span>Meta diária de artigos</span>
            <Target className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-semibold text-[var(--text-primary)] font-mono-tabular">
              {artigosHoje} / {metaDiaria}
            </span>
            <span className="text-xs font-mono-tabular text-[var(--text-muted)]">{pctMeta}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-subtle)]">
            <div
              className="h-full bg-[var(--accent-primary)] transition-all"
              style={{ width: `${pctMeta}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)]">
            <span>Ajustar meta</span>
            <input
              type="number"
              min={1}
              max={200}
              value={metaDiaria}
              onChange={(e) => atualizarMetaDiaria(Number(e.target.value) || 1)}
              aria-label="Meta diária de artigos"
              className="w-14 rounded border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-1.5 py-0.5 text-right font-mono-tabular text-[var(--text-primary)]"
            />
          </div>
        </div>

        <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5 space-y-2">
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
            <span>Sequência ativa</span>
            <Flame className="h-4 w-4 text-amber-500" aria-hidden="true" />
          </div>
          <p className="text-2xl font-semibold text-[var(--text-primary)] font-mono-tabular">
            {sequenciaDias} {sequenciaDias === 1 ? 'dia' : 'dias'}
          </p>
          <p className="text-xs text-[var(--text-muted)]">
            Estude ao menos 1 artigo por dia para manter sua constância.
          </p>
        </div>

        <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5 space-y-2">
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
            <span>Marcações acumuladas</span>
            <Sparkles className="h-4 w-4" aria-hidden="true" />
          </div>
          <p className="text-2xl font-semibold text-[var(--text-primary)] font-mono-tabular">
            {totalGrifos}
          </p>
          <p className="text-xs text-[var(--text-muted)] tabular-nums">
            {totalAnotacoes} anotação(ões) · {codigos.length} código(s)
          </p>
        </div>

        <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5 space-y-2">
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
            <span>Revisões pendentes hoje</span>
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          </div>
          <p className="text-2xl font-semibold text-[var(--text-primary)] font-mono-tabular">
            {revisoesPendentes}
          </p>
          <button
            type="button"
            onClick={() => navegarPara('revisao')}
            className="text-xs font-medium text-[var(--accent-primary)] hover:underline cursor-pointer"
          >
            Abrir fila de revisão espaçada →
          </button>
        </div>
      </section>

      {/* Últimos artigos acessados + Coleções */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] overflow-hidden">
          <div className="flex items-center justify-between border-b border-[var(--border-hairline)] px-5 py-3.5">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              Últimos artigos acessados
            </h2>
            {codigos.length > 0 && (
              <button
                type="button"
                onClick={() => navegarPara('biblioteca')}
                className="text-xs font-medium text-[var(--accent-primary)] hover:underline cursor-pointer"
              >
                Ver biblioteca
              </button>
            )}
          </div>

          {ultimosArtigos.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-[var(--text-muted)]">
              Você ainda não abriu nenhum artigo. Importe um código ou carregue a amostra oficial para começar.
            </div>
          ) : (
            <div className="divide-y divide-[var(--border-hairline)]">
              {ultimosArtigos.map((art) => {
                const cod = mapaCodigos.get(art.codigoId);
                const prog = mapaProgresso.get(art.id);
                return (
                  <button
                    key={art.id}
                    type="button"
                    onClick={() => abrirArtigoNoLeitor(art.codigoId, art.id)}
                    className="flex w-full items-center justify-between gap-4 px-5 py-3 text-left hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                        <span className="font-semibold text-[var(--text-primary)] font-mono-tabular">
                          {cod?.sigla || 'Doc'} · {formatarRotuloUnidade(art, { curto: true })}
                        </span>
                        {art.epigrafe && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="truncate">{art.epigrafe}</span>
                          </>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-[var(--text-secondary)]">
                        {art.textoIntegral.slice(0, 110)}
                      </p>
                    </div>

                    <div className="shrink-0 text-right text-[11px] text-[var(--text-muted)] tabular-nums">
                      <span className="block capitalize">
                        {prog?.status === 'nao_estudado'
                          ? 'Em leitura'
                          : prog?.status || 'Em leitura'}
                      </span>
                      {prog && <span>{formatarDataHoraBR(prog.acessadoEm)}</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] overflow-hidden flex flex-col">
          <div className="flex items-center justify-between border-b border-[var(--border-hairline)] px-5 py-3.5">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              Coleções personalizadas
            </h2>
            <FolderOpen className="h-4 w-4 text-[var(--text-muted)]" aria-hidden="true" />
          </div>

          <div className="flex-1 divide-y divide-[var(--border-hairline)]">
            {colecoes.length === 0 ? (
              <div className="px-5 py-10 text-center text-xs text-[var(--text-muted)]">
                Crie coleções como “Artigos mais cobrados” diretamente no leitor ou na Biblioteca.
              </div>
            ) : (
              colecoes.map((col) => (
                <button
                  key={col.id}
                  type="button"
                  onClick={() => navegarPara('biblioteca')}
                  className="flex w-full items-center justify-between px-5 py-3 text-left hover:bg-[var(--bg-subtle)] cursor-pointer"
                >
                  <span className="truncate text-xs font-medium text-[var(--text-primary)]">
                    {col.nome}
                  </span>
                  <span className="text-xs font-mono-tabular text-[var(--text-muted)]">
                    {col.artigoIds.length} art.
                  </span>
                </button>
              ))
            )}
          </div>
        </section>
      </div>

      {/* Aviso claro de privacidade local-first */}
      <section className="flex items-start gap-3 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-5 py-4 text-xs text-[var(--text-secondary)]">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-primary)]" aria-hidden="true" />
        <div>
          <span className="font-semibold text-[var(--text-primary)]">
            Privacidade e armazenamento local-first:
          </span>{' '}
          Todos os seus códigos importados, grifos, anotações e progresso de estudo permanecem salvos exclusivamente neste dispositivo via IndexedDB, funcionando mesmo offline. Exporte um backup em JSON na aba Exportar sempre que quiser transferir seus dados para outro aparelho.
        </div>
      </section>
    </div>
  );
};
