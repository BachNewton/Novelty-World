import type {
  SignalType,
  ConnectionState,
  DataMessage,
  MessageHandler,
  PeerRole,
} from "./types";

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

export interface PeerConnectionConfig {
  role: PeerRole;
  localPeerId: string;
  remotePeerId: string;
  /** Called when this peer needs to send a signal outward (offer, answer, ICE candidate) */
  onSignalOut: (signal: {
    type: SignalType;
    payload: RTCSessionDescriptionInit | RTCIceCandidateInit;
  }) => void;
  onConnectionStateChange?: (state: ConnectionState) => void;
}

/**
 * Pure WebRTC wrapper. Has no knowledge of signaling transport.
 * Signals are fed IN via public methods and emitted OUT via onSignalOut.
 */
export class PeerConnection {
  readonly role: PeerRole;
  readonly peerId: string;
  readonly remotePeerId: string;

  private pc: RTCPeerConnection;
  private dataChannel: RTCDataChannel | null = null;
  private messageHandlers = new Map<string, Set<MessageHandler>>();
  private connectionState: ConnectionState = "new";
  private onSignalOut: PeerConnectionConfig["onSignalOut"];
  private onConnectionStateChange?: (state: ConnectionState) => void;
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private remoteDescriptionSet = false;
  private destroyed = false;

  constructor(config: PeerConnectionConfig) {
    this.role = config.role;
    this.peerId = config.localPeerId;
    this.remotePeerId = config.remotePeerId;
    this.onSignalOut = config.onSignalOut;
    this.onConnectionStateChange = config.onConnectionStateChange;

    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    // Host creates the DataChannel; guest waits for it
    if (this.role === "host") {
      const dc = this.pc.createDataChannel("game");
      this.setupDataChannel(dc);
    } else {
      this.pc.ondatachannel = (event) => {
        this.setupDataChannel(event.channel);
      };
    }

    // Emit ICE candidates via onSignalOut
    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.onSignalOut({
          type: "ice-candidate",
          payload: event.candidate.toJSON(),
        });
      }
    };

    // Track connection state changes
    this.pc.onconnectionstatechange = () => {
      if (this.destroyed) return;
      const state = this.mapConnectionState(this.pc.connectionState);
      this.setConnectionState(state);
    };
  }

  /** Host initiates the WebRTC connection */
  async createOffer(): Promise<void> {
    this.setConnectionState("connecting");
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    this.onSignalOut({
      type: "offer",
      payload: this.pc.localDescription!,
    });
  }

  /** Process an incoming offer (guest). Creates and emits the answer. */
  async handleOffer(offer: RTCSessionDescriptionInit): Promise<void> {
    this.setConnectionState("connecting");
    await this.pc.setRemoteDescription(offer);
    this.remoteDescriptionSet = true;
    await this.drainPendingCandidates();

    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    this.onSignalOut({
      type: "answer",
      payload: this.pc.localDescription!,
    });
  }

  /** Process an incoming answer (host). */
  async handleAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    await this.pc.setRemoteDescription(answer);
    this.remoteDescriptionSet = true;
    await this.drainPendingCandidates();
  }

  /** Process an incoming ICE candidate. Buffers if remote description not yet set. */
  async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.remoteDescriptionSet) {
      this.pendingCandidates.push(candidate);
      return;
    }
    await this.pc.addIceCandidate(candidate);
  }

  /** Send a typed message over the DataChannel */
  send<T>(type: string, payload: T): void {
    if (!this.dataChannel || this.dataChannel.readyState !== "open") return;
    const message: DataMessage<T> = {
      type,
      payload,
      timestamp: Date.now(),
      from: this.peerId,
    };
    this.dataChannel.send(JSON.stringify(message));
  }

  /** Register a handler for a specific message type. Returns unsubscribe fn. */
  onMessage<T>(type: string, handler: MessageHandler<T>): () => void {
    let handlers = this.messageHandlers.get(type);
    if (!handlers) {
      handlers = new Set();
      this.messageHandlers.set(type, handlers);
    }
    handlers.add(handler as MessageHandler);
    return () => {
      handlers!.delete(handler as MessageHandler);
    };
  }

  getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  /** Tear down the connection */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    if (this.dataChannel) {
      this.dataChannel.close();
      this.dataChannel = null;
    }

    this.pc.close();
    this.messageHandlers.clear();
    this.pendingCandidates = [];
  }

  // --- Private methods ---

  private async drainPendingCandidates(): Promise<void> {
    const candidates = [...this.pendingCandidates];
    this.pendingCandidates = [];
    for (const candidate of candidates) {
      await this.pc.addIceCandidate(candidate);
    }
  }

  private setupDataChannel(dc: RTCDataChannel): void {
    this.dataChannel = dc;

    dc.onopen = () => {
      this.setConnectionState("connected");
    };

    dc.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data as string) as DataMessage;
        const handlers = this.messageHandlers.get(message.type);
        if (handlers) {
          for (const handler of handlers) {
            handler(message);
          }
        }
      } catch {
        // Ignore malformed messages
      }
    };

    dc.onclose = () => {
      if (!this.destroyed) {
        this.setConnectionState("disconnected");
      }
    };
  }

  private setConnectionState(state: ConnectionState): void {
    if (state !== this.connectionState) {
      this.connectionState = state;
      this.onConnectionStateChange?.(state);
    }
  }

  private mapConnectionState(
    state: RTCPeerConnectionState,
  ): ConnectionState {
    switch (state) {
      case "new":
        return "new";
      case "connecting":
        return "connecting";
      case "connected":
        return "connected";
      case "disconnected":
        return "disconnected";
      case "failed":
      case "closed":
        return "failed";
      default:
        return "new";
    }
  }
}
