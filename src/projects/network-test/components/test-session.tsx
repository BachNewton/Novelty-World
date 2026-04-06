"use client";

import { useEffect, useCallback, useRef, useMemo } from "react";
import type { LobbyRoomState } from "@/shared/lib/multiplayer";
import { useNetworkTestStore } from "../store";
import { MSG } from "../types";
import type { ProgressPayload, LinkTestResult } from "../types";
import { formatPlayer } from "../logic";
import { installTestResponders } from "../test-responder";
import { coordinateTestSuite } from "../test-coordinator";
import { TestProgress } from "./test-progress";
import { TestResults } from "./test-results";
import { Button } from "@/shared/components/ui/button";

interface TestSessionProps {
  room: LobbyRoomState;
  onLeave: () => void;
}

export function TestSession({ room, onLeave }: TestSessionProps) {
  const { isHost, send, sendTo, onMessage, players, playerId, playerRoster } =
    room;
  const testPhase = useNetworkTestStore((s) => s.testPhase);
  const abortRef = useRef<AbortController | null>(null);

  // Derive local peerId from roster
  const localPeerId = useMemo(
    () => playerRoster.find((p) => p.playerId === playerId)?.peerId ?? "",
    [playerRoster, playerId],
  );

  // --- Install passive responders on ALL peers ---
  useEffect(() => {
    if (!localPeerId) return;
    return installTestResponders({ sendTo, onMessage, localPeerId });
  }, [sendTo, onMessage, localPeerId]);

  // --- Non-host: listen for progress updates ---
  useEffect(() => {
    if (isHost) return;
    return onMessage<ProgressPayload>(MSG.PROGRESS, (msg) => {
      useNetworkTestStore.getState().updateProgress(msg.payload);
    });
  }, [isHost, onMessage]);

  // --- Non-host: listen for final results ---
  useEffect(() => {
    if (isHost) return;
    return onMessage<LinkTestResult[]>(MSG.FINAL_RESULTS, (msg) => {
      const store = useNetworkTestStore.getState();
      store.setResults(msg.payload);
      store.setTestPhase("done");
    });
  }, [isHost, onMessage]);

  // --- Cleanup on unmount ---
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // --- Host: run the full test suite ---
  const runTestSuite = useCallback(async () => {
    abortRef.current = new AbortController();

    const connectedPeers = players.filter((p) => p.status === "connected");
    const remotePeerIds = connectedPeers.map((p) => p.id);

    await coordinateTestSuite(
      {
        send,
        sendTo,
        onMessage,
        isAborted: () => abortRef.current?.signal.aborted === true,
      },
      localPeerId,
      remotePeerIds,
      playerRoster,
    );
  }, [players, send, sendTo, onMessage, localPeerId, playerRoster]);

  const handleStartTest = useCallback(() => {
    runTestSuite();
  }, [runTestSuite]);

  const handleRunAgain = useCallback(() => {
    useNetworkTestStore.getState().reset();
    runTestSuite();
  }, [runTestSuite]);

  // --- Render ---

  if (room.phase === "disconnected") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
        <h1 className="text-2xl font-bold">Network Test</h1>
        <p className="text-brand-pink font-medium">Player disconnected</p>
        <Button onClick={onLeave}>Back to Lobby</Button>
      </div>
    );
  }

  if (room.phase === "failed") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
        <h1 className="text-2xl font-bold">Network Test</h1>
        <p className="text-red-400 font-medium">Connection failed</p>
        <Button onClick={onLeave}>Back to Lobby</Button>
      </div>
    );
  }

  if (testPhase === "done") {
    return (
      <TestResults
        isHost={isHost}
        onRunAgain={handleRunAgain}
        onLeave={onLeave}
      />
    );
  }

  if (testPhase !== "idle") {
    return <TestProgress />;
  }

  // Idle — waiting for host to start
  const connectedCount = players.filter(
    (p) => p.status === "connected",
  ).length;
  const rosterLabels = playerRoster
    .filter((p) => p.peerId !== localPeerId && p.status === "connected")
    .map((p) => formatPlayer(p.playerName, p.playerId));

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
      <h1 className="text-2xl font-bold">Network Test</h1>
      <p className="text-text-secondary">
        {connectedCount} peer{connectedCount !== 1 ? "s" : ""} connected
      </p>

      {rosterLabels.length > 0 && (
        <p className="text-text-muted text-sm">
          {rosterLabels.join(", ")}
        </p>
      )}

      {isHost ? (
        <Button onClick={handleStartTest}>Start Test</Button>
      ) : (
        <p className="text-text-muted text-sm animate-pulse">
          Waiting for host to start test...
        </p>
      )}

      <Button variant="ghost" onClick={onLeave}>
        Leave
      </Button>
    </div>
  );
}
