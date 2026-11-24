import React from 'react';
import { parsearHtmlSeguroParaNos, type SafeHtmlNode } from '@/src/utils/security';

interface SafeHtmlContentProps {
  html: string;
  className?: string;
}

function renderizarNoSeguro(no: SafeHtmlNode, key: string): React.ReactNode {
  if (no.tipo === 'texto') {
    return no.texto || '';
  }

  const tag = no.tag || 'span';
  if (tag === 'br') {
    return <br key={key} />;
  }

  const filhos = (no.filhos || []).map((filho, idx) =>
    renderizarNoSeguro(filho, `${key}_${idx}`)
  );

  return React.createElement(tag, { key }, filhos.length > 0 ? filhos : null);
}

export const SafeHtmlContent: React.FC<SafeHtmlContentProps> = ({ html, className }) => {
  const nos = React.useMemo(() => parsearHtmlSeguroParaNos(html), [html]);

  return (
    <div className={className}>
      {nos.map((no, idx) => renderizarNoSeguro(no, `safe_${idx}`))}
    </div>
  );
};
