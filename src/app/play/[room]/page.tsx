"use client";

import Link from "next/link";
import { use, useEffect, useMemo, useRef, useState } from "react";
import usePartySocket from "partysocket/react";

import HintSlip from "@/components/play/HintSlip";
import McqInput from "@/components/play/McqInput";
import StatusCard from "@/components/play/StatusCard";
import TextFixInput from "@/components/play/TextFixInput";
import CodeEvidence from "@/components/ui/CodeEvidence";
import Histogram from "@/components/ui/Histogram";
import Masthead from "@/components/ui/Masthead";
import OutputSlip from "@/components/ui/OutputSlip";
import PlateButton from "@/components/ui/PlateButton";
import Stamp from "@/components/ui/Stamp";
import TimerFuse from "@/components/ui/TimerFuse";
import WaxSeal from "@/components/ui/WaxSeal";
import { NAME_MAX_LENGTH, suggestAlias } from "@/game/names";
import type {
  ClientMessage,
  PlayerPublic,
  RoomStatePublic,
  ServerMessage,
} from "@/game/protocol";
import { getOrCreateBadge, recallName, rememberName } from "@/lib/identity";
import { PARTY_NAME, PARTYKIT_HOST } from "@/lib/party";

export default function PlayPage({
  params,
}: {
  params: Promise<{ room: string }>;
}) {
  const { room } = use(params);
  const [badge, setBadge] = useState<string | null>(null);

  useEffect(() => {
    setBadge(getOrCreateBadge(room));
  }, [room]);

  if (!badge) return null;
  return <PlayerClient room={room} badge={badge} />;
}

function PlayerClient({ room, badge }: { room: string; badge: string }) {
  const [state, setState] = useState<RoomStatePublic | null>(null);
  const [roomMissing, setRoomMissing] = useState(false);
  const [kicked, setKicked] = useState(false);
  const [wireDown, setWireDown] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [wrongOptions, setWrongOptions] = useState<number[]>([]);
  const [pendingOption, setPendingOption] = useState<number | null>(null);
  const [textPending, setTextPending] = useState(false);
  const caseIdRef = useRef<string | null>(null);
  const pendingOptionRef = useRef<number | null>(null);

  const query = useMemo(() => ({ badge }), [badge]);

  const socket = usePartySocket({
    host: PARTYKIT_HOST,
    party: PARTY_NAME,
    room,
    query,
    onOpen() {
      setWireDown(false);
    },
    onClose() {
      setWireDown(true);
    },
    onMessage(event) {
      const message = JSON.parse(event.data as string) as ServerMessage;
      switch (message.type) {
        case "state": {
          const caseId = message.state.currentCase?.id ?? null;
          if (caseId !== caseIdRef.current) {
            caseIdRef.current = caseId;
            setHint(null);
            setWrongOptions([]);
            setPendingOption(null);
            pendingOptionRef.current = null;
            setTextPending(false);
          }
          setRoomMissing(false);
          setState(message.state);
          break;
        }
        case "joined":
          rememberName(message.name);
          setJoinError(null);
          break;
        case "feedback": {
          setHint(message.hint);
          if (!message.correct && pendingOptionRef.current !== null) {
            const wrong = pendingOptionRef.current;
            setWrongOptions((prev) =>
              prev.includes(wrong) ? prev : [...prev, wrong],
            );
          }
          pendingOptionRef.current = null;
          setPendingOption(null);
          setTextPending(false);
          break;
        }
        case "resume":
          setHint(message.hint);
          setWrongOptions(message.wrongOptions);
          break;
        case "kicked":
          setKicked(true);
          break;
        case "error":
          if (message.code === "ROOM_NOT_FOUND") {
            setRoomMissing(true);
          } else if (message.code === "NAME_REJECTED") {
            setJoinError(message.message);
          } else if (message.code === "BAD_PHASE") {
            // A submit raced a phase change; the next state broadcast rules.
            pendingOptionRef.current = null;
            setPendingOption(null);
            setTextPending(false);
          }
          break;
        default:
          break;
      }
    },
  });

  function send(message: ClientMessage) {
    socket.send(JSON.stringify(message));
  }

  const me: PlayerPublic | undefined = state?.players.find(
    (p) => p.id === badge,
  );

  if (kicked) {
    return (
      <Shell room={room}>
        <StatusCard
          kind="waiting"
          stamp="Dismissed"
          headline="The Chief Inspector has dismissed you from the force"
          detail="Rejoin with a better alias — the door is not locked."
        />
        <BackHome />
      </Shell>
    );
  }

  if (roomMissing) {
    return (
      <Shell room={room}>
        <div className="plate mx-auto mt-6 w-full max-w-md px-4 py-8 text-center">
          <p className="font-display text-4xl font-black uppercase">Missing.</p>
          <p className="mt-3 font-body italic text-ink-soft">
            No case file answers to № {room}. Check the number with your Chief
            Inspector.
          </p>
        </div>
        <BackHome />
      </Shell>
    );
  }

  if (!state || !me) {
    return (
      <Shell room={room}>
        {wireDown && <WireBanner />}
        <JoinForm
          error={joinError}
          onJoin={(name) => {
            setJoinError(null);
            send({ type: "join", name });
          }}
          disabled={!state && wireDown}
        />
      </Shell>
    );
  }

  const caseFile = state.currentCase;
  const reveal = state.reveal;
  const active = state.players.filter((p) => !p.spectator);
  const ranked = [...active].sort((a, b) => b.score - a.score);
  const myRank = ranked.findIndex((p) => p.id === me.id) + 1;
  const above = myRank > 1 ? ranked[myRank - 2] : null;
  const inRound =
    state.phase === "briefing" ||
    state.phase === "evidence" ||
    state.phase === "investigation" ||
    state.phase === "suspense";

  return (
    <Shell room={room} name={me.name} score={me.score}>
      {wireDown && <WireBanner />}

      {state.paused ? (
        <StatusCard
          kind="waiting"
          headline="The Chief Inspector has stepped out"
          detail="Hold your positions. The clock is frozen; so is everything else."
        />
      ) : state.phase === "lobby" ? (
        <StatusCard
          kind="waiting"
          stamp="Enlisted"
          headline={`You're on the force, ${me.name}`}
          detail="Your name is on the register. The first case opens when the Chief Inspector gives the word."
        />
      ) : me.spectator && inRound ? (
        <StatusCard
          kind="waiting"
          headline="You arrived mid-case"
          detail="This one is already under investigation — you join the docket at the next case."
        />
      ) : state.phase === "briefing" && caseFile ? (
        <div className="anim-slam flex min-h-[55vh] flex-col items-center justify-center text-center">
          <p className="smallcaps text-sm text-sepia">
            Case {state.caseIndex + 1} of {state.caseTotal}
          </p>
          <div className="my-3 w-16 border-t-2 border-ink" />
          <h2 className="font-display text-3xl font-black uppercase leading-tight lg:text-6xl">
            {caseFile.title}.
          </h2>
          <div className="my-3 w-16 border-t-2 border-ink" />
          <p className="font-body italic text-ink-soft lg:text-xl">
            The evidence goes up in a moment. Read before you theorize.
          </p>
          {state.doublePoints && (
            <div className="mt-5">
              <Stamp animate className="text-lg lg:text-2xl">
                Final Edition — Double Points
              </Stamp>
            </div>
          )}
        </div>
      ) : state.phase === "evidence" && caseFile ? (
        <div className="mt-2">
          <div className="sticky top-0 z-10 -mx-4 bg-paper px-4 pb-2 pt-2 lg:-mx-8 lg:px-8">
            <div className="mb-2 flex items-center gap-3">
              <Stamp className="text-lg">Confidential</Stamp>
              <p className="smallcaps text-xs text-sepia">
                submissions locked — study first
              </p>
            </div>
            <TimerFuse
              endsAt={state.phaseEndsAt}
              durationMs={state.phaseDurationMs}
              paused={state.paused}
            />
          </div>
          <div className="mt-3 grid gap-4 lg:grid-cols-5 lg:gap-6">
            <div className="lg:col-span-3">
              <CodeEvidence code={caseFile.code} />
            </div>
            <div className="space-y-4 lg:col-span-2">
              <OutputSlip
                output={caseFile.brokenOutput}
                crashed={caseFile.crashed}
              />
              {me.ready ? (
                <p className="smallcaps text-center text-sm text-sepia">
                  Diligence noted — the investigation opens when the whole
                  force is ready, or when the clock says so.
                </p>
              ) : (
                <PlateButton
                  primary
                  className="w-full"
                  onClick={() => send({ type: "ready" })}
                >
                  I&apos;ve Studied the Evidence
                </PlateButton>
              )}
            </div>
          </div>
        </div>
      ) : state.phase === "investigation" && caseFile ? (
        <div className="mt-2">
          <div className="sticky top-0 z-10 -mx-4 bg-paper px-4 pb-2 pt-2 lg:-mx-8 lg:px-8">
            <TimerFuse
              endsAt={state.phaseEndsAt}
              durationMs={state.phaseDurationMs}
              paused={state.paused}
            />
          </div>
          <div className="mt-3 grid gap-4 lg:grid-cols-5 lg:gap-6">
            <div className="space-y-4 lg:col-span-3">
              <CodeEvidence code={caseFile.code} />
              <OutputSlip
                output={caseFile.brokenOutput}
                crashed={caseFile.crashed}
              />
            </div>
            <div className="space-y-4 lg:col-span-2">
              {me.resolved ? (
                me.solved ? (
                  <StatusCard
                    kind="locked"
                    stamp="Solved"
                    headline={`Fix accepted — ${me.lastDelta} point${me.lastDelta === 1 ? "" : "s"}`}
                    detail="The reveal arrives once every detective is done."
                  />
                ) : (
                  <StatusCard
                    kind="locked"
                    headline="Your three theories are spent"
                    detail="The reveal will name the culprit — study it, the next case pays the same wages."
                  />
                )
              ) : (
                <>
                  <p className="smallcaps text-center text-xs text-sepia">
                    theories remaining:{" "}
                    <span
                      className="font-bold text-ink"
                      aria-label={`${3 - me.attemptsUsed} of 3`}
                    >
                      {"●"
                        .repeat(Math.max(0, 3 - me.attemptsUsed))
                        .padEnd(3, "○")
                        .split("")
                        .join(" ")}
                    </span>
                  </p>
                  {hint && <HintSlip hint={hint} />}
                  {caseFile.format === "mcq" && caseFile.options ? (
                    <McqInput
                      options={caseFile.options}
                      wrongOptions={wrongOptions}
                      pendingOption={pendingOption}
                      onPick={(option) => {
                        pendingOptionRef.current = option;
                        setPendingOption(option);
                        send({
                          type: "submit",
                          answer: { kind: "mcq", option },
                        });
                      }}
                    />
                  ) : (
                    <TextFixInput
                      pending={textPending}
                      attemptsUsed={me.attemptsUsed}
                      onSubmit={(text) => {
                        setTextPending(true);
                        send({ type: "submit", answer: { kind: "text", text } });
                      }}
                    />
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      ) : state.phase === "suspense" ? (
        <StatusCard kind="locked" headline="The Inspector clears his throat" />
      ) : state.phase === "reveal" && caseFile && reveal ? (
        <div className="mt-4 space-y-4">
          {me.spectator ? (
            <p className="smallcaps text-center text-xs text-sepia">
              the reveal — you play from the next case
            </p>
          ) : me.solved ? (
            <div className="plate anim-pop-in mx-auto w-full max-w-md px-4 py-5 text-center">
              <div className="flex justify-center">
                <WaxSeal size={56} />
              </div>
              <p className="mt-3 font-display text-2xl font-black">
                +{me.lastDelta} point{me.lastDelta === 1 ? "" : "s"}
              </p>
              {me.streak > 1 && (
                <p className="smallcaps mt-1 text-sm text-brass">
                  {me.streak} cases in a row
                </p>
              )}
            </div>
          ) : (
            <div className="plate anim-pop-in mx-auto w-full max-w-md px-4 py-4 text-center">
              <p className="font-typewriter text-lg">
                THE CULPRIT ELUDED YOU STOP
              </p>
              <p className="mt-1 text-sm italic text-ink-soft">
                Study the reveal — the next case pays the same wages.
              </p>
            </div>
          )}

          {reveal.histogram &&
            reveal.correctOption !== null &&
            caseFile.options && (
              <div className="rule-double mx-auto w-full max-w-3xl bg-paper-aged/60 px-3 py-3">
                <p className="smallcaps mb-2 text-center text-xs font-bold">
                  How the force voted.
                </p>
                <Histogram
                  options={caseFile.options}
                  counts={reveal.histogram}
                  correctOption={reveal.correctOption}
                />
              </div>
            )}

          <div className="grid gap-4 lg:grid-cols-5 lg:gap-6">
            <div className="lg:col-span-3">
              <CodeEvidence
                code={caseFile.code}
                culpritLine={reveal.culpritLine}
              />
            </div>
            <div className="space-y-4 lg:col-span-2">
              <div className="rule-double bg-paper-aged px-3 py-2.5">
                <p className="smallcaps text-[11px] text-sepia">the repair</p>
                <pre className="mt-1 overflow-x-auto font-code text-sm font-bold text-oxblood">
                  {reveal.fixedLines.join("\n")}
                </pre>
              </div>
              <OutputSlip
                output={reveal.fixedOutput}
                heading="After the repair"
              />
            </div>
          </div>
          <div className="rule-oxford mx-auto w-full max-w-3xl">
            <p className="justified py-3 font-body text-[15px] leading-relaxed">
              {reveal.explanation}
            </p>
            <div className="rule-oxford rotate-180" />
          </div>
          <p className="smallcaps text-center text-xs text-sepia">
            ☞ the Chief Inspector turns the page
          </p>
        </div>
      ) : state.phase === "docket" ? (
        <div className="mx-auto mt-4 w-full max-w-xl space-y-4">
          <div className="rule-oxford">
            <h2 className="smallcaps py-2 text-center font-body text-lg font-bold">
              The Docket — after case {state.caseIndex + 1} of {state.caseTotal}
              .
            </h2>
            <div className="rule-oxford rotate-180" />
          </div>
          <ol className="space-y-2">
            {ranked.slice(0, 5).map((p, i) => (
              <li
                key={p.id}
                className={`flex items-baseline gap-3 border-b hairline pb-1.5 ${
                  p.id === me.id ? "font-bold" : ""
                }`}
              >
                <span className="w-7 shrink-0 text-right font-display text-2xl font-black text-sepia">
                  {i + 1}
                </span>
                <span className="evidence-tag min-w-0 truncate font-typewriter text-sm">
                  {p.name}
                </span>
                <span className="ml-auto font-display text-lg font-bold tabular-nums">
                  {p.score}
                </span>
              </li>
            ))}
          </ol>
          <div className="plate anim-pop-in px-4 py-4 text-center">
            <p className="smallcaps text-xs text-sepia">your standing</p>
            <p className="mt-1 font-display text-4xl font-black">
              {myRank}
              <span className="text-xl text-sepia">/{ranked.length}</span>
            </p>
            <p className="font-body">
              {me.score} point{me.score === 1 ? "" : "s"}
              {me.streak > 1 ? ` — ${me.streak} straight` : ""}
            </p>
            {above ? (
              above.score === me.score ? (
                <p className="mt-2 font-typewriter text-sm text-ink-soft">
                  You are level with {above.name}.
                </p>
              ) : (
                <p className="mt-2 font-typewriter text-sm text-ink-soft">
                  You trail {above.name} by {above.score - me.score}.
                </p>
              )
            ) : (
              <p className="mt-2 font-typewriter text-sm text-oxblood">
                The force trails YOU, Detective.
              </p>
            )}
          </div>
        </div>
      ) : state.phase === "final" ? (
        <div className="mx-auto mt-4 w-full max-w-xl space-y-4 text-center">
          <div className="flex justify-center">
            <Stamp animate className="text-xl">
              Case Closed
            </Stamp>
          </div>
          <div className="plate anim-pop-in px-4 py-5">
            <p className="smallcaps text-xs text-sepia">your final placement</p>
            <p className="mt-1 font-display text-5xl font-black">
              {ordinal(myRank)}
            </p>
            <p className="font-body">
              of {ranked.length} detectives — {me.score} point
              {me.score === 1 ? "" : "s"}
            </p>
          </div>
          {state.podium && state.podium.length > 0 && (
            <div className="rule-double bg-paper-aged/60 px-3 py-3">
              <p className="smallcaps mb-2 text-xs font-bold">The podium.</p>
              <ol className="space-y-1.5">
                {state.podium.map((p, i) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-center gap-2"
                  >
                    {i === 0 && <WaxSeal size={26} />}
                    <span className="font-display text-lg font-bold">
                      {i + 1}.
                    </span>
                    <span className="font-typewriter">{p.name}</span>
                    <span className="font-display font-bold tabular-nums">
                      {p.score}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}
          {state.awards && (
            <div className="space-y-1.5 text-left">
              {state.awards.fastestSolve && (
                <AwardLine
                  title="Fastest Solve"
                  name={state.awards.fastestSolve.playerName}
                  detail={state.awards.fastestSolve.detail}
                />
              )}
              {state.awards.ironStreak && (
                <AwardLine
                  title="Iron Streak"
                  name={state.awards.ironStreak.playerName}
                  detail={state.awards.ironStreak.detail}
                />
              )}
              {state.awards.sharpestRebound && (
                <AwardLine
                  title="Sharpest Rebound"
                  name={state.awards.sharpestRebound.playerName}
                  detail={state.awards.sharpestRebound.detail}
                />
              )}
            </div>
          )}
          <BackHome />
        </div>
      ) : null}
    </Shell>
  );
}

function ordinal(n: number): string {
  const suffix =
    n % 100 >= 11 && n % 100 <= 13
      ? "th"
      : n % 10 === 1
        ? "st"
        : n % 10 === 2
          ? "nd"
          : n % 10 === 3
            ? "rd"
            : "th";
  return `${n}${suffix}`;
}

function AwardLine({
  title,
  name,
  detail,
}: {
  title: string;
  name: string;
  detail: string;
}) {
  return (
    <p className="border-b hairline pb-1 text-sm">
      <span className="smallcaps font-bold text-brass">{title}</span>{" "}
      <span className="font-typewriter">{name}</span>
      <span className="italic text-ink-soft"> — {detail}</span>
    </p>
  );
}

function Shell({
  room,
  name,
  score,
  children,
}: {
  room: string;
  name?: string;
  score?: number;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto min-h-dvh w-full max-w-md px-4 py-4 lg:max-w-6xl lg:px-8">
      <header>
        <Masthead />
        <div className="rule-oxford mt-2">
          <p className="smallcaps flex items-baseline justify-center gap-x-3 py-1 text-[11px] text-sepia">
            <span>Case № {room}</span>
            {name && (
              <>
                <span aria-hidden>—</span>
                <span className="font-bold text-ink">{name}</span>
              </>
            )}
            {score !== undefined && (
              <>
                <span aria-hidden>—</span>
                <span className="tabular-nums">{score} pts</span>
              </>
            )}
          </p>
          <div className="rule-oxford rotate-180" />
        </div>
      </header>
      <main className="pb-8">{children}</main>
    </div>
  );
}

function WireBanner() {
  return (
    <p className="mx-auto mt-3 w-full max-w-md border-2 border-stamp-red px-3 py-2 text-center font-typewriter text-lg text-stamp-red">
      RE-ESTABLISHING THE WIRE STOP YOUR SEAT IS SAFE STOP
    </p>
  );
}

function BackHome() {
  return (
    <p className="mt-6 text-center">
      <Link
        href="/"
        className="manicule cursor-target font-body italic text-oxblood underline-offset-2 hover:underline"
      >
        Back to the front page
      </Link>
    </p>
  );
}

function JoinForm({
  error,
  disabled,
  onJoin,
}: {
  error: string | null;
  disabled: boolean;
  onJoin: (name: string) => void;
}) {
  const [name, setName] = useState("");
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    setName(recallName());
  }, []);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (name.trim().length === 0) {
      setTouched(true);
      return;
    }
    onJoin(name.trim());
  }

  return (
    <form
      onSubmit={submit}
      className="plate anim-pop-in mx-auto mt-6 w-full max-w-md px-4 py-6"
    >
      <h2 className="smallcaps border-b border-ink pb-2 text-center font-body text-lg font-bold">
        Sign the Register.
      </h2>
      <label
        htmlFor="play-name"
        className="smallcaps mt-4 block font-typewriter text-xs text-sepia"
      >
        Form 27-B — Name of Detective
      </label>
      <input
        id="play-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={NAME_MAX_LENGTH}
        autoComplete="off"
        autoCapitalize="words"
        spellCheck={false}
        placeholder="e.g. Insp. Fogg"
        className="mt-1 w-full border-0 border-b-2 border-ink bg-transparent py-1 text-center font-typewriter text-xl placeholder:text-paper-edge focus:outline-none"
      />
      <button
        type="button"
        onClick={() => setName(suggestAlias())}
        className="manicule mt-2 font-body text-sm italic text-oxblood underline-offset-2 hover:underline"
      >
        Suggest an alias
      </button>
      {(error || (touched && name.trim().length === 0)) && (
        <p
          role="alert"
          className="mt-2 text-center font-typewriter text-sm text-stamp-red"
        >
          {error ?? "Every detective signs the register."}
        </p>
      )}
      <div className="mt-4">
        <PlateButton
          type="submit"
          primary
          disabled={disabled}
          className="w-full"
        >
          Report for Duty
        </PlateButton>
      </div>
    </form>
  );
}
