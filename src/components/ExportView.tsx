import { Download, FileUp, Upload } from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, importarBackupCompleto } from '@/src/db/database';
import {
  type AgrupamentoExportacao,
  type EscopoExportacao,
  type FormatoExportacao,
  executarExportacao,
  prepararDadosExportacao,
} from '@/src/export/exporters';
import { segmentarTextoComGrifos } from '@/src/parser/anchor';
import { useLeiSecaStore } from '@/src/store/useLeiSecaStore';
import type { BackupCompleto } from '@/src/types/domain';
import { MAX_BACKUP_JSON_BYTES, parseJsonSeguro } from '@/src/utils/security';
import { formatarDataBR, formatarRotuloUnidade } from '@/src/utils/studyHelpers';

export const ExportView: React.FC = () => {
  const { codigoAtivoId, configuracao, mostrarToast } = useLeiSecaStore();
  const codigos = useLiveQuery(() => db.codigos.orderBy('ordem').toArray(), []) || [];

  const [codigoSelecionadoId, setCodigoSelecionadoId] = useState<string>('');
  const [escopo, setEscopo] = useState<EscopoExportacao>('codigo_inteiro');
  const [artigoInicio, setArtigoInicio] = useState<number>(1);
  const [artigoFim, setArtigoFim] = useState<number>(50);
  const [somenteTrechosGrifados, setSomenteTrechosGrifados] = useState(false);
  const [incluirTextoIntegral, setIncluirTextoIntegral] = useState(true);
  const [incluirArtigosSemMarcacoes, setIncluirArtigosSemMarcacoes] = useState(true);
  const [agrupamento, setAgrupamento] = useState<AgrupamentoExportacao>('ordem_codigo');
  const [formato, setFormato] = useState<FormatoExportacao>('pdf');
  const [exportando, setExportando] = useState(false);

  const [modoRestauracao, setModoRestauracao] = useState<'mesclar' | 'substituir'>('mesclar');
  const inputBackupRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!codigoSelecionadoId && codigos.length > 0) {
      setCodigoSelecionadoId(
        codigos.some((c) => c.id === codigoAtivoId) ? codigoAtivoId! : codigos[0].id
      );
    }
  }, [codigos, codigoAtivoId, codigoSelecionadoId]);

  const codigoAtual = useMemo(
    () => codigos.find((c) => c.id === codigoSelecionadoId) || codigos[0] || null,
    [codigos, codigoSelecionadoId]
  );

  const artigosCodigo =
    useLiveQuery(async () => {
      if (!codigoAtual) return [];
      return db.artigos
        .where('[codigoId+ordem]')
        .between([codigoAtual.id, 0], [codigoAtual.id, Infinity])
        .toArray();
    }, [codigoAtual?.id]) || [];

  const grifosCodigo =
    useLiveQuery(async () => {
      if (!codigoAtual) return [];
      return db.grifos.where('codigoId').equals(codigoAtual.id).toArray();
    }, [codigoAtual?.id]) || [];

  const anotacoesCodigo =
    useLiveQuery(async () => {
      if (!codigoAtual) return [];
      return db.anotacoes.where('codigoId').equals(codigoAtual.id).toArray();
    }, [codigoAtual?.id]) || [];

  const dadosPreparados = useMemo(() => {
    if (!codigoAtual) return null;
    return prepararDadosExportacao(
      codigoAtual,
      artigosCodigo,
      grifosCodigo,
      anotacoesCodigo,
      configuracao.cores,
      {
        codigoId: codigoAtual.id,
        escopo,
        artigoInicio,
        artigoFim,
        somenteTrechosGrifados,
        incluirTextoIntegral,
        incluirArtigosSemMarcacoes,
        agrupamento,
        formato,
      }
    );
  }, [
    codigoAtual,
    artigosCodigo,
    grifosCodigo,
    anotacoesCodigo,
    configuracao.cores,
    escopo,
    artigoInicio,
    artigoFim,
    somenteTrechosGrifados,
    incluirTextoIntegral,
    incluirArtigosSemMarcacoes,
    agrupamento,
    formato,
  ]);

  const mapaCores = useMemo(
    () => new Map(configuracao.cores.map((c) => [c.id, c])),
    [configuracao.cores]
  );

  const handleExportar = async () => {
    if (!dadosPreparados) return;
    setExportando(true);
    try {
      await executarExportacao(dadosPreparados);
      mostrarToast(`Exportação em ${formato.toUpperCase()} concluída.`, 'sucesso');
    } catch (err) {
      mostrarToast(
        err instanceof Error ? err.message : 'Falha ao gerar arquivo de exportação.',
        'erro'
      );
    } finally {
      setExportando(false);
    }
  };

  const handleImportarBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      if (file.size > MAX_BACKUP_JSON_BYTES) {
        throw new Error('O arquivo de backup excede o limite máximo permitido (50 MB).');
      }
      const texto = await file.text();
      const json = parseJsonSeguro<BackupCompleto>(texto);
      const res = await importarBackupCompleto(json, modoRestauracao);
      mostrarToast(
        `Backup restaurado: ${res.codigosImportados} código(s) e ${res.artigosImportados} artigo(s).`,
        'sucesso'
      );
    } catch (err) {
      mostrarToast(
        err instanceof Error ? err.message : 'Arquivo JSON inválido.',
        'erro'
      );
    } finally {
      if (inputBackupRef.current) inputBackupRef.current.value = '';
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8 space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
            Exportação Esquematizada e Backup
          </h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Gere cadernos de revisão em PDF, DOCX ou Markdown preservando cores dos grifos e anotações, ou restaure um backup completo em JSON.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Painel de Configuração */}
        <div className="lg:col-span-5 space-y-5">
          <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5 space-y-4">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              Opções do documento
            </h2>

            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                Código / Lei
              </label>
              <select
                value={codigoAtual?.id || ''}
                onChange={(e) => setCodigoSelecionadoId(e.target.value)}
                className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3 py-2 text-xs text-[var(--text-primary)]"
              >
                {codigos.length === 0 ? (
                  <option value="">Nenhum código importado</option>
                ) : (
                  codigos.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.sigla} — {c.nome}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                Escopo
              </label>
              <select
                value={escopo}
                onChange={(e) => setEscopo(e.target.value as EscopoExportacao)}
                className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3 py-2 text-xs text-[var(--text-primary)]"
              >
                <option value="codigo_inteiro">Código inteiro</option>
                <option value="intervalo">Intervalo de artigos (ex: 1º ao 50)</option>
                <option value="somente_marcados">Somente artigos com marcações</option>
              </select>
            </div>

            {escopo === 'intervalo' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-[var(--text-muted)] mb-1">
                    Do artigo nº
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={artigoInicio}
                    onChange={(e) => setArtigoInicio(Number(e.target.value) || 1)}
                    className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3 py-1.5 text-xs font-mono-tabular"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[var(--text-muted)] mb-1">
                    Até o artigo nº
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={artigoFim}
                    onChange={(e) => setArtigoFim(Number(e.target.value) || 1)}
                    className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3 py-1.5 text-xs font-mono-tabular"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                Agrupamento
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setAgrupamento('ordem_codigo')}
                  className={`rounded-lg border py-1.5 text-xs font-medium cursor-pointer ${
                    agrupamento === 'ordem_codigo'
                      ? 'border-[var(--accent-primary)] bg-[var(--bg-subtle)] text-[var(--text-primary)]'
                      : 'border-[var(--border-hairline)] text-[var(--text-secondary)]'
                  }`}
                >
                  Ordem do código
                </button>
                <button
                  type="button"
                  onClick={() => setAgrupamento('por_cor')}
                  className={`rounded-lg border py-1.5 text-xs font-medium cursor-pointer ${
                    agrupamento === 'por_cor'
                      ? 'border-[var(--accent-primary)] bg-[var(--bg-subtle)] text-[var(--text-primary)]'
                      : 'border-[var(--border-hairline)] text-[var(--text-secondary)]'
                  }`}
                >
                  Agrupar por cor
                </button>
              </div>
            </div>

            <div className="space-y-2.5 pt-1 text-xs text-[var(--text-secondary)]">
              <label className="flex items-center justify-between gap-2 cursor-pointer">
                <span>Somente trechos grifados (resumo esquematizado)</span>
                <input
                  type="checkbox"
                  checked={somenteTrechosGrifados}
                  onChange={(e) => {
                    setSomenteTrechosGrifados(e.target.checked);
                    if (e.target.checked) setIncluirTextoIntegral(false);
                  }}
                />
              </label>
              <label className="flex items-center justify-between gap-2 cursor-pointer">
                <span>Incluir texto integral dos artigos</span>
                <input
                  type="checkbox"
                  checked={incluirTextoIntegral}
                  disabled={somenteTrechosGrifados}
                  onChange={(e) => setIncluirTextoIntegral(e.target.checked)}
                />
              </label>
              <label className="flex items-center justify-between gap-2 cursor-pointer">
                <span>Incluir artigos sem marcações</span>
                <input
                  type="checkbox"
                  checked={incluirArtigosSemMarcacoes}
                  disabled={escopo === 'somente_marcados'}
                  onChange={(e) => setIncluirArtigosSemMarcacoes(e.target.checked)}
                />
              </label>
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                Formato de saída
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                {(['pdf', 'docx', 'markdown', 'json'] as FormatoExportacao[]).map((fmt) => (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => setFormato(fmt)}
                    className={`rounded-lg border py-1.5 text-xs font-semibold uppercase cursor-pointer ${
                      formato === fmt
                        ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)] text-white'
                        : 'border-[var(--border-hairline)] text-[var(--text-secondary)]'
                    }`}
                  >
                    {fmt === 'markdown' ? 'MD' : fmt}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              disabled={!dadosPreparados || exportando}
              onClick={handleExportar}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--accent-primary)] py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40 cursor-pointer"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              {exportando
                ? 'Gerando arquivo...'
                : `Baixar ${formato.toUpperCase()} (${dadosPreparados?.artigosFiltrados.length || 0} art.)`}
            </button>
          </div>

          {/* Importar / Restaurar Backup JSON */}
          <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                Restaurar backup JSON
              </h2>
              <FileUp className="h-4 w-4 text-[var(--text-muted)]" aria-hidden="true" />
            </div>
            <p className="text-xs text-[var(--text-muted)]">
              Importe um arquivo `.json` exportado pelo Lei Seca em outro dispositivo para restaurar seus códigos, grifos, notas e progresso.
            </p>
            <div className="flex items-center gap-4 text-xs text-[var(--text-secondary)]">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="modoBackup"
                  checked={modoRestauracao === 'mesclar'}
                  onChange={() => setModoRestauracao('mesclar')}
                />
                Mesclar com atuais
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="modoBackup"
                  checked={modoRestauracao === 'substituir'}
                  onChange={() => setModoRestauracao('substituir')}
                />
                Substituir tudo
              </label>
            </div>
            <input
              ref={inputBackupRef}
              type="file"
              accept=".json,application/json"
              onChange={handleImportarBackup}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => inputBackupRef.current?.click()}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-canvas)] py-2 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
            >
              <Upload className="h-3.5 w-3.5" aria-hidden="true" />
              Selecionar arquivo de backup (.json)
            </button>
          </div>
        </div>

        {/* Pré-visualização ao Vivo */}
        <div className="lg:col-span-7">
          <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] overflow-hidden">
            <div className="flex items-center justify-between border-b border-[var(--border-hairline)] px-5 py-3">
              <span className="text-xs font-semibold text-[var(--text-primary)]">
                Pré-visualização do documento
              </span>
              <span className="text-xs font-mono-tabular text-[var(--text-muted)]">
                {dadosPreparados?.artigosFiltrados.length || 0} artigo(s) selecionado(s)
              </span>
            </div>

            {!dadosPreparados ? (
              <div className="p-12 text-center text-sm text-[var(--text-muted)]">
                Importe um código na Biblioteca para visualizar a exportação.
              </div>
            ) : (
              <div className="touch-scroll max-h-[72dvh] overflow-y-auto p-5 sm:p-8 space-y-6">
                {/* Prévia da Capa */}
                <div className="border-b border-[var(--border-hairline)] pb-6 space-y-3">
                  <h3 className="text-xl font-semibold text-[var(--text-primary)]">
                    {dadosPreparados.codigo.nome} ({dadosPreparados.codigo.sigla})
                  </h3>
                  <p className="text-xs text-[var(--text-muted)]">
                    Exportado em {formatarDataBR(Date.now())} · {dadosPreparados.artigosFiltrados.length} artigo(s)
                  </p>
                  <div className="pt-2 space-y-1.5">
                    <p className="text-xs font-semibold text-[var(--text-secondary)]">
                      Legenda das cores:
                    </p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
                      {configuracao.cores.map((cor) => (
                        <span key={cor.id} className="inline-flex items-center gap-1.5 text-[var(--text-secondary)]">
                          <span
                            className="inline-block h-3 w-3 rounded-xs border"
                            style={{ backgroundColor: cor.hexBg, borderColor: cor.hexBorder }}
                          />
                          <strong>{cor.nome}:</strong> {cor.significado}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Prévia do Conteúdo */}
                {dadosPreparados.artigosFiltrados.length === 0 ? (
                  <p className="py-8 text-center text-xs text-[var(--text-muted)]">
                    Nenhum artigo corresponde aos filtros selecionados.
                  </p>
                ) : (
                  <div className="space-y-6">
                    {dadosPreparados.artigosFiltrados.slice(0, 30).map((art) => {
                      const gs = dadosPreparados.grifosPorArtigo.get(art.id) || [];
                      const ns = dadosPreparados.anotacoesPorArtigo.get(art.id) || [];
                      return (
                        <div key={art.id} className="space-y-2 border-b border-[var(--border-hairline)] pb-4 last:border-b-0">
                          <h4 className="text-sm font-semibold text-[var(--text-primary)] font-mono-tabular">
                            {formatarRotuloUnidade(art)}
                            {art.epigrafe && art.tipoUnidade !== 'secao' ? ` — ${art.epigrafe}` : ''}
                          </h4>

                          {somenteTrechosGrifados || !incluirTextoIntegral ? (
                            <div className="space-y-1.5 pl-2">
                              {gs.map((g) => {
                                const cor = mapaCores.get(g.corId);
                                return (
                                  <p key={g.id} className="text-xs leading-relaxed">
                                    <mark
                                      style={{ backgroundColor: cor?.hexBg || '#fef08a' }}
                                      className="rounded-xs px-1 text-slate-900"
                                    >
                                      {g.trecho}
                                    </mark>
                                  </p>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="space-y-1.5 text-xs leading-relaxed text-[var(--text-secondary)]">
                              {art.blocos.map((bloco) => {
                                const segs = segmentarTextoComGrifos(
                                  bloco.texto,
                                  gs.filter((g) => g.blocoId === bloco.id)
                                );
                                return (
                                  <p key={bloco.id} style={{ paddingLeft: `${bloco.nivel * 16}px` }}>
                                    {(bloco.tipo !== 'caput' || art.tipoUnidade !== 'secao') && (
                                      <strong className="mr-1 text-[var(--text-primary)]">
                                        {bloco.tipo === 'caput'
                                          ? !art.tipoUnidade || art.tipoUnidade === 'artigo'
                                            ? `Art. ${art.numero}.`
                                            : `${bloco.rotulo}:`
                                          : bloco.rotulo}
                                      </strong>
                                    )}
                                    {segs.map((s, idx) => {
                                      const cor = s.grifos[0] ? mapaCores.get(s.grifos[0].corId) : null;
                                      return cor ? (
                                        <mark
                                          key={idx}
                                          style={{ backgroundColor: cor.hexBg }}
                                          className="rounded-xs px-0.5 text-slate-900"
                                        >
                                          {s.texto}
                                        </mark>
                                      ) : (
                                        <React.Fragment key={idx}>{s.texto}</React.Fragment>
                                      );
                                    })}
                                  </p>
                                );
                              })}
                            </div>
                          )}

                          {ns.length > 0 && (
                            <div className="mt-2 rounded-lg bg-[var(--bg-canvas)] p-2.5 space-y-1 text-xs">
                              <p className="font-semibold text-[var(--text-primary)]">Anotações:</p>
                              {ns.map((n) => (
                                <p key={n.id} className="text-[var(--text-secondary)]">
                                  • {n.trechoSelecionado ? `"${n.trechoSelecionado}" — ` : ''}
                                  {n.conteudoTexto}
                                  {n.jurisprudencia ? ` (Jur.: ${n.jurisprudencia})` : ''}
                                </p>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {dadosPreparados.artigosFiltrados.length > 30 && (
                      <p className="text-center text-xs text-[var(--text-muted)]">
                        Pré-visualização limitada aos 30 primeiros artigos. O arquivo exportado conterá todos os {dadosPreparados.artigosFiltrados.length} artigos.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
