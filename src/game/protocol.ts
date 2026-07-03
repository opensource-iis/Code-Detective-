/**
 * Shared wire protocol and public state shapes.
 * See ARCHITECTURE.md — this file is imported by both the PartyKit server
 * and the Next.js client. It must stay framework-free.
 */

export type Tier = "rookie" | "detective" | "inspector";

export type Phase =
  | "lobby"
  | "briefing"
  | "evidence"
  | "investigation"
  | "suspense"
  | "reveal"
  | "docket"
  | "final";

export type CaseFormat = "mcq" | "text";

export interface RoomConfig {
  tier: Tier;
  caseCount: number;
}

export interface PlayerPublic {
  id: string;
  name: string;
  connected: boolean;
  spectator: boolean;
  score: number;
  streak: number;
  ready: boolean;
  resolved: boolean;
  solved: boolean;
  attemptsUsed: number;
  lastDelta: number;
}

/** One MCQ candidate: a proposed replacement for a specific line. */
export interface CaseOption {
  line: number;
  text: string;
  note?: string;
}

/** What clients are allowed to see of a case while it is being played. */
export interface CasePublic {
  id: string;
  title: string;
  format: CaseFormat;
  code: string;
  brokenOutput: string;
  crashed: boolean;
  options: CaseOption[] | null;
}

/** The answer key — enters the wire only after a round ends. */
export interface RevealPublic {
  culpritLine: number;
  fixedLines: string[];
  explanation: string;
  correctOption: number | null;
  histogram: number[] | null;
  solvedCount: number;
  attemptedCount: number;
  fixedOutput: string;
}

export interface AwardEntry {
  playerName: string;
  detail: string;
}

export interface Awards {
  fastestSolve: AwardEntry | null;
  ironStreak: AwardEntry | null;
  sharpestRebound: AwardEntry | null;
}

export interface RoomStatePublic {
  phase: Phase;
  config: RoomConfig;
  caseIndex: number;
  caseTotal: number;
  doublePoints: boolean;
  currentCase: CasePublic | null;
  reveal: RevealPublic | null;
  players: PlayerPublic[];
  phaseEndsAt: number | null;
  phaseDurationMs: number | null;
  paused: boolean;
  podium: PlayerPublic[] | null;
  awards: Awards | null;
}

export type SubmittedAnswer =
  | { kind: "mcq"; option: number }
  | { kind: "text"; text: string };

export type ClientMessage =
  | { type: "host:init"; hostKey: string; config: RoomConfig }
  | { type: "host:advance" }
  | { type: "host:kick"; playerId: string }
  | { type: "join"; name: string }
  | { type: "ready" }
  | { type: "submit"; answer: SubmittedAnswer };

export type ErrorCode =
  | "ROOM_NOT_FOUND"
  | "ROOM_TAKEN"
  | "BAD_PHASE"
  | "BAD_MESSAGE"
  | "NOT_A_PLAYER"
  | "NOT_THE_HOST"
  | "NAME_REJECTED"
  | "ROOM_FULL";

export type ServerMessage =
  | { type: "state"; state: RoomStatePublic }
  | { type: "joined"; playerId: string; name: string }
  | {
      type: "feedback";
      attempt: number;
      correct: boolean;
      solved: boolean;
      delta: number;
      hint: string | null;
    }
  /** Targeted at a reconnecting player mid-INVESTIGATION: restores their round. */
  | {
      type: "resume";
      attemptsUsed: number;
      wrongOptions: number[];
      hint: string | null;
    }
  | { type: "kicked" }
  | { type: "error"; code: ErrorCode; message: string };

export const MAX_PLAYERS = 60;
export const MAX_ATTEMPTS = 3;
export const CASE_COUNT_CHOICES = [3, 5] as const;

export const MAX_MESSAGE_CHARS = 4096;

export function parseClientMessage(raw: string): ClientMessage {
  if (raw.length > MAX_MESSAGE_CHARS) {
    throw new Error(`Message exceeds ${MAX_MESSAGE_CHARS} characters`);
  }
  const parsed: unknown = JSON.parse(raw);
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof (parsed as { type?: unknown }).type !== "string"
  ) {
    throw new Error("Message has no type");
  }
  return parsed as ClientMessage;
}
