import { Merge, Plus, Scissors, Trash2, X } from 'lucide-react';
import React, { useState } from 'react';
import { useLeiSecaStore } from '@/src/store/useLeiSecaStore';
import type { Artigo, BlocoArtigo, TipoBloco } from '@/src/types/domain';
import { formatarRotuloUnidade } from '@/src/utils/studyHelpers';

interface ArticleEditorModalProps {
  artigo: Artigo;
  temProximo: boolean;
  onFechar: () => void;
}

export const ArticleEditorModal: React.FC<ArticleEditorModalProps> = ({
  artigo,
  temProximo,
  onFechar,
}) => {
  const { salvarEdicaoManualArtigo, mesclarArtigoComProximo, dividirArtigoEmBloco } =
    useLeiSecaStore();
  const [epigrafe, setEpigrafe] = useState(artigo.epigrafe || '');
  const [blocos, setBlocos] = useState<BlocoArtigo[]>(() =>
    artigo.blocos.map((b) => ({ ...b }))
  );
  const [indiceDividir, setIndiceDividir] = useState<number | null>(null);
  const [novoNumeroDivisao, setNovoNumeroDivisao] = useState('');

  const atualizarBloco = (idx: number, campo: keyof BlocoArtigo, valor: string | number) => {
    setBlocos((prev) =>
      prev.map((b, i) => (i === idx ? { ...b, [campo]: valor } : b))
    );
  };

  const adicionarBloco = () => {
    setBlocos((prev) => [
      ...prev,
      {
        id: `blk_${Date.now()}_${prev.length}`,
        tipo: 'paragrafo',
        rotulo: '§',
        texto: '',
        nivel: 0,
      },
    ]);
  };

  const removerBloco = (idx: number) => {
    if (blocos.length <= 1) return;
    setBlocos((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault();
    await salvarEdicaoManualArtigo(artigo.id, blocos, epigrafe);
    onFechar();
  };

  const handleMesclar = async () => {
    await mesclarArtigoComProximo(artigo.id);
    onFechar();
  };

  const handleDividir = async () => {
    if (indiceDividir === null || !novoNumeroDivisao.trim()) return;
    await dividirArtigoEmBloco(artigo.id, indiceDividir, novoNumeroDivisao);
    onFechar();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="editar-artigo-titulo"
    >
      <div className="flex max-h-[90dvh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--border-hairline)] px-6 py-4">
          <div>
            <h2 id="editar-artigo-titulo" className="text-base font-semibold text-[var(--text-primary)]">
              Corrigir {formatarRotuloUnidade(artigo)}
            </h2>
            <p className="text-xs text-[var(--text-muted)]">
              Edite blocos, mescle se o PDF quebrou indevidamente ou divida em dois artigos. Os grifos existentes serão re-ancorados.
            </p>
          </div>
          <button
            type="button"
            onClick={onFechar}
            className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] cursor-pointer"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSalvar} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                Epígrafe / Rubrica do artigo (opcional)
              </label>
              <input
                type="text"
                value={epigrafe}
                onChange={(e) => setEpigrafe(e.target.value)}
                placeholder="Ex.: Homicídio simples"
                className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3 py-1.5 text-sm text-[var(--text-primary)]"
              />
            </div>

            <div className="space-y-3">
              {blocos.map((b, idx) => (
                <div
                  key={b.id}
                  className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-canvas)] p-3 space-y-2"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={b.tipo}
                      onChange={(e) => {
                        const tipo = e.target.value as TipoBloco;
                        const nivel =
                          tipo === 'inciso' ? 1 : tipo === 'alinea' ? 2 : tipo === 'item' ? 3 : 0;
                        setBlocos((prev) =>
                          prev.map((item, i) =>
                            i === idx ? { ...item, tipo, nivel } : item
                          )
                        );
                      }}
                      className="rounded-md border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2 py-1 text-xs text-[var(--text-primary)]"
                    >
                      <option value="caput">Caput</option>
                      <option value="paragrafo">Parágrafo</option>
                      <option value="inciso">Inciso</option>
                      <option value="alinea">Alínea</option>
                      <option value="item">Item</option>
                    </select>

                    <input
                      type="text"
                      value={b.rotulo}
                      onChange={(e) => atualizarBloco(idx, 'rotulo', e.target.value)}
                      className="w-32 rounded-md border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2 py-1 text-xs font-medium text-[var(--text-primary)]"
                      placeholder="Rótulo"
                    />

                    <div className="ml-auto flex items-center gap-1.5">
                      {idx > 0 && (
                        <button
                          type="button"
                          onClick={() =>
                            setIndiceDividir(indiceDividir === idx ? null : idx)
                          }
                          className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
                          title="Dividir artigo a partir deste bloco"
                        >
                          <Scissors className="h-3 w-3" aria-hidden="true" />
                          Dividir aqui
                        </button>
                      )}
                      {blocos.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removerBloco(idx)}
                          className="rounded p-1 text-red-600 hover:bg-red-50 dark:text-red-400 cursor-pointer"
                          title="Remover bloco"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {indiceDividir === idx && (
                    <div className="flex flex-wrap items-center gap-2 rounded-md bg-[var(--bg-subtle)] p-2">
                      <span className="text-xs text-[var(--text-secondary)]">
                        Criar novo artigo a partir deste bloco com número:
                      </span>
                      <input
                        type="text"
                        value={novoNumeroDivisao}
                        onChange={(e) => setNovoNumeroDivisao(e.target.value)}
                        placeholder="Ex: 122"
                        className="w-24 rounded border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2 py-1 text-xs"
                      />
                      <button
                        type="button"
                        onClick={handleDividir}
                        className="rounded bg-[var(--accent-primary)] px-2.5 py-1 text-xs font-medium text-white cursor-pointer"
                      >
                        Confirmar divisão
                      </button>
                    </div>
                  )}

                  <textarea
                    rows={2}
                    value={b.texto}
                    onChange={(e) => atualizarBloco(idx, 'texto', e.target.value)}
                    className="w-full rounded-md border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none"
                  />
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
              <button
                type="button"
                onClick={adicionarBloco}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                Adicionar parágrafo / inciso
              </button>

              {temProximo && (
                <button
                  type="button"
                  onClick={handleMesclar}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
                >
                  <Merge className="h-3.5 w-3.5" aria-hidden="true" />
                  Mesclar com próximo artigo
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-[var(--border-hairline)] px-6 py-3.5">
            <button
              type="button"
              onClick={onFechar}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="rounded-lg bg-[var(--accent-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 cursor-pointer"
            >
              Salvar alterações
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
