import {
  AlertTriangle,
  Check,
  FileText,
  FolderOpen,
  Merge,
  Scissors,
  SlidersHorizontal,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import React, { useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, ID_PASTAS_RAIZ } from '@/src/db/database';
import {
  contarUnidadesEstimadasPorTipo,
  detectarSegmentosPorTipo,
} from '@/src/parser/documentParsers';
import { extrairArquivoEmWorker, parsearCodigosEmWorker } from '@/src/parser/fileProcessor';
import { recalcularSegmentoPorLinhas } from '@/src/parser/legalParser';
import { useLeiSecaStore } from '@/src/store/useLeiSecaStore';
import type {
  CodigoDetectado,
  ResultadoExtracaoArquivo,
  TipoDocumento,
} from '@/src/types/domain';
import { formatarContagemUnidades, ROTULOS_TIPO_DOCUMENTO } from '@/src/utils/studyHelpers';

interface UploadVadeMecumModalProps {
  aberto: boolean;
  onFechar: () => void;
}

const TIPOS_OPCOES: TipoDocumento[] = [
  'vade_mecum',
  'lei_codigo',
  'jurisprudencia',
  'sumula',
  'doutrina',
  'outro',
];

export const UploadVadeMecumModal: React.FC<UploadVadeMecumModalProps> = ({ aberto, onFechar }) => {
  const { importarCodigosConfirmados, abrirArtigoNoLeitor, mostrarToast } = useLeiSecaStore();
  const inputFileRef = useRef<HTMLInputElement>(null);

  const pastas = useLiveQuery(() => db.pastas.orderBy('ordem').toArray(), []) || [];

  const [arrastando, setArrastando] = useState(false);
  const [etapa, setEtapa] = useState<'selecao' | 'processando' | 'revisao'>('selecao');
  const [progresso, setProgresso] = useState(0);
  const [mensagemProgresso, setMensagemProgresso] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  const [tipoPreferidoInicial, setTipoPreferidoInicial] = useState<TipoDocumento | 'auto'>('auto');
  const [resultado, setResultado] = useState<ResultadoExtracaoArquivo | null>(null);
  const [tipoDocumento, setTipoDocumento] = useState<TipoDocumento>('vade_mecum');
  const [pastaDestinoId, setPastaDestinoId] = useState<string>(ID_PASTAS_RAIZ.vade_mecum);
  const [codigosRevisao, setCodigosRevisao] = useState<CodigoDetectado[]>([]);
  const [dividindoId, setDividindoId] = useState<string | null>(null);
  const [ajustandoLimitesId, setAjustandoLimitesId] = useState<string | null>(null);
  const [marcadorDivisao, setMarcadorDivisao] = useState('');

  const opcoesPastas = useMemo(() => {
    const mapa = new Map(pastas.map((p) => [p.id, p]));
    const caminho = (pId: string): string => {
      const partes: string[] = [];
      let cur = mapa.get(pId);
      let guarda = 0;
      while (cur && guarda < 8) {
        partes.unshift(cur.nome);
        cur = cur.parentId ? mapa.get(cur.parentId) : undefined;
        guarda += 1;
      }
      return partes.join(' / ');
    };
    return pastas.map((p) => ({ id: p.id, label: caminho(p.id) }));
  }, [pastas]);

  if (!aberto) return null;

  const resetar = () => {
    setEtapa('selecao');
    setProgresso(0);
    setMensagemProgresso('');
    setErro(null);
    setResultado(null);
    setCodigosRevisao([]);
    setDividindoId(null);
    setAjustandoLimitesId(null);
    setMarcadorDivisao('');
  };

  const processarArquivo = async (arquivo: File) => {
    setErro(null);
    setEtapa('processando');
    setProgresso(3);
    setMensagemProgresso(`Abrindo ${arquivo.name}...`);

    try {
      const res = await extrairArquivoEmWorker(
        arquivo,
        (info) => {
          setProgresso(info.progresso);
          setMensagemProgresso(info.etapa);
        },
        tipoPreferidoInicial === 'auto' ? undefined : tipoPreferidoInicial
      );
      setResultado(res);
      setTipoDocumento(res.tipoSugerido);
      setPastaDestinoId(ID_PASTAS_RAIZ[res.tipoSugerido] || ID_PASTAS_RAIZ.outro);
      setCodigosRevisao(res.codigosDetectados);
      setEtapa('revisao');
    } catch (err) {
      setErro(
        err instanceof Error ? err.message : 'Não foi possível ler o arquivo selecionado.'
      );
      setEtapa('selecao');
    }
  };

  const handleTrocarTipoDocumento = (novoTipo: TipoDocumento) => {
    setTipoDocumento(novoTipo);
    setPastaDestinoId(ID_PASTAS_RAIZ[novoTipo] || ID_PASTAS_RAIZ.outro);
    if (!resultado) return;
    const resegmentados = detectarSegmentosPorTipo(
      resultado.textoBruto,
      resultado.nomeArquivo,
      novoTipo
    );
    setCodigosRevisao(resegmentados);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setArrastando(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processarArquivo(file);
  };

  const atualizarCampo = (idTemp: string, campo: 'nome' | 'sigla', valor: string) => {
    setCodigosRevisao((prev) =>
      prev.map((c) => (c.idTemp === idTemp ? { ...c, [campo]: valor } : c))
    );
  };

  const ajustarLimites = (idTemp: string, novaLinhaInicio1: number, novaLinhaFim1: number) => {
    if (!resultado) return;
    const total = resultado.linhasTotais.length;
    const ini = Math.max(0, Math.min(total - 1, novaLinhaInicio1 - 1));
    const fim = Math.max(ini, Math.min(total - 1, novaLinhaFim1 - 1));
    const recalc = recalcularSegmentoPorLinhas(resultado.linhasTotais, ini, fim);
    const qtd = contarUnidadesEstimadasPorTipo(recalc.texto, tipoDocumento);

    setCodigosRevisao((prev) =>
      prev.map((c) =>
        c.idTemp === idTemp
          ? {
              ...c,
              texto: recalc.texto,
              artigosEstimados: qtd,
              linhaInicio: recalc.linhaInicio,
              linhaFim: recalc.linhaFim,
            }
          : c
      )
    );
  };

  const removerItem = (idTemp: string) => {
    setCodigosRevisao((prev) => prev.filter((c) => c.idTemp !== idTemp));
  };

  const mesclarComAnterior = (index: number) => {
    if (index <= 0) return;
    setCodigosRevisao((prev) => {
      const atual = prev[index];
      const anterior = prev[index - 1];
      const textoCombinado = `${anterior.texto}\n\n${atual.texto}`;
      const combinado: CodigoDetectado = {
        ...anterior,
        texto: textoCombinado,
        artigosEstimados: contarUnidadesEstimadasPorTipo(textoCombinado, tipoDocumento),
        linhaFim: Math.max(anterior.linhaFim, atual.linhaFim),
      };
      const copia = [...prev];
      copia.splice(index - 1, 2, combinado);
      return copia;
    });
  };

  const aplicarDivisaoManual = (idTemp: string) => {
    const termo = marcadorDivisao.trim();
    if (!termo) return;
    const idx = codigosRevisao.findIndex((c) => c.idTemp === idTemp);
    if (idx === -1) return;

    const alvo = codigosRevisao[idx];
    const pos = alvo.texto.toLowerCase().indexOf(termo.toLowerCase());
    if (pos <= 10) {
      mostrarToast('Expressão não encontrada após o início do texto para dividir.', 'erro');
      return;
    }

    const parte1 = alvo.texto.slice(0, pos).trim();
    const parte2 = alvo.texto.slice(pos).trim();
    const linhasParte1 = parte1.split('\n').length;

    const novo1: CodigoDetectado = {
      ...alvo,
      texto: parte1,
      artigosEstimados: contarUnidadesEstimadasPorTipo(parte1, tipoDocumento),
      linhaFim: alvo.linhaInicio + Math.max(0, linhasParte1 - 1),
    };
    const novo2: CodigoDetectado = {
      idTemp: `div_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      nome: termo.slice(0, 70),
      sigla: 'DOC',
      texto: parte2,
      artigosEstimados: contarUnidadesEstimadasPorTipo(parte2, tipoDocumento),
      linhaInicio: novo1.linhaFim + 1,
      linhaFim: alvo.linhaFim,
    };

    const copia = [...codigosRevisao];
    copia.splice(idx, 1, novo1, novo2);
    setCodigosRevisao(copia);
    setDividindoId(null);
    setMarcadorDivisao('');
  };

  const confirmarImportacao = async () => {
    if (codigosRevisao.length === 0) return;
    setEtapa('processando');
    setProgresso(10);
    setMensagemProgresso('Estruturando documento em segundo plano...');

    try {
      const itensParaWorker = codigosRevisao.map((c) => ({
        codigoId: c.idTemp,
        detectado: c,
      }));
      const parseados = await parsearCodigosEmWorker(itensParaWorker, tipoDocumento, (info) => {
        setProgresso(info.progresso);
        setMensagemProgresso(info.etapa);
      });

      const criados = await importarCodigosConfirmados(
        codigosRevisao.map((c) => ({
          idTemp: c.idTemp,
          nome: c.nome,
          sigla: c.sigla,
          texto: c.texto,
          fonteArquivo: resultado?.nomeArquivo,
        })),
        parseados,
        {
          tipoDocumento,
          pastaDestinoId,
        }
      );

      resetar();
      onFechar();
      if (criados[0]) {
        await abrirArtigoNoLeitor(criados[0].id);
      }
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao importar documentos.');
      setEtapa('revisao');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="upload-modal-titulo"
    >
      <div className="flex max-h-[92dvh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--border-hairline)] px-6 py-4">
          <div>
            <h2 id="upload-modal-titulo" className="text-base font-semibold text-[var(--text-primary)]">
              Importar Material de Estudo
            </h2>
            <p className="text-xs text-[var(--text-muted)]">
              Vade Mecum, leis avulsas, jurisprudência, súmulas, doutrina ou apostilas (PDF, DOCX ou TXT)
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              resetar();
              onFechar();
            }}
            className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] cursor-pointer"
            aria-label="Fechar janela de importação"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {erro && (
            <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{erro}</span>
            </div>
          )}

          {etapa === 'selecao' && (
            <div className="space-y-5">
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                  Tipo de arquivo (opcional — o sistema também detecta automaticamente)
                </label>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setTipoPreferidoInicial('auto')}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium cursor-pointer ${
                      tipoPreferidoInicial === 'auto'
                        ? 'border-[var(--accent-primary)] bg-[var(--bg-subtle)] text-[var(--text-primary)]'
                        : 'border-[var(--border-hairline)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]/60'
                    }`}
                  >
                    Detectar automaticamente
                  </button>
                  {TIPOS_OPCOES.map((tp) => (
                    <button
                      key={tp}
                      type="button"
                      onClick={() => setTipoPreferidoInicial(tp)}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-medium cursor-pointer ${
                        tipoPreferidoInicial === tp
                          ? 'border-[var(--accent-primary)] bg-[var(--bg-subtle)] text-[var(--text-primary)]'
                          : 'border-[var(--border-hairline)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]/60'
                      }`}
                    >
                      {ROTULOS_TIPO_DOCUMENTO[tp]}
                    </button>
                  ))}
                </div>
              </div>

              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setArrastando(true);
                }}
                onDragLeave={() => setArrastando(false)}
                onDrop={handleDrop}
                className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors ${
                  arrastando
                    ? 'border-[var(--accent-primary)] bg-[var(--bg-subtle)]'
                    : 'border-[var(--border-hairline)] bg-[var(--bg-canvas)]'
                }`}
              >
                <Upload className="h-8 w-8 text-[var(--text-muted)]" aria-hidden="true" />
                <p className="mt-3 text-sm font-medium text-[var(--text-primary)]">
                  Arraste seu arquivo PDF, DOCX ou TXT aqui
                </p>
                <p className="mt-1 max-w-lg text-xs text-[var(--text-muted)]">
                  No Vade Mecum, o parser ignora o sumário, remove cabeçalhos/rodapés, separa cada código em sua própria subpasta e organiza artigos, parágrafos, incisos e alíneas.
                </p>
                <input
                  ref={inputFileRef}
                  type="file"
                  accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) processarArquivo(file);
                  }}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => inputFileRef.current?.click()}
                  className="mt-5 rounded-lg bg-[var(--accent-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 cursor-pointer"
                >
                  Selecionar arquivo do computador
                </button>
              </div>
            </div>
          )}

          {etapa === 'processando' && (
            <div className="py-12 text-center">
              <FileText className="mx-auto h-8 w-8 text-[var(--accent-primary)]" aria-hidden="true" />
              <p className="mt-3 text-sm font-medium text-[var(--text-primary)]">
                {mensagemProgresso || 'Processando arquivo...'}
              </p>
              <div className="mx-auto mt-4 h-2 w-full max-w-md overflow-hidden rounded-full bg-[var(--bg-subtle)]">
                <div
                  className="h-full bg-[var(--accent-primary)] transition-all duration-200"
                  style={{ width: `${progresso}%` }}
                />
              </div>
              <p className="mt-2 text-xs font-mono-tabular text-[var(--text-muted)]">
                {progresso}%
              </p>
            </div>
          )}

          {etapa === 'revisao' && resultado && (
            <div className="space-y-5">
              {resultado.avisoOcr && (
                <div className="flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50 p-3.5 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <div>
                    <p className="font-semibold">Pouco texto detectado no PDF (possível PDF escaneado)</p>
                    <p className="mt-0.5">
                      Este PDF parece conter páginas como imagem sem camada de texto. Recomendamos passar o arquivo por um OCR antes de importar para melhores resultados.
                    </p>
                  </div>
                </div>
              )}

              {/* Tipo de Documento e Pasta de Destino */}
              <div className="grid grid-cols-1 gap-4 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-canvas)] p-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                    Tipo de material detectado
                  </label>
                  <select
                    value={tipoDocumento}
                    onChange={(e) => handleTrocarTipoDocumento(e.target.value as TipoDocumento)}
                    className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-2 text-xs font-medium text-[var(--text-primary)]"
                  >
                    {TIPOS_OPCOES.map((tp) => (
                      <option key={tp} value={tp}>
                        {ROTULOS_TIPO_DOCUMENTO[tp]}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                    <span className="inline-flex items-center gap-1">
                      <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" />
                      Pasta de destino
                    </span>
                  </label>
                  <select
                    value={pastaDestinoId}
                    onChange={(e) => setPastaDestinoId(e.target.value)}
                    className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-2 text-xs font-medium text-[var(--text-primary)]"
                  >
                    {opcoesPastas.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-2 flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--text-muted)]">
                  <span>
                    Arquivo: <strong className="text-[var(--text-primary)]">{resultado.nomeArquivo}</strong>
                    {resultado.totalPaginas ? ` · ${resultado.totalPaginas} páginas` : ''}
                    {` · ${resultado.linhasTotais.length} linhas úteis`}
                  </span>
                  <span className="tabular-nums font-medium text-[var(--text-secondary)]">
                    {codigosRevisao.length} {codigosRevisao.length === 1 ? 'item detectado' : 'itens detectados'}
                  </span>
                </div>

                {tipoDocumento === 'vade_mecum' && (
                  <p className="sm:col-span-2 text-xs text-[var(--text-muted)]">
                    Cada código listado abaixo será criado como uma subpasta organizada dentro da pasta escolhida (ex.: Vade Mecum / Constituição Federal).
                  </p>
                )}
              </div>

              <div className="divide-y divide-[var(--border-hairline)] rounded-xl border border-[var(--border-hairline)]">
                {codigosRevisao.map((item, idx) => {
                  const linhasSeg = item.texto.split('\n').filter((l) => l.trim());
                  const primeiraLinha = linhasSeg[0] || '';
                  const ultimaLinha = linhasSeg[linhasSeg.length - 1] || '';
                  const ajustando = ajustandoLimitesId === item.idTemp;

                  return (
                    <div key={item.idTemp} className="p-4 space-y-3">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
                        <div className="sm:col-span-6">
                          <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">
                            Nome do código / documento
                          </label>
                          <input
                            type="text"
                            value={item.nome}
                            onChange={(e) => atualizarCampo(item.idTemp, 'nome', e.target.value)}
                            className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3 py-1.5 text-sm text-[var(--text-primary)] focus:outline-none"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">
                            Sigla
                          </label>
                          <input
                            type="text"
                            value={item.sigla}
                            onChange={(e) => atualizarCampo(item.idTemp, 'sigla', e.target.value)}
                            className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-2.5 py-1.5 text-sm font-mono-tabular text-[var(--text-primary)] focus:outline-none"
                          />
                        </div>
                        <div className="sm:col-span-4 flex flex-col justify-end">
                          <span className="text-xs font-medium text-[var(--text-secondary)] font-mono-tabular mb-1.5">
                            ~{formatarContagemUnidades(item.artigosEstimados, tipoDocumento)} · Linhas {item.linhaInicio + 1}–{item.linhaFim + 1}
                          </span>
                        </div>
                      </div>

                      <div className="rounded-lg bg-[var(--bg-canvas)] px-3 py-2 text-xs text-[var(--text-muted)] space-y-0.5">
                        <p className="truncate">
                          <strong className="text-[var(--text-secondary)]">Início:</strong> {primeiraLinha}
                        </p>
                        <p className="truncate">
                          <strong className="text-[var(--text-secondary)]">Fim:</strong> {ultimaLinha}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="flex flex-wrap items-center gap-2">
                          {idx > 0 && (
                            <button
                              type="button"
                              onClick={() => mesclarComAnterior(idx)}
                              className="inline-flex items-center gap-1 rounded-md border border-[var(--border-hairline)] px-2.5 py-1 text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
                            >
                              <Merge className="h-3 w-3" aria-hidden="true" />
                              Mesclar com anterior
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              setDividindoId(dividindoId === item.idTemp ? null : item.idTemp)
                            }
                            className="inline-flex items-center gap-1 rounded-md border border-[var(--border-hairline)] px-2.5 py-1 text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
                          >
                            <Scissors className="h-3 w-3" aria-hidden="true" />
                            Dividir manualmente
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setAjustandoLimitesId(ajustando ? null : item.idTemp)
                            }
                            className="inline-flex items-center gap-1 rounded-md border border-[var(--border-hairline)] px-2.5 py-1 text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
                          >
                            <SlidersHorizontal className="h-3 w-3" aria-hidden="true" />
                            Ajustar início/fim
                          </button>
                        </div>

                        {codigosRevisao.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removerItem(item.idTemp)}
                            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30 cursor-pointer"
                          >
                            <Trash2 className="h-3 w-3" aria-hidden="true" />
                            Excluir
                          </button>
                        )}
                      </div>

                      {ajustando && (
                        <div className="grid grid-cols-2 gap-3 rounded-lg bg-[var(--bg-subtle)] p-3 text-xs sm:grid-cols-4">
                          <div>
                            <label className="block text-xs text-[var(--text-muted)] mb-1">
                              Linha inicial (1..{resultado.linhasTotais.length})
                            </label>
                            <input
                              type="number"
                              min={1}
                              max={item.linhaFim + 1}
                              value={item.linhaInicio + 1}
                              onChange={(e) =>
                                ajustarLimites(
                                  item.idTemp,
                                  Number(e.target.value) || 1,
                                  item.linhaFim + 1
                                )
                              }
                              className="w-full rounded border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2 py-1 font-mono-tabular"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-[var(--text-muted)] mb-1">
                              Linha final (1..{resultado.linhasTotais.length})
                            </label>
                            <input
                              type="number"
                              min={item.linhaInicio + 1}
                              max={resultado.linhasTotais.length}
                              value={item.linhaFim + 1}
                              onChange={(e) =>
                                ajustarLimites(
                                  item.idTemp,
                                  item.linhaInicio + 1,
                                  Number(e.target.value) || resultado.linhasTotais.length
                                )
                              }
                              className="w-full rounded border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2 py-1 font-mono-tabular"
                            />
                          </div>
                          <div className="col-span-2 flex items-end text-xs text-[var(--text-muted)]">
                            Altere os números de linha para expandir ou cortar exatamente onde este código começa e termina.
                          </div>
                        </div>
                      )}

                      {dividindoId === item.idTemp && (
                        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-[var(--bg-subtle)] p-2.5">
                          <input
                            type="text"
                            value={marcadorDivisao}
                            onChange={(e) => setMarcadorDivisao(e.target.value)}
                            placeholder="Texto exato onde inicia o próximo código (ex: CÓDIGO CIVIL)"
                            className="w-full min-w-0 sm:w-auto sm:flex-1 sm:min-w-[200px] rounded-md border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 py-1 text-xs text-[var(--text-primary)]"
                          />
                          <button
                            type="button"
                            onClick={() => aplicarDivisaoManual(item.idTemp)}
                            className="rounded-md bg-[var(--accent-primary)] px-3 py-1 text-xs font-medium text-white cursor-pointer"
                          >
                            Dividir aqui
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-[var(--border-hairline)] px-6 py-3.5">
          {etapa === 'revisao' ? (
            <>
              <button
                type="button"
                onClick={resetar}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
              >
                Escolher outro arquivo
              </button>
              <button
                type="button"
                onClick={confirmarImportacao}
                disabled={codigosRevisao.length === 0}
                className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 cursor-pointer"
              >
                <Check className="h-4 w-4" aria-hidden="true" />
                Confirmar e importar {codigosRevisao.length}{' '}
                {codigosRevisao.length === 1 ? 'documento' : 'documentos'}
              </button>
            </>
          ) : (
            <div className="ml-auto">
              <button
                type="button"
                onClick={() => {
                  resetar();
                  onFechar();
                }}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
              >
                Fechar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
