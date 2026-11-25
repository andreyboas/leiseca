/**
 * Animação de carregamento do Lei Seca: três Vade Mecum (roxo, vermelho e verde)
 * caem um sobre o outro até formar a pilha da logo, e o ciclo recomeça enquanto o site carrega.
 */

const CSS = `
.lsl-svg{display:block;width:100%;height:100%;overflow:hidden}
.lsl-livro,.lsl-sombra{transform-box:fill-box;transform-origin:50% 100%;will-change:transform;backface-visibility:hidden}
.lsl-sombra{transform-origin:50% 50%}
.lsl-1{animation:lsl-roxo 3.6s linear infinite}
.lsl-2{animation:lsl-vermelho 3.6s linear infinite}
.lsl-3{animation:lsl-verde 3.6s linear infinite}
.lsl-sombra{animation:lsl-sombra 3.6s linear infinite}
.lsl-pilha{animation:lsl-saida 3.6s linear infinite}

@keyframes lsl-roxo{
  0%{transform:translateY(-300px) rotate(-5deg);animation-timing-function:cubic-bezier(.5,0,1,.6)}
  16%{transform:translateY(0) rotate(0) scale(1,1);animation-timing-function:ease-out}
  17.5%{transform:scale(1.035,.94);animation-timing-function:ease-in-out}
  21%{transform:scale(.99,1.015);animation-timing-function:ease-in-out}
  24%{transform:scale(1,1)}
  33%{transform:scale(1,1);animation-timing-function:ease-out}
  34.5%{transform:scale(1.012,.975);animation-timing-function:ease-in-out}
  38%{transform:scale(1,1)}
  50%{transform:scale(1,1);animation-timing-function:ease-out}
  51.5%{transform:scale(1.012,.97);animation-timing-function:ease-in-out}
  55%{transform:scale(1,1)}
}
@keyframes lsl-vermelho{
  0%,17%{transform:translateY(-300px) rotate(-5deg);animation-timing-function:cubic-bezier(.5,0,1,.6)}
  33%{transform:translateY(0) rotate(0) scale(1,1);animation-timing-function:ease-out}
  34.5%{transform:scale(1.035,.94);animation-timing-function:ease-in-out}
  38%{transform:scale(.99,1.015);animation-timing-function:ease-in-out}
  41%{transform:scale(1,1)}
  50%{transform:scale(1,1);animation-timing-function:ease-out}
  51.5%{transform:scale(1.012,.97);animation-timing-function:ease-in-out}
  55%{transform:scale(1,1)}
}
@keyframes lsl-verde{
  0%,34%{transform:translateY(-300px) rotate(-5deg);animation-timing-function:cubic-bezier(.5,0,1,.6)}
  50%{transform:translateY(0) rotate(0) scale(1,1);animation-timing-function:ease-out}
  51.5%{transform:scale(1.035,.94);animation-timing-function:ease-in-out}
  55%{transform:scale(.99,1.015);animation-timing-function:ease-in-out}
  58%{transform:scale(1,1)}
}
@keyframes lsl-saida{
  0%,88%{opacity:1;animation-timing-function:ease-in}
  96%,100%{opacity:0}
}
@keyframes lsl-sombra{
  0%,10%{transform:scaleX(.45);opacity:0;animation-timing-function:ease-out}
  16%{transform:scaleX(.72);opacity:.22;animation-timing-function:ease-out}
  33%{transform:scaleX(.86);opacity:.27;animation-timing-function:ease-out}
  50%{transform:scaleX(1);opacity:.32}
  88%{transform:scaleX(1);opacity:.32;animation-timing-function:ease-in}
  96%,100%{transform:scaleX(1);opacity:0}
}
@media (prefers-reduced-motion:reduce){
  .lsl-livro,.lsl-sombra{animation:none!important;transform:none!important;opacity:1}
  .lsl-sombra{opacity:.3}
  .lsl-pilha{animation:lsl-pulso 1.8s ease-in-out infinite!important}
}
@keyframes lsl-pulso{0%,100%{opacity:1}50%{opacity:.55}}
`;

const TAMANHOS = {
  xs: 'w-10',
  sm: 'w-16',
  md: 'w-28',
  lg: 'w-40',
  xl: 'w-56',
} as const;

interface BookLoaderProps {
  size?: keyof typeof TAMANHOS;
  texto?: string;
  mostrarTexto?: boolean;
  comFundo?: boolean;
  className?: string;
}

export function BookLoader({
  size = 'md',
  texto = 'Carregando…',
  mostrarTexto = false,
  comFundo = false,
  className = '',
}: BookLoaderProps) {
  return (
    <span
      role="status"
      aria-live="polite"
      className={`inline-flex flex-col items-center gap-3 ${className}`}
    >
      <style>{CSS}</style>
      <span className={`block aspect-[412/372] ${TAMANHOS[size]}`} aria-hidden="true">
        <svg viewBox="50 40 412 372" className="lsl-svg" focusable="false">
          {comFundo && <rect x="50" y="40" width="412" height="372" rx="64" fill="#0F1B2D" />}
          <ellipse className="lsl-sombra" cx="256" cy="392" rx="190" ry="12" fill="#000" />
          <g className="lsl-pilha">
            <g className="lsl-livro lsl-1" strokeLinejoin="round">
              <path d="M359 305 L423 279 L423 351 L359 377 Z" fill="#4F2E80" stroke="#4F2E80" strokeWidth="4" />
              <path d="M359 315 L423 289 L423 341 L359 367 Z" fill="#FBF3DC" />
              <g stroke="#D9CFB3" strokeWidth="2" fill="none"><path d="M359 328 L423 302" /><path d="M359 341 L423 315" /><path d="M359 354 L423 328" /></g>
              <path d="M79 305 L359 305 L423 279 L143 279 Z" fill="#8C63C7" stroke="#8C63C7" strokeWidth="4" />
              <rect x="79" y="305" width="280" height="72" fill="#6C41A8" stroke="#6C41A8" strokeWidth="4" />
              <rect x="99" y="305" width="6" height="72" fill="#E9C46A" />
              <rect x="333" y="305" width="6" height="72" fill="#E9C46A" />
              <rect x="165" y="323" width="108" height="36" rx="4" fill="#FBF3DC" stroke="#E9C46A" strokeWidth="3" />
            </g>
            <g className="lsl-livro lsl-2" strokeLinejoin="round">
              <path d="M369 233 L433 207 L433 279 L369 305 Z" fill="#9A2630" stroke="#9A2630" strokeWidth="4" />
              <path d="M369 243 L433 217 L433 269 L369 295 Z" fill="#FBF3DC" />
              <g stroke="#D9CFB3" strokeWidth="2" fill="none"><path d="M369 256 L433 230" /><path d="M369 269 L433 243" /><path d="M369 282 L433 256" /></g>
              <path d="M97 233 L369 233 L433 207 L161 207 Z" fill="#E4616B" stroke="#E4616B" strokeWidth="4" />
              <rect x="97" y="233" width="272" height="72" fill="#C73641" stroke="#C73641" strokeWidth="4" />
              <rect x="117" y="233" width="6" height="72" fill="#E9C46A" />
              <rect x="343" y="233" width="6" height="72" fill="#E9C46A" />
              <rect x="179" y="251" width="108" height="36" rx="4" fill="#FBF3DC" stroke="#E9C46A" strokeWidth="3" />
            </g>
            <g className="lsl-livro lsl-3" strokeLinejoin="round">
              <path d="M349 161 L413 135 L413 207 L349 233 Z" fill="#166B45" stroke="#166B45" strokeWidth="4" />
              <path d="M349 171 L413 145 L413 197 L349 223 Z" fill="#FBF3DC" />
              <g stroke="#D9CFB3" strokeWidth="2" fill="none"><path d="M349 184 L413 158" /><path d="M349 197 L413 171" /><path d="M349 210 L413 184" /></g>
              <path d="M85 161 L349 161 L413 135 L149 135 Z" fill="#3DB27D" stroke="#3DB27D" strokeWidth="4" />
              <rect x="85" y="161" width="264" height="72" fill="#1E8E5C" stroke="#1E8E5C" strokeWidth="4" />
              <rect x="105" y="161" width="6" height="72" fill="#E9C46A" />
              <rect x="323" y="161" width="6" height="72" fill="#E9C46A" />
              <rect x="163" y="179" width="108" height="36" rx="4" fill="#FBF3DC" stroke="#E9C46A" strokeWidth="3" />
              <path d="M177 189 L253 189" stroke="#C9BFA0" strokeWidth="5" strokeLinecap="round" fill="none" />
              <rect x="173" y="196" width="92" height="16" rx="6" fill="#FFD93D" opacity="0.92" />
              <path d="M177 204 L257 204" stroke="#5A4F3A" strokeWidth="5" strokeLinecap="round" fill="none" />
            </g>
          </g>
        </svg>
      </span>
      {mostrarTexto ? (
        <span className="text-sm text-[var(--text-muted)]">{texto}</span>
      ) : (
        <span className="sr-only">{texto}</span>
      )}
    </span>
  );
}

/** Tela cheia centralizada, para quando o site inteiro está carregando. */
export function TelaCarregando({ texto = 'Carregando sua biblioteca…' }: { texto?: string }) {
  return (
    <div className="app-shell-height flex items-center justify-center bg-[var(--bg-canvas)]">
      <BookLoader size="lg" texto={texto} mostrarTexto />
    </div>
  );
}
