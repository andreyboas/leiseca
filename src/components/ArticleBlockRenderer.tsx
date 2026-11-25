import { MessageSquareText } from 'lucide-react';
import React, { useState } from 'react';
import { segmentarTextoComGrifos } from '@/src/parser/anchor';
import { dividirTextoComRemissoes } from '@/src/parser/legalParser';
import type { Anotacao, BlocoArtigo, CorConfig, Grifo } from '@/src/types/domain';
import { gerarTokensMemorizacao } from '@/src/utils/studyHelpers';

interface ArticleBlockRendererProps {
  artigoNumero: string;
  tipoUnidade?: import('@/src/types/domain').TipoUnidade;
  bloco: BlocoArtigo;
  grifos: Grifo[];
  anotacoes: Anotacao[];
  cores: CorConfig[];
  temaEscuro: boolean;
  ocultarRemissoes: boolean;
  modoMemorizacao: boolean;
  revelarTudo: boolean;
  onClicarGrifo: (grifo: Grifo, rect: DOMRect) => void;
  onClicarIconeNota: (anotacao: Anotacao) => void;
}

export const ArticleBlockRenderer: React.FC<ArticleBlockRendererProps> = ({
  artigoNumero,
  tipoUnidade = 'artigo',
  bloco,
  grifos,
  anotacoes,
  cores,
  temaEscuro,
  ocultarRemissoes,
  modoMemorizacao,
  revelarTudo,
  onClicarGrifo,
  onClicarIconeNota,
}) => {
  const [lacunasReveladas, setLacunasReveladas] = useState<Record<string, boolean>>({});
  const mapaCores = new Map(cores.map((c) => [c.id, c]));

  const grifosDoBloco = grifos.filter((g) => g.blocoId === bloco.id);
  const segmentos = segmentarTextoComGrifos(bloco.texto, grifosDoBloco);

  // Anotações vinculadas ao fim de um trecho específico deste bloco
  const notasPorFim = new Map<number, Anotacao[]>();
  for (const nota of anotacoes) {
    if (nota.blocoId === bloco.id && typeof nota.fim === 'number') {
      const arr = notasPorFim.get(nota.fim) || [];
      arr.push(nota);
      notasPorFim.set(nota.fim, arr);
    }
  }

  const paddingNivel =
    bloco.nivel === 1
      ? 'pl-5 sm:pl-7'
      : bloco.nivel === 2
      ? 'pl-10 sm:pl-14'
      : bloco.nivel >= 3
      ? 'pl-14 sm:pl-20'
      : '';

  const alternarLacuna = (id: string) => {
    setLacunasReveladas((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const renderSegmentoTexto = (textoSeg: string, inicioSeg: number) => {
    if (modoMemorizacao) {
      const tokens = gerarTokensMemorizacao(textoSeg, `${bloco.id}_${inicioSeg}`);
      return tokens.map((tok) => {
        if (!tok.ocultavel) {
          return <React.Fragment key={tok.id}>{tok.texto}</React.Fragment>;
        }
        const visivel = revelarTudo || !!lacunasReveladas[tok.id];
        return (
          <button
            key={tok.id}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              alternarLacuna(tok.id);
            }}
            title={visivel ? 'Clique para ocultar novamente' : 'Clique para revelar palavra-chave'}
            className={`mx-0.5 inline rounded px-1.5 py-0.5 text-[0.92em] font-medium transition-colors cursor-pointer ${
              visivel
                ? 'bg-emerald-500/20 text-emerald-900 dark:text-emerald-200 underline decoration-emerald-500/50'
                : 'bg-[var(--bg-subtle)] text-transparent select-none border border-dashed border-[var(--text-muted)] hover:border-[var(--accent-primary)]'
            }`}
          >
            {tok.texto}
          </button>
        );
      });
    }

    const partesRemissao = dividirTextoComRemissoes(textoSeg);
    let offsetLocal = 0;

    return partesRemissao.map((parte, idx) => {
      const segOffset = inicioSeg + offsetLocal;
      offsetLocal += parte.texto.length;

      if (parte.ehRemissao) {
        if (ocultarRemissoes) {
          return (
            <span
              key={idx}
              data-seg-offset={segOffset}
              className="hidden"
              aria-hidden="true"
            >
              {parte.texto}
            </span>
          );
        }
        return (
          <span
            key={idx}
            data-seg-offset={segOffset}
            className="text-[0.82em] text-[var(--text-muted)] opacity-85"
          >
            {parte.texto}
          </span>
        );
      }

      return (
        <span key={idx} data-seg-offset={segOffset}>
          {parte.texto}
        </span>
      );
    });
  };

  const prefixoBloco =
    bloco.tipo === 'caput'
      ? tipoUnidade === 'artigo'
        ? `Art. ${artigoNumero}.`
        : tipoUnidade === 'secao'
        ? ''
        : `${bloco.rotulo}:`
      : tipoUnidade === 'secao'
      ? ''
      : bloco.rotulo;

  return (
    <div className={`group/bloco relative ${paddingNivel}`}>
      <p className="text-[var(--text-primary)]">
        {prefixoBloco && (
          <strong className="mr-1.5 font-semibold text-[var(--text-primary)] select-none">
            {prefixoBloco}
          </strong>
        )}

        <span data-bloco-id={bloco.id}>
          {segmentos.map((seg, idx) => {
            const grifoPrincipal = seg.grifos[seg.grifos.length - 1];
            const cor = grifoPrincipal ? mapaCores.get(grifoPrincipal.corId) : null;
            const notasAqui = notasPorFim.get(seg.fim) || [];

            const fundoEstilo = cor
              ? {
                  backgroundColor: temaEscuro ? cor.hexBgDark : cor.hexBg,
                  borderBottom:
                    seg.grifos.length > 1
                      ? `2px solid ${cor.hexBorder}`
                      : `1px solid ${cor.hexBorder}66`,
                }
              : undefined;

            const noModoClozeComGrifo = modoMemorizacao && !!grifoPrincipal;
            const clozeGrifoId = `grf_${bloco.id}_${seg.inicio}_${seg.fim}`;
            const grifoRevelado = revelarTudo || !!lacunasReveladas[clozeGrifoId];

            return (
              <React.Fragment key={`${seg.inicio}_${idx}`}>
                {noModoClozeComGrifo ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      alternarLacuna(clozeGrifoId);
                    }}
                    style={grifoRevelado ? fundoEstilo : undefined}
                    className={`mx-0.5 inline rounded px-1.5 py-0.5 text-left transition-colors cursor-pointer ${
                      grifoRevelado
                        ? 'text-[var(--text-primary)]'
                        : 'bg-[var(--bg-subtle)] text-transparent select-none border border-dashed border-[var(--accent-primary)]'
                    }`}
                    title={
                      grifoRevelado
                        ? 'Clique para ocultar trecho grifado'
                        : 'Trecho grifado oculto — clique para revelar'
                    }
                  >
                    {seg.texto}
                  </button>
                ) : grifoPrincipal ? (
                  <mark
                    data-grifo-id={grifoPrincipal.id}
                    style={fundoEstilo}
                    onClick={(e) => {
                      e.stopPropagation();
                      onClicarGrifo(grifoPrincipal, e.currentTarget.getBoundingClientRect());
                    }}
                    className="rounded-xs px-0.5 text-inherit cursor-pointer transition-opacity hover:opacity-85"
                    title={`${cor?.nome || 'Grifo'}${cor?.significado ? `: ${cor.significado}` : ''} (clique para editar)`}
                  >
                    {renderSegmentoTexto(seg.texto, seg.inicio)}
                  </mark>
                ) : (
                  renderSegmentoTexto(seg.texto, seg.inicio)
                )}

                {notasAqui.map((nota) => (
                  <button
                    key={nota.id}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onClicarIconeNota(nota);
                    }}
                    title="Abrir anotação vinculada a este trecho"
                    aria-label="Abrir anotação vinculada"
                    className="mx-1 inline-flex items-center align-middle rounded border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-0.5 text-[var(--accent-primary)] hover:bg-[var(--bg-surface)] cursor-pointer select-none"
                  >
                    <MessageSquareText className="h-3 w-3" aria-hidden="true" />
                  </button>
                ))}
              </React.Fragment>
            );
          })}
        </span>
      </p>
    </div>
  );
};
