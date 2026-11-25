import { WifiOff } from 'lucide-react';
import React, { useEffect, useState } from 'react';

export const OfflineIndicator: React.FC = () => {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOnline) return null;

  return (
    <div className="print-hidden pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center lg:justify-start px-3 sm:px-6 pb-[max(1rem,env(safe-area-inset-bottom,0px))]">
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-auto flex w-full sm:w-auto max-w-md items-center justify-center gap-2 rounded-xl border border-amber-500/40 bg-amber-950/95 px-3.5 py-2.5 text-center text-xs font-medium text-amber-100 shadow-lg"
      >
        <WifiOff className="h-3.5 w-3.5 shrink-0 text-amber-300" aria-hidden="true" />
        <span className="min-w-0 leading-snug [overflow-wrap:anywhere]">
          Modo offline — seus dados locais continuam salvos automaticamente.
        </span>
      </div>
    </div>
  );
};
