'use client';

import { useEffect, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { useHydrated } from '@/shared/lib/use-hydrated';
import GameWorld from './game-world';
import { MapEditor } from './map-editor';
import { CELL_PX } from './tiles';
import { DEFAULT_CHARACTER_ID } from './characters';
import { MAP_COLS, MAP_ROWS, createStoredMapStore } from './world-map';
import { roomIdFromSearch } from './coop/protocol';
import { createCoopSession, type CoopSession } from './coop/session';
import { createTransport, peerOptionsFromSearch } from './coop/transport';

export function RpgGame() {
  // The session reads localStorage and the URL, so it only exists client-side.
  const hydrated = useHydrated();
  if (!hydrated) return <div className="fixed inset-0 bg-black" />;
  return <RpgSession />;
}

function RpgSession() {
  const [session] = useState(() => {
    const search = window.location.search;
    const peerOptions = peerOptionsFromSearch(search);
    return createCoopSession({
      roomId: roomIdFromSearch(search),
      map: createStoredMapStore(),
      createTransport: (roomId, events) => createTransport(roomId, events, peerOptions),
      spawn: {
        x: (MAP_COLS * CELL_PX) / 2,
        y: (MAP_ROWS * CELL_PX) / 2,
        dir: 'front',
        flip: false,
        moving: false,
        characterId: DEFAULT_CHARACTER_ID,
      },
    });
  });
  useEffect(() => {
    session.start();
    // Leave the room explicitly when the tab goes away: peers see our
    // channels close at once, and the server frees the room id for the next
    // host, instead of both waiting out WebRTC / signalling timeouts.
    const onPageHide = () => session.stop();
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) session.start();
    };
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('pageshow', onPageShow);
      session.stop();
    };
  }, [session]);

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

  return (
    <>
      {mode === 'edit' ? (
        <MapEditor session={session} />
      ) : (
        // Fixed positioning keeps play mode exactly viewport-sized: h-dvh/w-screen
        // can exceed by a pixel (fractional dvh) or by scrollbar width (100vw),
        // either of which summons page scrollbars.
        <div className="fixed inset-0 overflow-hidden bg-black">
          <GameWorld session={session} />
        </div>
      )}
      <CoopBadges session={session} />
    </>
  );
}

const HIDDEN_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
};

/** Visually hidden co-op state, read by the E2E suite. */
function CoopBadges({ session }: { session: CoopSession }) {
  const snapshot = useSyncExternalStore(session.subscribe, session.snapshot);
  return (
    <>
      <span data-testid="coop-status" style={HIDDEN_STYLE}>{snapshot.status}</span>
      <span data-testid="coop-role" style={HIDDEN_STYLE}>{snapshot.role ?? ''}</span>
      <span data-testid="coop-peer-count" style={HIDDEN_STYLE}>{snapshot.peerCount}</span>
      <span data-testid="coop-remote-count" style={HIDDEN_STYLE}>{snapshot.remoteCount}</span>
    </>
  );
}
