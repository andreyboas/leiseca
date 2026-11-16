import { Bold, Italic, List, ListOrdered, Plus, Trash2, X } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';

interface RichNoteEditorProps {
  conteudoInicialHtml: string;
  jurisprudenciaInicial?: string;
  tagsIniciais: string[];
  trechoSelecionado?: string;
  onSalvar: (dados: {
    conteudoHtml: string;
    conteudoTexto: string;
    jurisprudencia?: string;
    tags: string[];
  }) => Promise<void>;
  onExcluir?: () => Promise<void>;
  onCancelar?: () => void;
  autosave?: boolean;
}

export const RichNoteEditor: React.FC<RichNoteEditorProps> = ({
  conteudoInicialHtml,
  jurisprudenciaInicial = '',
  tagsIniciais,
  trechoSelecionado,
  onSalvar,
  onExcluir,
  onCancelar,
  autosave = false,
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const [jurisprudencia, setJurisprudencia] = useState(jurisprudenciaInicial);
  const [tags, setTags] = useState<string[]>(tagsIniciais);
  const [novaTag, setNovaTag] = useState('');
  const [statusSalvo, setStatusSalvo] = useState<'ocioso' | 'salvando' | 'salvo'>('ocioso');

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== conteudoInicialHtml) {
      editorRef.current.innerHTML = conteudoInicialHtml;
    }
  }, [conteudoInicialHtml]);

  const executarComando = (cmd: string) => {
    editorRef.current?.focus();
    document.execCommand(cmd, false);
    if (autosave) dispararAutosave();
  };

  const extrairTexto = (html: string) => {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return (tmp.textContent || tmp.innerText || '').trim();
  };

  const timerRef = useRef<number | null>(null);

  const dispararAutosave = () => {
    if (!autosave) return;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    setStatusSalvo('salvando');
    timerRef.current = window.setTimeout(async () => {
      const html = editorRef.current?.innerHTML || '';
      const texto = extrairTexto(html);
      if (!texto && !jurisprudencia.trim()) {
        setStatusSalvo('ocioso');
        return;
      }
      await onSalvar({
        conteudoHtml: html,
        conteudoTexto: texto,
        jurisprudencia: jurisprudencia.trim() || undefined,
        tags,
      });
      setStatusSalvo('salvo');
    }, 550);
  };

  const adicionarTag = () => {
    const limpa = novaTag.trim();
    if (!limpa) return;
    if (!tags.some((t) => t.toLowerCase() === limpa.toLowerCase())) {
      const atualizadas = [...tags, limpa];
      setTags(atualizadas);
      setNovaTag('');
      if (autosave) {
        const html = editorRef.current?.innerHTML || '';
        onSalvar({
          conteudoHtml: html,
          conteudoTexto: extrairTexto(html),
          jurisprudencia: jurisprudencia.trim() || undefined,
          tags: atualizadas,
        });
      }
    } else {
      setNovaTag('');
    }
  };

  const removerTag = (t: string) => {
    const atualizadas = tags.filter((x) => x !== t);
    setTags(atualizadas);
    if (autosave) {
      const html = editorRef.current?.innerHTML || '';
      onSalvar({
        conteudoHtml: html,
        conteudoTexto: extrairTexto(html),
        jurisprudencia: jurisprudencia.trim() || undefined,
        tags: atualizadas,
      });
    }
  };

  const handleSalvarManual = async (e: React.FormEvent) => {
    e.preventDefault();
    const html = editorRef.current?.innerHTML || '';
    const texto = extrairTexto(html);
    if (!texto && !jurisprudencia.trim()) return;
    setStatusSalvo('salvando');
    await onSalvar({
      conteudoHtml: html,
      conteudoTexto: texto,
      jurisprudencia: jurisprudencia.trim() || undefined,
      tags,
    });
    setStatusSalvo('salvo');
  };

  return (
    <form onSubmit={handleSalvarManual} className="space-y-2.5">
      {trechoSelecionado && (
        <div className="rounded-md border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2.5 py-1.5 text-xs text-[var(--text-secondary)] italic line-clamp-2">
          “{trechoSelecionado}”
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)]">
        <div className="flex items-center justify-between border-b border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2 py-1">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => executarComando('bold')}
              className="rounded p-1.5 text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] cursor-pointer"
              title="Negrito"
              aria-label="Negrito"
            >
              <Bold className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => executarComando('italic')}
              className="rounded p-1.5 text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] cursor-pointer"
              title="Itálico"
              aria-label="Itálico"
            >
              <Italic className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => executarComando('insertUnorderedList')}
              className="rounded p-1.5 text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] cursor-pointer"
              title="Lista com marcadores"
              aria-label="Lista com marcadores"
            >
              <List className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => executarComando('insertOrderedList')}
              className="rounded p-1.5 text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] cursor-pointer"
              title="Lista numerada"
              aria-label="Lista numerada"
            >
              <ListOrdered className="h-3.5 w-3.5" />
            </button>
          </div>

          {statusSalvo !== 'ocioso' && (
            <span className="text-[11px] text-[var(--text-muted)]">
              {statusSalvo === 'salvando' ? 'Salvando...' : 'Salvo'}
            </span>
          )}
        </div>

        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={dispararAutosave}
          aria-label="Conteúdo da anotação"
          className="min-h-[84px] max-h-48 overflow-y-auto px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
        />
      </div>

      <div>
        <input
          type="text"
          value={jurisprudencia}
          onChange={(e) => {
            setJurisprudencia(e.target.value);
            if (autosave) dispararAutosave();
          }}
          placeholder="Jurisprudência ou súmula relacionada (opcional)"
          className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-primary)]"
        />
      </div>

      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {tags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => removerTag(tag)}
              className="inline-flex items-center gap-1 rounded border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
              title="Remover tag"
            >
              <span>#{tag}</span>
              <X className="h-2.5 w-2.5" aria-hidden="true" />
            </button>
          ))}
        </div>
        <div className="flex gap-1.5">
          <input
            type="text"
            value={novaTag}
            onChange={(e) => setNovaTag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                adicionarTag();
              }
            }}
            placeholder="Adicionar tag (ex: prova OAB, revisar)"
            className="flex-1 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 py-1 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
          />
          <button
            type="button"
            onClick={adicionarTag}
            className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
          >
            <Plus className="h-3 w-3" aria-hidden="true" />
            Tag
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-2">
          {onExcluir && (
            <button
              type="button"
              onClick={onExcluir}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40 cursor-pointer"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              Excluir
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {onCancelar && (
            <button
              type="button"
              onClick={onCancelar}
              className="rounded-lg px-2.5 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
            >
              Cancelar
            </button>
          )}
          {!autosave && (
            <button
              type="submit"
              className="rounded-lg bg-[var(--accent-primary)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 cursor-pointer whitespace-nowrap"
            >
              Salvar anotação
            </button>
          )}
        </div>
      </div>
    </form>
  );
};
