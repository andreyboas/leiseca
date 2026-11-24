interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showWordmark?: boolean;
  wordmarkClassName?: string;
  compactMobileWordmark?: boolean;
  className?: string;
}

/**
 * Logo do Lei Seca: pilha de três Vade Mecum (verde, vermelho e roxo) com marca-texto.
 * Tamanhos pequenos usam a versão simplificada (mais legível); grandes usam a completa.
 */
const TAMANHOS = {
  sm: { box: 'h-7 w-7', completa: false },
  md: { box: 'h-8 w-8', completa: false },
  lg: { box: 'h-11 w-11', completa: true },
  xl: { box: 'h-14 w-14', completa: true },
} as const;

function LogoSimples() {
  return (
    <svg viewBox="48 110 416 292" className="h-full w-full" aria-hidden="true" focusable="false">
      <g transform="translate(256 256) scale(1.12) translate(-256 -256)" strokeLinejoin="round">
        <path d="M359 305 L423 279 L423 351 L359 377 Z" fill="#4F2E80" stroke="#4F2E80" strokeWidth="4" />
        <path d="M359 315 L423 289 L423 341 L359 367 Z" fill="#FBF3DC" />
        <path d="M79 305 L359 305 L423 279 L143 279 Z" fill="#8C63C7" stroke="#8C63C7" strokeWidth="4" />
        <rect x="79" y="305" width="280" height="72" fill="#6C41A8" stroke="#6C41A8" strokeWidth="4" />
        <rect x="99" y="305" width="10" height="72" fill="#E9C46A" />
        <rect x="329" y="305" width="10" height="72" fill="#E9C46A" />
        <path d="M369 233 L433 207 L433 279 L369 305 Z" fill="#9A2630" stroke="#9A2630" strokeWidth="4" />
        <path d="M369 243 L433 217 L433 269 L369 295 Z" fill="#FBF3DC" />
        <path d="M97 233 L369 233 L433 207 L161 207 Z" fill="#E4616B" stroke="#E4616B" strokeWidth="4" />
        <rect x="97" y="233" width="272" height="72" fill="#C73641" stroke="#C73641" strokeWidth="4" />
        <rect x="117" y="233" width="10" height="72" fill="#E9C46A" />
        <rect x="339" y="233" width="10" height="72" fill="#E9C46A" />
        <path d="M349 161 L413 135 L413 207 L349 233 Z" fill="#166B45" stroke="#166B45" strokeWidth="4" />
        <path d="M349 171 L413 145 L413 197 L349 223 Z" fill="#FBF3DC" />
        <path d="M85 161 L349 161 L413 135 L149 135 Z" fill="#3DB27D" stroke="#3DB27D" strokeWidth="4" />
        <rect x="85" y="161" width="264" height="72" fill="#1E8E5C" stroke="#1E8E5C" strokeWidth="4" />
        <rect x="105" y="161" width="10" height="72" fill="#E9C46A" />
        <rect x="319" y="161" width="10" height="72" fill="#E9C46A" />
        <rect x="150" y="185" width="140" height="24" rx="9" fill="#FFD93D" />
      </g>
    </svg>
  );
}

function LogoCompleta() {
  return (
    <svg viewBox="68 124 376 264" className="h-full w-full" aria-hidden="true" focusable="false">
      <g strokeLinejoin="round">
        <g>
          <path d="M359 305 L423 279 L423 351 L359 377 Z" fill="#4F2E80" stroke="#4F2E80" strokeWidth="4" />
          <path d="M359 315 L423 289 L423 341 L359 367 Z" fill="#FBF3DC" />
          <g stroke="#D9CFB3" strokeWidth="2" fill="none">
            <path d="M359 328 L423 302" />
            <path d="M359 341 L423 315" />
            <path d="M359 354 L423 328" />
          </g>
        </g>
        <path d="M79 305 L359 305 L423 279 L143 279 Z" fill="#8C63C7" stroke="#8C63C7" strokeWidth="4" />
        <g>
          <rect x="79" y="305" width="280" height="72" fill="#6C41A8" stroke="#6C41A8" strokeWidth="4" />
          <rect x="99" y="305" width="6" height="72" fill="#E9C46A" />
          <rect x="333" y="305" width="6" height="72" fill="#E9C46A" />
          <rect x="165" y="323" width="108" height="36" rx="4" fill="#FBF3DC" stroke="#E9C46A" strokeWidth="3" />
        </g>
      </g>
      <g strokeLinejoin="round">
        <g>
          <path d="M369 233 L433 207 L433 279 L369 305 Z" fill="#9A2630" stroke="#9A2630" strokeWidth="4" />
          <path d="M369 243 L433 217 L433 269 L369 295 Z" fill="#FBF3DC" />
          <g stroke="#D9CFB3" strokeWidth="2" fill="none">
            <path d="M369 256 L433 230" />
            <path d="M369 269 L433 243" />
            <path d="M369 282 L433 256" />
          </g>
        </g>
        <path d="M97 233 L369 233 L433 207 L161 207 Z" fill="#E4616B" stroke="#E4616B" strokeWidth="4" />
        <g>
          <rect x="97" y="233" width="272" height="72" fill="#C73641" stroke="#C73641" strokeWidth="4" />
          <rect x="117" y="233" width="6" height="72" fill="#E9C46A" />
          <rect x="343" y="233" width="6" height="72" fill="#E9C46A" />
          <rect x="179" y="251" width="108" height="36" rx="4" fill="#FBF3DC" stroke="#E9C46A" strokeWidth="3" />
        </g>
      </g>
      <g strokeLinejoin="round">
        <g>
          <path d="M349 161 L413 135 L413 207 L349 233 Z" fill="#166B45" stroke="#166B45" strokeWidth="4" />
          <path d="M349 171 L413 145 L413 197 L349 223 Z" fill="#FBF3DC" />
          <g stroke="#D9CFB3" strokeWidth="2" fill="none">
            <path d="M349 184 L413 158" />
            <path d="M349 197 L413 171" />
            <path d="M349 210 L413 184" />
          </g>
        </g>
        <path d="M85 161 L349 161 L413 135 L149 135 Z" fill="#3DB27D" stroke="#3DB27D" strokeWidth="4" />
        <g>
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
  );
}

export function BrandLogo({
  size = 'md',
  showWordmark = false,
  wordmarkClassName = '',
  compactMobileWordmark = false,
  className = '',
}: BrandLogoProps) {
  const cfg = TAMANHOS[size];

  return (
    <span className={`inline-flex items-center gap-2.5 select-none ${className}`}>
      <span
        aria-hidden="true"
        className={`relative inline-flex shrink-0 items-center justify-center ${cfg.box}`}
      >
        {cfg.completa ? <LogoCompleta /> : <LogoSimples />}
      </span>

      {showWordmark && (
        <span
          className={`font-bold tracking-tight text-[var(--text-primary)] ${
            compactMobileWordmark ? 'hidden sm:inline' : 'inline'
          } ${wordmarkClassName}`}
        >
          Lei Seca
        </span>
      )}
    </span>
  );
}
