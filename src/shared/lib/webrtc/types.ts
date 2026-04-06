export type SignalType = "offer" | "answer" | "ice-candidate";

export interface SignalingMessage {
  type: SignalType;
  from: string;
  to: string;
  payload: RTCSessionDescriptionInit | RTCIceCandidateInit;
}

export interface PeerState {
  id: string;
  status: ConnectionState;
}

/** Role in the room */
export type PeerRole = "host" | "guest";

/** Message sent over DataChannel — generic envelope */
export interface DataMessage<T = unknown> {
  type: string;
  payload: T;
  timestamp: number;
  from: string;
}

/** Callback for incoming DataChannel messages */
export type MessageHandler<T = unknown> = (message: DataMessage<T>) => void;

/** Connection lifecycle */
export type ConnectionState =
  | "new"
  | "connecting"
  | "connected"
  | "disconnected"
  | "failed";

/** Return type of the usePeer hook */
export interface PeerHookState {
  peerId: string;
  role: PeerRole;
  peers: PeerState[];
  connectionState: ConnectionState;
  /** True when at least one peer is connected */
  isConnected: boolean;
  /** True when peers.length === maxPeers (all expected peers joined) */
  allConnected: boolean;
  /** Broadcast a message to all connected peers */
  send: <T>(type: string, payload: T) => void;
  /** Send a message to a specific peer */
  sendTo: <T>(peerId: string, type: string, payload: T) => void;
  /** Listen for messages of a given type from any peer. Returns unsubscribe fn. */
  onMessage: <T>(
    type: string,
    handler: MessageHandler<T>,
  ) => () => void;
  /** Listen for peers leaving (disconnected or failed). Returns unsubscribe fn. */
  onPeerLeave: (handler: (peerId: string) => void) => () => void;
  /** Tear down all connections and signaling */
  disconnect: () => void;
}
