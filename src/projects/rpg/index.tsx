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
  return <GameWorld />;
}
