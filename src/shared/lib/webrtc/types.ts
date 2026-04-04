export type SignalType = "offer" | "answer" | "ice-candidate";

export interface SignalingMessage {
  type: SignalType;
  from: string;
  to: string;
  payload: RTCSessionDescriptionInit | RTCIceCandidateInit;
}

export interface PeerState {
  id: string;
  connected: boolean;
}

export interface RoomConfig {
  roomId: string;
  maxPeers?: number;
}
