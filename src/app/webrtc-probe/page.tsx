"use client";

// TEMPORARY diagnostic: can two devices open a plain WebRTC data channel?
// Signalling over Supabase Realtime broadcast, Google STUN only, no PeerJS.
// Delete once the Frogmino connection question is answered.

import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/shared/lib/supabase/client";

type Role = "host" | "guest";

type Signal =
  | { kind: "hello"; from: Role }
  | { kind: "offer"; attempt: number; sdp: RTCSessionDescriptionInit }
  | { kind: "answer"; attempt: number; sdp: RTCSessionDescriptionInit }
  | { kind: "candidate"; attempt: number; from: Role; candidate: RTCIceCandidateInit };

const ICE_SERVERS: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];

function describeCandidate(c: { type?: string | null; protocol?: string | null; address?: string | null; port?: number | null }): string {
  return `${c.type ?? "?"} ${c.protocol ?? "?"} ${c.address ?? "?"}:${c.port ?? "?"}`;
}

export default function WebRtcProbePage() {
  const [role, setRole] = useState<Role | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [summary, setSummary] = useState("Not started");
  const startedAt = useRef(0);

  function start(chosen: Role) {
    startedAt.current = performance.now();
    setLog([`0.0s  started as ${chosen}`]);
    setSummary("Waiting for the other device…");
    setRole(chosen);
  }

  useEffect(() => {
    if (role === null) return;
    const me = role;
    const write = (line: string) => {
      const t = ((performance.now() - startedAt.current) / 1000).toFixed(1);
      setLog((lines) => [...lines, `${t}s  ${line}`]);
    };

    const supabase = createClient();
    const channel: RealtimeChannel = supabase.channel("webrtc-probe", { config: { broadcast: { self: false } } });
    const send = (signal: Signal) => void channel.send({ type: "broadcast", event: "signal", payload: signal });

    let pc: RTCPeerConnection | null = null;
    let attempt = 0;
    let pending: RTCIceCandidateInit[] = [];
    let ping: number | undefined;

    function newConnection(forAttempt: number): RTCPeerConnection {
      pc?.close();
      window.clearInterval(ping);
      pending = [];
      attempt = forAttempt;
      const conn = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      pc = conn;
      setSummary(`Attempt ${forAttempt}: connecting…`);
      conn.onicecandidate = (e) => {
        if (e.candidate === null) {
          write("local: gathering complete");
          return;
        }
        write(`local candidate: ${describeCandidate(e.candidate)}`);
        send({ kind: "candidate", attempt: forAttempt, from: me, candidate: e.candidate.toJSON() });
      };
      conn.onicecandidateerror = (e) => {
        const err = e as RTCPeerConnectionIceErrorEvent;
        write(`candidate error: ${err.errorCode} ${err.errorText} (${err.url})`);
      };
      conn.oniceconnectionstatechange = () => write(`ICE state: ${conn.iceConnectionState}`);
      conn.onconnectionstatechange = () => {
        write(`connection state: ${conn.connectionState}`);
        if (conn.connectionState === "connected") void reportRoute(conn);
        if (conn.connectionState === "failed") setSummary(`FAILED: the devices could not reach each other (attempt ${forAttempt})`);
      };
      conn.ondatachannel = (e) => wireChannel(e.channel);
      return conn;
    }

    async function reportRoute(conn: RTCPeerConnection) {
      const stats = await conn.getStats();
      let pairId: string | undefined;
      stats.forEach((s: { type: string; selectedCandidatePairId?: string }) => {
        if (s.type === "transport" && s.selectedCandidatePairId !== undefined) pairId = s.selectedCandidatePairId;
      });
      const pair = pairId === undefined ? undefined : (stats.get(pairId) as { localCandidateId: string; remoteCandidateId: string } | undefined);
      if (pair === undefined) {
        write("connected, but the browser did not report the route");
        return;
      }
      const local = stats.get(pair.localCandidateId) as { candidateType: string; protocol: string; address?: string; port: number };
      const remote = stats.get(pair.remoteCandidateId) as { candidateType: string; protocol: string; address?: string; port: number };
      write(`route: local ${describeCandidate({ ...local, type: local.candidateType })} ⇄ remote ${describeCandidate({ ...remote, type: remote.candidateType })}`);
    }

    function wireChannel(dc: RTCDataChannel) {
      dc.onopen = () => {
        write("data channel OPEN");
        setSummary("CONNECTED: the devices can reach each other");
        ping = window.setInterval(() => dc.send(JSON.stringify({ ping: performance.now() })), 1000);
      };
      dc.onclose = () => write("data channel closed");
      dc.onmessage = (e) => {
        const data = JSON.parse(String(e.data)) as { ping?: number; pong?: number };
        if (data.ping !== undefined) dc.send(JSON.stringify({ pong: data.ping }));
        if (data.pong !== undefined) setSummary(`CONNECTED: round trip ${(performance.now() - data.pong).toFixed(0)} ms`);
      };
    }

    async function applyCandidates(conn: RTCPeerConnection) {
      for (const c of pending) await conn.addIceCandidate(c);
      pending = [];
    }

    async function offer() {
      const conn = newConnection(Date.now());
      wireChannel(conn.createDataChannel("probe"));
      const sdp = await conn.createOffer();
      await conn.setLocalDescription(sdp);
      write("sent offer");
      send({ kind: "offer", attempt, sdp });
    }

    async function onSignal(signal: Signal) {
      if (signal.kind === "hello") {
        write(`signalling: saw the ${signal.from}`);
        if (me === "guest") await offer();
        else send({ kind: "hello", from: "host" });
      } else if (signal.kind === "offer" && me === "host") {
        write("got offer");
        const conn = newConnection(signal.attempt);
        await conn.setRemoteDescription(signal.sdp);
        await applyCandidates(conn);
        const sdp = await conn.createAnswer();
        await conn.setLocalDescription(sdp);
        write("sent answer");
        send({ kind: "answer", attempt: signal.attempt, sdp });
      } else if (signal.kind === "answer" && me === "guest" && signal.attempt === attempt && pc !== null) {
        write("got answer");
        await pc.setRemoteDescription(signal.sdp);
        await applyCandidates(pc);
      } else if (signal.kind === "candidate" && signal.from !== me && signal.attempt === attempt && pc !== null) {
        write(`remote candidate: ${describeCandidate(new RTCIceCandidate(signal.candidate))}`);
        if (pc.remoteDescription === null) pending.push(signal.candidate);
        else await pc.addIceCandidate(signal.candidate);
      }
    }

    channel.on("broadcast", { event: "signal" }, ({ payload }) => void onSignal(payload as Signal));
    channel.subscribe((status) => {
      write(`signalling: ${status}`);
      if (status === "SUBSCRIBED") send({ kind: "hello", from: me });
    });

    return () => {
      window.clearInterval(ping);
      pc?.close();
      void supabase.removeChannel(channel);
    };
  }, [role]);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 bg-surface-primary p-4 text-text-primary">
      <h1 className="text-xl font-bold">WebRTC probe</h1>
      <p className="text-text-secondary">
        Open this page on both devices. Press Host on one and Guest on the other, in either order.
      </p>
      {role === null ? (
        <div className="flex gap-3">
          <button className="rounded border border-border-default px-4 py-2" onClick={() => start("host")}>
            Host
          </button>
          <button className="rounded border border-border-default px-4 py-2" onClick={() => start("guest")}>
            Guest
          </button>
        </div>
      ) : (
        <p className="text-lg font-bold">
          {role}: {summary}
        </p>
      )}
      <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded bg-surface-secondary p-3 text-xs">{log.join("\n")}</pre>
    </main>
  );
}
