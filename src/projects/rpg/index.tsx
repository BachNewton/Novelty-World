'use client';

import { useEffect, useState } from 'react';
import GameWorld from './game-world';
import { MapEditor } from './map-editor';

export function RpgGame() {
  const [mode, setMode] = useState<'play' | 'edit'>('play');

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Backquote') {
        setMode((m) => (m === 'play' ? 'edit' : 'play'));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  if (mode === 'edit') return <MapEditor />;
  // Fixed positioning keeps play mode exactly viewport-sized: h-dvh/w-screen
  // can exceed by a pixel (fractional dvh) or by scrollbar width (100vw),
  // either of which summons page scrollbars.
  return (
    <div className="fixed inset-0 overflow-hidden bg-black">
      <GameWorld />
    </div>
  );
}
