interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showWordmark?: boolean;
  wordmarkClassName?: string;
  compactMobileWordmark?: boolean;
  className?: string;
}

const TAMANHOS = {
  sm: { box: 'h-7 w-7 rounded-lg', text: 'text-[12px]' },
  md: { box: 'h-8 w-8 rounded-lg', text: 'text-[13px]' },
  lg: { box: 'h-11 w-11 rounded-xl', text: 'text-[17px]' },
  xl: { box: 'h-14 w-14 rounded-2xl', text: 'text-[22px]' },
} as const;

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
        className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden shadow-sm ring-1 ring-black/10 dark:ring-white/15 ${cfg.box}`}
        style={{
          backgroundColor: 'var(--brand-bg, var(--accent-primary))',
          color: '#ffffff',
        }}
      >
        {/* Marca sutil dourada superior inspirada em fita de Vade Mecum */}
        <span
          className="absolute right-1.5 top-0 h-[22%] w-[16%] rounded-b-[2px] opacity-90"
          style={{ backgroundColor: '#d97706' }}
        />
        <span
          className={`font-legal-serif relative z-10 font-bold tracking-[-0.04em] leading-none ${cfg.text}`}
        >
          LS
        </span>
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
