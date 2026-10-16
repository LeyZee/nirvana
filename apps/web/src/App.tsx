import { attachGlassLight } from '@nirvana/design-system';
import { useEffect, useRef, type JSX } from 'react';

import { cn } from '@/lib/utils';

export function App(): JSX.Element {
  const card = useRef<HTMLDivElement>(null);

  useEffect(() => (card.current ? attachGlassLight(card.current) : undefined), []);

  return (
    <main className="nv-aura grid min-h-dvh place-items-center p-4">
      <div ref={card} className={cn('nv-glass nv-glass--pad', 'flex flex-col items-center gap-2 px-10 py-8')}>
        <h1 className="nv-wordmark text-title-1">Nirvana</h1>
        <p className="text-footnote text-ink-muted">Le dashboard arrive en phase 4.</p>
      </div>
    </main>
  );
}
