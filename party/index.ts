/**
 * The Code Detective room server. One Durable Object room = one game
 * session; single source of truth for all game state — see
 * ARCHITECTURE.md. Built on partyserver (Cloudflare's successor to the
 * hosted PartyKit platform); the partysocket client is unchanged.
 *
 * NOTE: imports are relative (not @/ aliases) because the worker
 * bundler does not resolve tsconfig path aliases.
 */

import {
  routePartykitRequest,
  Server,
  type Connection,
  type ConnectionContext,
  type WSMessage,
} from "partyserver";

import { matchesAccepted, normalizeFix } from "../src/game/answers";
import { casesForTier, getCase, validateBank } from "../src/game/cases";
import type { CaseFile } from "../src/game/cases";
import {
  dedupeName,
  NameRejectedError,
  sanitizeName,
} from "../src/game/names";
import {
  CASE_COUNT_CHOICES,
  MAX_ATTEMPTS,
  MAX_PLAYERS,
  parseClientMessage,
} from "../src/game/protocol";
import type {
  Awards,
  CasePublic,
  ClientMessage,
  ErrorCode,
  Phase,
  PlayerPublic,
  RevealPublic,
  RoomConfig,
  RoomStatePublic,
  ServerMessage,
  SubmittedAnswer,
  Tier,
} from "../src/game/protocol";
import { scoreForSolve } from "../src/game/scoring";
import { BRIEFING_MS, SUSPENSE_MS, TIER_TIMING } from "../src/game/timing";

interface PlayerInternal {
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
  /** MCQ options this player has refuted this round (for reconnect resume). */
  wrongOptions: number[];
  lastDelta: number;
  /** Elapsed ms to the correct submit, this round. */
  solveMsThisRound: number | null;
  /** Score after each completed case (for the rebound award). */
  scoreHistory: number[];
  bestSolveMs: number | null;
  bestSolveCase: string | null;
  longestStreak: number;
}

interface RoomState {
  hostKey: string;
  config: RoomConfig;
  caseIds: string[];
  phase: Phase;
  caseIndex: number;
  players: Record<string, PlayerInternal>;
  /** MCQ attempt counts for the current case (4 slots). */
  histogram: number[];
  phaseEndsAt: number | null;
  phaseDurationMs: number | null;
  /** Non-null while paused mid-timed-phase (host disconnected). */
  pausedRemainingMs: number | null;
}

type ConnMeta =
  | { role: "host" }
  | { role: "player"; playerId: string }
  | { role: "pending" };

class GameError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

const TIERS: Tier[] = ["rookie", "detective", "inspector"];

export class CodeDetective extends Server {
  private state: RoomState | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private conns = new Map<string, ConnMeta>();

  async onStart(): Promise<void> {
    const stored = await this.ctx.storage.get<RoomState>("state");
    if (!stored) return;
    this.state = stored;
    // Connections never survive a restart; presence is rebuilt on connect.
    for (const p of Object.values(this.state.players)) p.connected = false;
    if (this.state.phaseEndsAt !== null) {
      this.armTimer(Math.max(0, this.state.phaseEndsAt - Date.now()));
    }
  }

  async onConnect(
    conn: Connection,
    ctx: ConnectionContext,
  ): Promise<void> {
    const url = new URL(ctx.request.url);
    const role = url.searchParams.get("role");
    const hostKey = url.searchParams.get("hostKey");
    const badge = url.searchParams.get("badge");

    if (role === "host") {
      if (this.state && hostKey === this.state.hostKey) {
        this.conns.set(conn.id, { role: "host" });
        await this.onHostPresent();
        this.sendState(conn);
      } else {
        // Either the room doesn't exist yet (host:init will create it) or
        // this is an impostor (host:init will be rejected).
        this.conns.set(conn.id, { role: "pending" });
      }
      return;
    }

    if (badge) {
      this.conns.set(conn.id, { role: "player", playerId: badge });
      if (!this.state) {
        this.send(conn, {
          type: "error",
          code: "ROOM_NOT_FOUND",
          message: "No such case file. Check the case number.",
        });
        return;
      }
      const player = this.state.players[badge];
      if (player) {
        player.connected = true;
        this.send(conn, { type: "joined", playerId: badge, name: player.name });
      }
      await this.mutated();
      // Resume AFTER the state broadcast: the client resets its per-case
      // local state when a new case id arrives, which would wipe a resume
      // delivered first.
      if (player) this.sendResume(conn, player);
      return;
    }

    this.conns.set(conn.id, { role: "pending" });
  }

  async onClose(
    conn: Connection,
    _code: number,
    _reason: string,
    _wasClean: boolean,
  ): Promise<void> {
    const meta = this.conns.get(conn.id);
    this.conns.delete(conn.id);
    if (!meta || !this.state) return;

    if (meta.role === "host") {
      if (!this.hostConnected()) await this.onHostAbsent();
      return;
    }
    if (meta.role === "player") {
      const stillConnected = [...this.conns.values()].some(
        (m) => m.role === "player" && m.playerId === meta.playerId,
      );
      const player = this.state.players[meta.playerId];
      if (player && !stillConnected) {
        player.connected = false;
        // A dead phone must not stall the room.
        if (this.state.phase === "evidence") this.checkEvidenceEarlyEnd();
        if (this.state.phase === "investigation") {
          this.checkInvestigationEarlyEnd();
        }
        await this.mutated();
      }
    }
  }

  async onMessage(sender: Connection, raw: WSMessage): Promise<void> {
    let message: ClientMessage;
    try {
      if (typeof raw !== "string") {
        throw new Error("Binary messages are not part of the protocol");
      }
      message = parseClientMessage(raw);
    } catch {
      this.send(sender, {
        type: "error",
        code: "BAD_MESSAGE",
        message: "Unreadable message.",
      });
      return;
    }

    try {
      switch (message.type) {
        case "host:init":
          await this.handleHostInit(sender, message.hostKey, message.config);
          break;
        case "host:advance":
          await this.handleHostAdvance(sender);
          break;
        case "host:kick":
          await this.handleHostKick(sender, message.playerId);
          break;
        case "join":
          await this.handleJoin(sender, message.name);
          break;
        case "ready":
          await this.handleReady(sender);
          break;
        case "submit":
          await this.handleSubmit(sender, message.answer);
          break;
        default: {
          const exhaustive: never = message;
          throw new GameError("BAD_MESSAGE", `Unknown type ${exhaustive}`);
        }
      }
    } catch (err) {
      if (err instanceof GameError) {
        this.send(sender, {
          type: "error",
          code: err.code,
          message: err.message,
        });
      } else if (err instanceof NameRejectedError) {
        this.send(sender, {
          type: "error",
          code: "NAME_REJECTED",
          message: err.message,
        });
      } else {
        throw err;
      }
    }
  }

  // ----------------------------------------------------------------
  // Message handlers
  // ----------------------------------------------------------------

  private async handleHostInit(
    conn: Connection,
    hostKey: string,
    config: RoomConfig,
  ): Promise<void> {
    if (this.state) {
      if (this.state.hostKey !== hostKey) {
        throw new GameError(
          "ROOM_TAKEN",
          "That case number is already in use by another Chief Inspector.",
        );
      }
      // Idempotent resume.
      this.conns.set(conn.id, { role: "host" });
      await this.onHostPresent();
      this.sendState(conn);
      return;
    }

    if (!TIERS.includes(config.tier)) {
      throw new GameError("BAD_MESSAGE", `Unknown tier "${config.tier}"`);
    }
    if (!CASE_COUNT_CHOICES.some((n) => n === config.caseCount)) {
      throw new GameError(
        "BAD_MESSAGE",
        `caseCount must be one of ${CASE_COUNT_CHOICES.join(", ")}`,
      );
    }
    validateBank();

    const bank = casesForTier(config.tier);
    const shuffled = [...bank];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    this.state = {
      hostKey,
      config,
      caseIds: shuffled.slice(0, config.caseCount).map((c) => c.id),
      phase: "lobby",
      caseIndex: 0,
      players: {},
      histogram: [0, 0, 0, 0],
      phaseEndsAt: null,
      phaseDurationMs: null,
      pausedRemainingMs: null,
    };
    this.conns.set(conn.id, { role: "host" });
    await this.mutated();
  }

  private async handleHostAdvance(conn: Connection): Promise<void> {
    this.requireHost(conn);
    const state = this.requireState();

    switch (state.phase) {
      case "lobby": {
        const activePlayers = Object.values(state.players).filter(
          (p) => p.connected,
        );
        if (activePlayers.length === 0) {
          throw new GameError(
            "BAD_PHASE",
            "No detectives on the force yet — wait for at least one to join.",
          );
        }
        await this.startCase(0);
        break;
      }
      case "reveal":
        state.phase = "docket";
        await this.mutated();
        break;
      case "docket":
        if (state.caseIndex + 1 < state.caseIds.length) {
          await this.startCase(state.caseIndex + 1);
        } else {
          await this.finalize();
        }
        break;
      default:
        // Includes briefing/evidence/investigation/suspense: the evidence
        // lock cannot be skipped, by anyone (CLAUDE.md core mechanic).
        throw new GameError(
          "BAD_PHASE",
          "Nothing to advance right now — the round advances itself.",
        );
    }
  }

  private async handleHostKick(
    conn: Connection,
    playerId: string,
  ): Promise<void> {
    this.requireHost(conn);
    const state = this.requireState();
    if (state.phase !== "lobby") {
      throw new GameError("BAD_PHASE", "Detectives can only be dismissed in the lobby.");
    }
    if (!state.players[playerId]) {
      throw new GameError("NOT_A_PLAYER", "No such detective.");
    }
    delete state.players[playerId];
    for (const c of this.getConnections()) {
      const meta = this.conns.get(c.id);
      if (meta?.role === "player" && meta.playerId === playerId) {
        this.send(c, { type: "kicked" });
        c.close();
      }
    }
    await this.mutated();
  }

  private async handleJoin(conn: Connection, name: string): Promise<void> {
    const state = this.state;
    if (!state) {
      throw new GameError(
        "ROOM_NOT_FOUND",
        "No such case file. Check the case number.",
      );
    }
    const meta = this.conns.get(conn.id);
    if (!meta || meta.role !== "player") {
      throw new GameError("NOT_A_PLAYER", "Connect with a detective badge to join.");
    }

    const existing = state.players[meta.playerId];
    if (existing) {
      // Rejoin (any phase) or lobby rename.
      existing.connected = true;
      if (state.phase === "lobby") {
        const cleaned = sanitizeName(name);
        existing.name =
          cleaned.toLowerCase() === existing.name.toLowerCase()
            ? existing.name
            : dedupeName(
                cleaned,
                Object.values(state.players)
                  .filter((p) => p.id !== existing.id)
                  .map((p) => p.name),
              );
      }
      this.send(conn, {
        type: "joined",
        playerId: existing.id,
        name: existing.name,
      });
      await this.mutated();
      // After the broadcast — see the ordering note in onConnect.
      this.sendResume(conn, existing);
      return;
    }

    if (Object.keys(state.players).length >= MAX_PLAYERS) {
      throw new GameError("ROOM_FULL", "The force is at full strength (60).");
    }
    const cleaned = sanitizeName(name);
    const finalName = dedupeName(
      cleaned,
      Object.values(state.players).map((p) => p.name),
    );
    state.players[meta.playerId] = {
      id: meta.playerId,
      name: finalName,
      connected: true,
      spectator: state.phase !== "lobby",
      score: 0,
      streak: 0,
      ready: false,
      resolved: false,
      solved: false,
      attemptsUsed: 0,
      wrongOptions: [],
      lastDelta: 0,
      solveMsThisRound: null,
      scoreHistory: [],
      bestSolveMs: null,
      bestSolveCase: null,
      longestStreak: 0,
    };
    this.send(conn, { type: "joined", playerId: meta.playerId, name: finalName });
    await this.mutated();
  }

  private async handleReady(conn: Connection): Promise<void> {
    const state = this.requireState();
    const player = this.requirePlayer(conn);
    if (state.phase !== "evidence" || this.isPaused()) {
      throw new GameError("BAD_PHASE", "There is nothing to be ready for right now.");
    }
    if (player.spectator || player.ready) return;
    player.ready = true;
    this.checkEvidenceEarlyEnd();
    await this.mutated();
  }

  private async handleSubmit(
    conn: Connection,
    answer: SubmittedAnswer,
  ): Promise<void> {
    const state = this.requireState();
    const player = this.requirePlayer(conn);
    if (state.phase !== "investigation" || this.isPaused()) {
      throw new GameError("BAD_PHASE", "Submissions are locked right now.");
    }
    if (player.spectator) {
      throw new GameError("BAD_PHASE", "You joined mid-case — you play from the next one.");
    }
    if (player.resolved || player.attemptsUsed >= MAX_ATTEMPTS) {
      throw new GameError("BAD_PHASE", "This case is already closed for you.");
    }

    const caseFile = this.currentCase();
    let correct: boolean;

    if (answer.kind === "mcq") {
      if (caseFile.format !== "mcq") {
        throw new GameError("BAD_MESSAGE", "This case expects a typed fix.");
      }
      if (
        !Number.isInteger(answer.option) ||
        answer.option < 0 ||
        answer.option > 3
      ) {
        throw new GameError("BAD_MESSAGE", "Unknown exhibit.");
      }
      state.histogram[answer.option] += 1;
      correct = answer.option === caseFile.correctOption;
      if (!correct && !player.wrongOptions.includes(answer.option)) {
        player.wrongOptions.push(answer.option);
      }
    } else {
      if (caseFile.format !== "text") {
        throw new GameError("BAD_MESSAGE", "This case expects an exhibit choice.");
      }
      if (normalizeFix(answer.text).length === 0) {
        throw new GameError("BAD_MESSAGE", "An empty fix isn't a theory.");
      }
      correct = matchesAccepted(caseFile.acceptedAnswers!, answer.text);
    }

    player.attemptsUsed += 1;
    const attempt = player.attemptsUsed as 1 | 2 | 3;
    let delta = 0;
    let hint: string | null = null;

    if (correct) {
      const now = Date.now();
      const windowMs = state.phaseDurationMs!;
      const remainingMs = Math.max(
        0,
        Math.min(windowMs, (state.phaseEndsAt ?? now) - now),
      );
      player.solved = true;
      player.resolved = true;
      player.streak += 1;
      player.longestStreak = Math.max(player.longestStreak, player.streak);
      delta = scoreForSolve(
        attempt,
        remainingMs,
        windowMs,
        player.streak,
        this.isDoublePoints(),
      );
      player.score += delta;
      player.lastDelta = delta;
      player.solveMsThisRound = windowMs - remainingMs;
      if (
        player.bestSolveMs === null ||
        player.solveMsThisRound < player.bestSolveMs
      ) {
        player.bestSolveMs = player.solveMsThisRound;
        player.bestSolveCase = caseFile.title;
      }
    } else if (player.attemptsUsed >= MAX_ATTEMPTS) {
      player.resolved = true;
      player.streak = 0;
      player.lastDelta = 0;
    } else {
      hint = caseFile.hints[player.attemptsUsed - 1];
    }

    this.send(conn, {
      type: "feedback",
      attempt,
      correct,
      solved: player.solved,
      delta,
      hint,
    });
    this.checkInvestigationEarlyEnd();
    await this.mutated();
  }

  // ----------------------------------------------------------------
  // Phase machine
  // ----------------------------------------------------------------

  private async startCase(index: number): Promise<void> {
    const state = this.requireState();
    state.caseIndex = index;
    state.histogram = [0, 0, 0, 0];
    for (const p of Object.values(state.players)) {
      p.ready = false;
      p.resolved = false;
      p.solved = false;
      p.attemptsUsed = 0;
      p.wrongOptions = [];
      p.lastDelta = 0;
      p.solveMsThisRound = null;
      p.spectator = false; // late joiners are promoted at the next briefing
    }
    this.enterTimedPhase("briefing", BRIEFING_MS);
    await this.mutated();
  }

  private enterTimedPhase(phase: Phase, durationMs: number): void {
    const state = this.requireState();
    state.phase = phase;
    state.phaseDurationMs = durationMs;
    state.phaseEndsAt = Date.now() + durationMs;
    state.pausedRemainingMs = null;
    this.armTimer(durationMs);
  }

  private armTimer(delayMs: number): void {
    this.clearTimer();
    this.timer = setTimeout(() => {
      void this.onPhaseTimeout();
    }, delayMs);
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private async onPhaseTimeout(): Promise<void> {
    const state = this.state;
    if (!state || this.isPaused()) return;
    switch (state.phase) {
      case "briefing":
        this.enterTimedPhase(
          "evidence",
          TIER_TIMING[state.config.tier].evidenceMs,
        );
        break;
      case "evidence":
        this.enterTimedPhase(
          "investigation",
          TIER_TIMING[state.config.tier].investigationMs,
        );
        break;
      case "investigation":
        this.endInvestigation();
        break;
      case "suspense":
        state.phase = "reveal";
        state.phaseEndsAt = null;
        state.phaseDurationMs = null;
        this.clearTimer();
        break;
      default:
        return; // host-paced phases have no timeout
    }
    await this.mutated();
  }

  private checkEvidenceEarlyEnd(): void {
    const state = this.requireState();
    if (state.phase !== "evidence" || this.isPaused()) return;
    const active = this.activePlayers();
    if (active.length > 0 && active.every((p) => p.ready)) {
      this.enterTimedPhase(
        "investigation",
        TIER_TIMING[state.config.tier].investigationMs,
      );
    }
  }

  private checkInvestigationEarlyEnd(): void {
    const state = this.requireState();
    if (state.phase !== "investigation" || this.isPaused()) return;
    const active = this.activePlayers();
    if (active.length > 0 && active.every((p) => p.resolved)) {
      this.endInvestigation();
    }
  }

  private endInvestigation(): void {
    const state = this.requireState();
    for (const p of Object.values(state.players)) {
      if (p.spectator) continue;
      if (!p.resolved) {
        // Timed out without solving.
        p.resolved = true;
        p.streak = 0;
        p.lastDelta = 0;
      }
      p.scoreHistory.push(p.score);
    }
    this.enterTimedPhase("suspense", SUSPENSE_MS);
  }

  private async finalize(): Promise<void> {
    const state = this.requireState();
    state.phase = "final";
    state.phaseEndsAt = null;
    state.phaseDurationMs = null;
    this.clearTimer();
    await this.mutated();
  }

  // ----------------------------------------------------------------
  // Pause (host absent)
  // ----------------------------------------------------------------

  private isPaused(): boolean {
    return this.state?.pausedRemainingMs !== null &&
      this.state?.pausedRemainingMs !== undefined;
  }

  private hostConnected(): boolean {
    return [...this.conns.values()].some((m) => m.role === "host");
  }

  private async onHostAbsent(): Promise<void> {
    const state = this.state;
    if (!state) return;
    if (state.phaseEndsAt !== null) {
      state.pausedRemainingMs = Math.max(0, state.phaseEndsAt - Date.now());
      state.phaseEndsAt = null;
      this.clearTimer();
    } else if (state.phase !== "lobby" && state.phase !== "final") {
      state.pausedRemainingMs = 0; // paused in a host-paced phase
    }
    await this.mutated();
  }

  private async onHostPresent(): Promise<void> {
    const state = this.state;
    if (!state || !this.isPaused()) return;
    const remaining = state.pausedRemainingMs!;
    state.pausedRemainingMs = null;
    if (
      state.phase === "briefing" ||
      state.phase === "evidence" ||
      state.phase === "investigation" ||
      state.phase === "suspense"
    ) {
      state.phaseEndsAt = Date.now() + remaining;
      state.phaseDurationMs = state.phaseDurationMs ?? remaining;
      this.armTimer(remaining);
    }
    await this.mutated();
  }

  // ----------------------------------------------------------------
  // Projection + plumbing
  // ----------------------------------------------------------------

  private currentCase(): CaseFile {
    const state = this.requireState();
    return getCase(state.caseIds[state.caseIndex]);
  }

  private isDoublePoints(): boolean {
    const state = this.requireState();
    return (
      state.caseIds.length > 1 &&
      state.caseIndex === state.caseIds.length - 1
    );
  }

  private activePlayers(): PlayerInternal[] {
    const state = this.requireState();
    return Object.values(state.players).filter(
      (p) => p.connected && !p.spectator,
    );
  }

  private toPublicPlayer(p: PlayerInternal): PlayerPublic {
    return {
      id: p.id,
      name: p.name,
      connected: p.connected,
      spectator: p.spectator,
      score: p.score,
      streak: p.streak,
      ready: p.ready,
      resolved: p.resolved,
      solved: p.solved,
      attemptsUsed: p.attemptsUsed,
      lastDelta: p.lastDelta,
    };
  }

  /** Restore a reconnecting player's round mid-INVESTIGATION. */
  private sendResume(conn: Connection, player: PlayerInternal): void {
    const state = this.state;
    if (!state || state.phase !== "investigation") return;
    if (player.spectator || player.resolved || player.attemptsUsed === 0) {
      return;
    }
    const caseFile = this.currentCase();
    const hint =
      player.attemptsUsed >= 1 && player.attemptsUsed <= 2
        ? caseFile.hints[player.attemptsUsed - 1]
        : null;
    this.send(conn, {
      type: "resume",
      attemptsUsed: player.attemptsUsed,
      wrongOptions: player.wrongOptions,
      hint,
    });
  }

  private toPublicState(): RoomStatePublic {
    const state = this.requireState();
    const inRound =
      state.phase !== "lobby" && state.phase !== "final";
    const caseFile = inRound ? this.currentCase() : null;
    const showReveal =
      state.phase === "reveal" ||
      state.phase === "docket" ||
      state.phase === "final";

    const currentCase: CasePublic | null = caseFile
      ? {
          id: caseFile.id,
          title: caseFile.title,
          format: caseFile.format,
          code: caseFile.code,
          brokenOutput: caseFile.brokenOutput,
          crashed: caseFile.crashed,
          options: caseFile.options,
        }
      : null;

    const reveal: RevealPublic | null =
      caseFile && showReveal
        ? {
            culpritLine: caseFile.culpritLine,
            fixedLines: caseFile.fixedLines,
            explanation: caseFile.explanation,
            correctOption: caseFile.correctOption,
            histogram: caseFile.format === "mcq" ? state.histogram : null,
            solvedCount: Object.values(state.players).filter((p) => p.solved)
              .length,
            attemptedCount: Object.values(state.players).filter(
              (p) => p.attemptsUsed > 0,
            ).length,
            fixedOutput: caseFile.fixedOutput,
          }
        : null;

    const players = Object.values(state.players).map((p) =>
      this.toPublicPlayer(p),
    );

    let podium: PlayerPublic[] | null = null;
    let awards: Awards | null = null;
    if (state.phase === "final") {
      const ranked = [...Object.values(state.players)].sort(
        (a, b) => b.score - a.score,
      );
      podium = ranked.slice(0, 3).map((p) => this.toPublicPlayer(p));
      awards = this.computeAwards(ranked);
    }

    return {
      phase: state.phase,
      config: state.config,
      caseIndex: state.caseIndex,
      caseTotal: state.caseIds.length,
      doublePoints: inRound && this.isDoublePoints(),
      currentCase,
      reveal,
      players,
      phaseEndsAt: state.phaseEndsAt,
      phaseDurationMs: state.phaseDurationMs,
      paused: this.isPaused(),
      podium,
      awards,
    };
  }

  private computeAwards(ranked: PlayerInternal[]): Awards {
    let fastest: PlayerInternal | null = null;
    for (const p of ranked) {
      if (p.bestSolveMs === null) continue;
      if (fastest === null || p.bestSolveMs < fastest.bestSolveMs!) {
        fastest = p;
      }
    }
    let streaker: PlayerInternal | null = null;
    for (const p of ranked) {
      if (p.longestStreak < 2) continue;
      if (streaker === null || p.longestStreak > streaker.longestStreak) {
        streaker = p;
      }
    }
    let rebounder: PlayerInternal | null = null;
    let bestGain = 0;
    for (const p of ranked) {
      const h = p.scoreHistory;
      if (h.length < 2) continue;
      const gain = h[h.length - 1] - (h[h.length - 3] ?? 0);
      if (gain > bestGain) {
        bestGain = gain;
        rebounder = p;
      }
    }
    return {
      fastestSolve: fastest
        ? {
            playerName: fastest.name,
            detail: `${(fastest.bestSolveMs! / 1000).toFixed(1)}s on ${fastest.bestSolveCase}`,
          }
        : null,
      ironStreak: streaker
        ? {
            playerName: streaker.name,
            detail: `${streaker.longestStreak} cases cracked in a row`,
          }
        : null,
      sharpestRebound: rebounder
        ? {
            playerName: rebounder.name,
            detail: `${bestGain} points gained in the closing cases`,
          }
        : null,
    };
  }

  private requireState(): RoomState {
    if (!this.state) {
      throw new GameError(
        "ROOM_NOT_FOUND",
        "No such case file. Check the case number.",
      );
    }
    return this.state;
  }

  private requireHost(conn: Connection): void {
    if (this.conns.get(conn.id)?.role !== "host") {
      throw new GameError(
        "NOT_THE_HOST",
        "Only the Chief Inspector may do that.",
      );
    }
  }

  private requirePlayer(conn: Connection): PlayerInternal {
    const state = this.requireState();
    const meta = this.conns.get(conn.id);
    if (!meta || meta.role !== "player") {
      throw new GameError("NOT_A_PLAYER", "You are not on this case.");
    }
    const player = state.players[meta.playerId];
    if (!player) {
      throw new GameError("NOT_A_PLAYER", "Join the force first, Detective.");
    }
    return player;
  }

  private send(conn: Connection, message: ServerMessage): void {
    conn.send(JSON.stringify(message));
  }

  private sendState(conn: Connection): void {
    if (!this.state) return;
    this.send(conn, { type: "state", state: this.toPublicState() });
  }

  /** Persist + broadcast after every mutation. */
  private async mutated(): Promise<void> {
    if (!this.state) return;
    await this.ctx.storage.put("state", this.state);
    this.broadcast(
      JSON.stringify({ type: "state", state: this.toPublicState() }),
    );
  }
}

interface Env {
  CodeDetective: DurableObjectNamespace;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return (
      (await routePartykitRequest(request, env)) ??
      new Response("No such party here.", { status: 404 })
    );
  },
};
