import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Flame,
  FolderOpen,
  Sparkles,
  Target,
  Upload,
  X,
} from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAuth } from '@/src/contexts/AuthContext';
import { db, obterDataHojeISO } from '@/src/db/database';
import { useLeiSecaStore } from '@/src/store/useLeiSecaStore';
import type { RegistroDiarioEstudo } from '@/src/types/domain';
import { calcularSequenciaDias, formatarDataHoraBR, formatarRotuloUnidade } from '@/src/utils/studyHelpers';

interface HomeDashboardViewProps {
  onAbrirUpload: () => void;
}

export const HomeDashboardView: React.FC<HomeDashboardViewProps> = ({ onAbrirUpload }) => {
  const { user, perfil } = useAuth();
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

  const cfgLive = useLiveQuery(() => db.configuracoes.get('default'), []);
  const historicoDiario = cfgLive?.historicoDiario ?? configuracao.historicoDiario;

  const hojeISO = obterDataHojeISO();
  const registroHoje = historicoDiario.find((h) => h.data === hojeISO);
  const artigosHoje = registroHoje?.artigosEstudados || 0;
  const metaDiaria = configuracao.metaDiariaArtigos || 15;
  const pctMeta = Math.min(100, Math.round((artigosHoje / metaDiaria) * 100));
  const sequenciaDias = calcularSequenciaDias(historicoDiario);

  const [diaSelecionadoISO, setDiaSelecionadoISO] = useState<string>(hojeISO);
  const [anoAtual, mesAtualNum] = useMemo(() => {
    const [ano, mes] = hojeISO.split('-').map(Number);
    return [ano, mes - 1];
  }, [hojeISO]);

  const mapaHistorico = useMemo(() => {
    const mapa = new Map<string, RegistroDiarioEstudo>();
    for (const item of historicoDiario) {
      mapa.set(item.data, item);
    }
    return mapa;
  }, [historicoDiario]);

  const formatarISO = (d: Date): string => {
    const ano = d.getFullYear();
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const dia = String(d.getDate()).padStart(2, '0');
    return `${ano}-${mes}-${dia}`;
  };

  const calcularTotalDia = (reg?: RegistroDiarioEstudo): number => {
    if (!reg) return 0;
    return (reg.artigosEstudados || 0) + (reg.grifosCriados || 0) + (reg.anotacoesCriadas || 0);
  };

  const nivelIntensidade = (total: number): 0 | 1 | 2 | 3 | 4 => {
    if (total <= 0) return 0;
    if (total <= 2) return 1;
    if (total <= 5) return 2;
    if (total <= 10) return 3;
    return 4;
  };

  const classesQuadradoGitHub = (nivel: 0 | 1 | 2 | 3 | 4): string => {
    switch (nivel) {
      case 1:
        return 'bg-[#9be9a8] border-black/[0.06] dark:bg-[#0e4429] dark:border-white/[0.05]';
      case 2:
        return 'bg-[#40c463] border-black/[0.06] dark:bg-[#006d32] dark:border-white/[0.05]';
      case 3:
        return 'bg-[#30a14e] border-black/[0.06] dark:bg-[#26a641] dark:border-white/[0.05]';
      case 4:
        return 'bg-[#216e39] border-black/[0.06] dark:bg-[#39d353] dark:border-white/[0.05]';
      default:
        return 'bg-[#ebedf0] border-black/[0.06] dark:bg-[#161b22] dark:border-white/[0.05]';
    }
  };

  const gradeMes = useMemo(() => {
    const primeiroDia = new Date(anoAtual, mesAtualNum, 1);
    const totalDiasMes = new Date(anoAtual, mesAtualNum + 1, 0).getDate();

    let diasEstudadosNoMes = 0;
    let acoesNoMes = 0;

    for (let d = 1; d <= totalDiasMes; d++) {
      const data = new Date(anoAtual, mesAtualNum, d);
      const iso = formatarISO(data);
      const reg = mapaHistorico.get(iso);
      const total = calcularTotalDia(reg);
      if (total > 0) diasEstudadosNoMes += 1;
      acoesNoMes += total;
    }

    const nomeMes = new Intl.DateTimeFormat('pt-BR', {
      month: 'long',
      year: 'numeric',
    }).format(primeiroDia);

    return {
      nomeMes: nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1),
      diasEstudadosNoMes,
      acoesNoMes,
    };
  }, [anoAtual, mapaHistorico, mesAtualNum]);

  // Matriz estilo GitHub contendo apenas os dias do mês atual
  const matrizMesGitHub = useMemo(() => {
    const primeiroDia = new Date(anoAtual, mesAtualNum, 1);
    const totalDiasMes = new Date(anoAtual, mesAtualNum + 1, 0).getDate();
    const offsetInicio = primeiroDia.getDay();
    const totalSemanas = Math.ceil((offsetInicio + totalDiasMes) / 7);

    const semanas: Array<
      Array<{
        foraDoMes: boolean;
        diaNumero?: number;
        iso: string;
        futuro: boolean;
        total: number;
        nivel: 0 | 1 | 2 | 3 | 4;
      }>
    > = [];

    for (let w = 0; w < totalSemanas; w++) {
      const semana: Array<{
        foraDoMes: boolean;
        diaNumero?: number;
        iso: string;
        futuro: boolean;
        total: number;
        nivel: 0 | 1 | 2 | 3 | 4;
      }> = [];

      for (let d = 0; d < 7; d++) {
        const diaNumero = w * 7 + d - offsetInicio + 1;
        if (diaNumero < 1 || diaNumero > totalDiasMes) {
          semana.push({
            foraDoMes: true,
            iso: `vazio_${w}_${d}`,
            futuro: true,
            total: 0,
            nivel: 0,
          });
          continue;
        }

        const data = new Date(anoAtual, mesAtualNum, diaNumero);
        const iso = formatarISO(data);
        const futuro = iso > hojeISO;
        const reg = mapaHistorico.get(iso);
        const total = futuro ? 0 : calcularTotalDia(reg);
        semana.push({
          foraDoMes: false,
          diaNumero,
          iso,
          futuro,
          total,
          nivel: futuro ? 0 : nivelIntensidade(total),
        });
      }
      semanas.push(semana);
    }

    return semanas;
  }, [anoAtual, hojeISO, mapaHistorico, mesAtualNum]);

  const registroDiaSelecionado = mapaHistorico.get(diaSelecionadoISO);
  const totalDiaSelecionado = calcularTotalDia(registroDiaSelecionado);

  const revisoesPendentes = useMemo(() => {
    const agora = Date.now();
    return progressos.filter(
      (p) => p.status === 'revisar' && (!p.proximaRevisaoEm || p.proximaRevisaoEm <= agora)
    ).length;
  }, [progressos]);

  const ultimoCodigo = configuracao.ultimoCodigoId
    ? mapaCodigos.get(configuracao.ultimoCodigoId)
    : codigos[0];

  const horaAtual = new Date().getHours();
  const saudacaoHorario =
    horaAtual >= 5 && horaAtual < 12
      ? 'Bom dia'
      : horaAtual >= 12 && horaAtual < 18
      ? 'Boa tarde'
      : 'Boa noite';
  const nomeCompletoUsuario = (
    user?.displayName ||
    perfil?.displayName ||
    user?.email?.split('@')[0] ||
    ''
  ).trim();
  const primeiroNomeRaw = nomeCompletoUsuario.split(/\s+/)[0] || '';
  const primeiroNome = primeiroNomeRaw
    ? primeiroNomeRaw.charAt(0).toUpperCase() + primeiroNomeRaw.slice(1)
    : '';
  const mensagemBoasVindas = primeiroNome
    ? `${saudacaoHorario}, ${primeiroNome}!`
    : `${saudacaoHorario}!`;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8 space-y-8">
      {/* Quadro de Boas-vindas + Frequência de Estudos estilo GitHub */}
      <section className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5 sm:p-6">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_303px] lg:grid-cols-[minmax(0,1fr)_331px] md:items-center">
          {/* Mensagem de boas-vindas + botão de ação */}
          <div className="min-w-0 flex flex-col justify-between gap-5 ml-[15px]">
            <div className="space-y-2">
              <h1 className="text-2xl sm:text-[1.65rem] font-semibold tracking-tight text-[var(--text-primary)]">
                {mensagemBoasVindas} Seja bem-vindo(a) de volta.
              </h1>
              <div className="flex flex-wrap items-center gap-2.5 pt-0.5">
                <span className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--text-secondary)]">
                  <CalendarDays className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                  Quadro de estudos
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 tabular-nums">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
                  {gradeMes.diasEstudadosNoMes}{' '}
                  {gradeMes.diasEstudadosNoMes === 1 ? 'dia estudado' : 'dias estudados'} no mês
                </span>
              </div>
              <p className="text-sm leading-relaxed text-[var(--text-muted)] tabular-nums">
                {gradeMes.acoesNoMes}{' '}
                {gradeMes.acoesNoMes === 1 ? 'atividade registrada' : 'atividades registradas'} (artigos lidos, grifos e anotações) em {gradeMes.nomeMes.toLowerCase()}.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {ultimoCodigo ? (
                <button
                  type="button"
                  onClick={() =>
                    abrirArtigoNoLeitor(ultimoCodigo.id, configuracao.ultimoArtigoId)
                  }
                  className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent-primary)] px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 cursor-pointer whitespace-nowrap"
                >
                  <span>Continuar estudos</span>
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
                    <span>Carregar amostra</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Quadro estilo GitHub nas proporções do site */}
          <div className="min-w-0 ml-[15px]">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 px-0.5">
                <span className="text-xs font-medium text-[var(--text-primary)] tabular-nums">
                  {gradeMes.acoesNoMes}{' '}
                  {gradeMes.acoesNoMes === 1 ? 'atividade' : 'atividades'} em{' '}
                  {gradeMes.nomeMes.toLowerCase()}
                </span>
                <span className="text-xs text-[var(--text-muted)] tabular-nums shrink-0">
                  {sequenciaDias}d seguidos
                </span>
              </div>

              <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-canvas)]/60 p-3.5">
                {/* Dias da semana */}
                <div className="mb-1.5 grid grid-cols-7 gap-1.5 text-center text-xs font-medium text-[var(--text-muted)] select-none">
                  <span>D</span>
                  <span>S</span>
                  <span>T</span>
                  <span>Q</span>
                  <span>Q</span>
                  <span>S</span>
                  <span>S</span>
                </div>

                {/* Grade mensal estilo GitHub proporcional */}
                <div className="space-y-1.5">
                  {matrizMesGitHub.map((semana, wIdx) => (
                    <div key={`sem_${wIdx}`} className="grid grid-cols-7 gap-1.5">
                      {semana.map((dia) => {
                        if (dia.foraDoMes) {
                          return (
                            <div
                              key={dia.iso}
                              className="aspect-square w-full"
                              aria-hidden="true"
                            />
                          );
                        }

                        const selecionado = diaSelecionadoISO === dia.iso;
                        const ehHoje = dia.iso === hojeISO;
                        const dataBR = dia.iso.split('-').reverse().join('/');

                        return (
                          <button
                            key={dia.iso}
                            type="button"
                            disabled={dia.futuro}
                            onClick={() => setDiaSelecionadoISO(dia.iso)}
                            aria-label={
                              dia.futuro
                                ? `${dataBR} (em breve)`
                                : `${dataBR}: ${dia.total} atividade(s)`
                            }
                            title={
                              dia.futuro
                                ? `${dataBR} (em breve)`
                                : `${dataBR}: ${dia.total} ${
                                    dia.total === 1 ? 'atividade' : 'atividades'
                                  }`
                            }
                            className={`aspect-square w-full rounded-[4px] border transition-colors ${
                              dia.futuro
                                ? 'opacity-35 cursor-default bg-[#ebedf0] border-black/[0.05] dark:bg-[#161b22] dark:border-white/[0.04]'
                                : `cursor-pointer hover:brightness-95 dark:hover:brightness-110 ${classesQuadradoGitHub(
                                    dia.nivel
                                  )}`
                            } ${
                              selecionado && !dia.futuro
                                ? 'ring-2 ring-[var(--text-primary)] ring-offset-1 ring-offset-[var(--bg-canvas)]'
                                : ehHoje && !selecionado
                                ? 'ring-1 ring-[var(--text-secondary)]/60'
                                : ''
                            }`}
                          />
                        );
                      })}
                    </div>
                  ))}
                </div>

                {/* Rodapé: resumo do dia clicado + escala Menos/Mais */}
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border-hairline)] pt-2.5 text-xs text-[var(--text-muted)]">
                  <div className="min-w-0 truncate tabular-nums">
                    <span className="font-medium text-[var(--text-secondary)]">
                      {diaSelecionadoISO.split('-').reverse().join('/')}
                    </span>
                    <span className="mx-1">·</span>
                    {registroDiaSelecionado && totalDiaSelecionado > 0 ? (
                      <span className="text-emerald-700 dark:text-emerald-400">
                        {totalDiaSelecionado} {totalDiaSelecionado === 1 ? 'ativ.' : 'ativs.'}
                      </span>
                    ) : (
                      <span>Sem registro</span>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0 text-xs">
                    <span>Menos</span>
                    <span className={`h-2.5 w-2.5 rounded-[2px] border ${classesQuadradoGitHub(0)}`} title="Sem estudo" />
                    <span className={`h-2.5 w-2.5 rounded-[2px] border ${classesQuadradoGitHub(1)}`} title="Verde claro (1–2 atividades)" />
                    <span className={`h-2.5 w-2.5 rounded-[2px] border ${classesQuadradoGitHub(2)}`} title="Verde médio (3–5 atividades)" />
                    <span className={`h-2.5 w-2.5 rounded-[2px] border ${classesQuadradoGitHub(3)}`} title="Verde (6–10 atividades)" />
                    <span className={`h-2.5 w-2.5 rounded-[2px] border ${classesQuadradoGitHub(4)}`} title="Verde forte (11+ atividades)" />
                    <span>Mais</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Tutorial rápido de primeiro uso */}
      {!configuracao.tutorialConcluido && (
        <section className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-[var(--text-primary)]">
                Como aproveitar o Lei Seca em 4 passos
              </h2>
              <p className="mt-0.5 text-sm text-[var(--text-muted)]">
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
              <p className="text-sm font-semibold text-[var(--text-primary)] tabular-nums">
                01. Importe seu arquivo
              </p>
              <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
                Envie um PDF, DOCX ou TXT. O parser separa códigos e estrutura títulos, capítulos e artigos.
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-[var(--text-primary)] tabular-nums">
                02. Grife por categoria
              </p>
              <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
                Selecione qualquer trecho e escolha uma cor para marcar prazos, regras e pegadinhas.
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-[var(--text-primary)] tabular-nums">
                03. Anote e memorize
              </p>
              <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
                Vincule notas e súmulas ao trecho exato e ative o Modo Memorização para ocultar palavras-chave.
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-[var(--text-primary)] tabular-nums">
                04. Revise e exporte
              </p>
              <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
                Use a fila espaçada (1, 3, 7, 15 e 30 dias), gere flashcards Anki e exporte PDFs esquematizados.
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Métricas reais do estudante */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5 space-y-3">
          <div className="flex items-center justify-between text-xs font-medium text-[var(--text-muted)]">
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
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
            <span>Ajustar meta</span>
            <input
              type="number"
              min={1}
              max={200}
              value={metaDiaria}
              onChange={(e) => atualizarMetaDiaria(Number(e.target.value) || 1)}
              aria-label="Meta diária de artigos"
              className="w-16 rounded border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-2 py-0.5 text-right font-mono-tabular text-[var(--text-primary)]"
            />
          </div>
        </div>

        <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5 space-y-2">
          <div className="flex items-center justify-between text-xs font-medium text-[var(--text-muted)]">
            <span>Sequência ativa</span>
            <Flame className="h-4 w-4 text-amber-500" aria-hidden="true" />
          </div>
          <p className="text-2xl font-semibold text-[var(--text-primary)] font-mono-tabular">
            {sequenciaDias} {sequenciaDias === 1 ? 'dia' : 'dias'}
          </p>
          <p className="text-xs leading-relaxed text-[var(--text-muted)]">
            Estude ao menos 1 artigo por dia para manter sua constância.
          </p>
        </div>

        <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5 space-y-2">
          <div className="flex items-center justify-between text-xs font-medium text-[var(--text-muted)]">
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
          <div className="flex items-center justify-between text-xs font-medium text-[var(--text-muted)]">
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
            <h2 className="text-base font-semibold text-[var(--text-primary)]">
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
                      <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
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

                    <div className="shrink-0 text-right text-xs text-[var(--text-muted)] tabular-nums">
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
            <h2 className="text-base font-semibold text-[var(--text-primary)]">
              Coleções personalizadas
            </h2>
            <FolderOpen className="h-4 w-4 text-[var(--text-muted)]" aria-hidden="true" />
          </div>

          <div className="flex-1 divide-y divide-[var(--border-hairline)]">
            {colecoes.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-[var(--text-muted)]">
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
                  <span className="truncate text-sm font-medium text-[var(--text-primary)]">
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
    </div>
  );
};
