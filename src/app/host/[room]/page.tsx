"use client";

import { useRouter } from "next/navigation";
import { use, useEffect, useMemo, useRef, useState } from "react";
import usePartySocket from "partysocket/react";

import HostBoard from "@/components/host/HostBoard";
import HostBriefing from "@/components/host/HostBriefing";
import HostDocket from "@/components/host/HostDocket";
import HostFinal from "@/components/host/HostFinal";
import HostLobby from "@/components/host/HostLobby";
import HostReveal from "@/components/host/HostReveal";
import HostSuspense from "@/components/host/HostSuspense";
import Masthead from "@/components/ui/Masthead";
import PlateButton from "@/components/ui/PlateButton";
import type {
  ClientMessage,
  RoomConfig,
  RoomStatePublic,
  ServerMessage,
  Tier,
} from "@/game/protocol";
import { getOrCreateHostKey, randomRoomCode } from "@/lib/identity";
import { PARTY_NAME, PARTYKIT_HOST } from "@/lib/party";

export default function HostPage({
  params,
}: {
  params: Promise<{ room: string }>;
}) {
  const { room } = use(params);
  const [hostKey, setHostKey] = useState<string | null>(null);

  useEffect(() => {
    setHostKey(getOrCreateHostKey(room));
  }, [room]);

  if (!hostKey) return null;
  return <HostClient room={room} hostKey={hostKey} />;
}

function readConfigFromUrl(): RoomConfig {
  const search = new URLSearchParams(window.location.search);
  const tierParam = search.get("tier");
  const tier: Tier =
    tierParam === "detective" || tierParam === "inspector"
      ? tierParam
      : "rookie";
  const caseCount = search.get("count") === "3" ? 3 : 5;
  return { tier, caseCount };
}

function HostClient({ room, hostKey }: { room: string; hostKey: string }) {
  const router = useRouter();
  const [state, setState] = useState<RoomStatePublic | null>(null);
  const [wireDown, setWireDown] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [dateline, setDateline] = useState("");
  const configRef = useRef<RoomConfig | null>(null);

  useEffect(() => {
    setDateline(
      new Date()
        .toLocaleDateString("en-GB", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        })
        .toUpperCase(),
    );
  }, []);

  const query = useMemo(() => ({ role: "host", hostKey }), [hostKey]);

  const socket = usePartySocket({
    host: PARTYKIT_HOST,
    party: PARTY_NAME,
    room,
    query,
    onOpen() {
      setWireDown(false);
      if (!configRef.current) configRef.current = readConfigFromUrl();
      send({ type: "host:init", hostKey, config: configRef.current });
    },
    onClose() {
      setWireDown(true);
    },
    onMessage(event) {
      const message = JSON.parse(event.data as string) as ServerMessage;
      switch (message.type) {
        case "state":
          setState(message.state);
          break;
        case "error":
          if (message.code === "ROOM_TAKEN") {
            // Collision with a live room: roll a fresh case number.
            const config = configRef.current ?? readConfigFromUrl();
            router.replace(
              `/host/${randomRoomCode()}?tier=${config.tier}&count=${config.caseCount}`,
            );
          } else {
            setNotice(message.message);
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

  const advanceLabel =
    state?.phase === "reveal"
      ? "To the docket"
      : state?.phase === "docket"
        ? state.caseIndex + 1 < state.caseTotal
          ? "Next case"
          : "The final verdict"
        : null;

  return (
    <div className="min-h-dvh px-4 py-4 sm:px-8">
      <header className="flex items-center justify-between gap-4">
        <Masthead />
        <p className="smallcaps text-right text-xs text-sepia sm:text-sm">
          {dateline}
          {state && state.phase !== "lobby" && (
            <>
              {" — "}Case № {room} — {state.config.tier} tier —{" "}
              {Math.min(state.caseIndex + 1, state.caseTotal)} of{" "}
              {state.caseTotal}
            </>
          )}
        </p>
      </header>
      <div className="rule-oxford mt-2" />

      {wireDown && (
        <p className="mt-3 border-2 border-stamp-red px-3 py-2 text-center font-typewriter text-sm text-stamp-red">
          RE-ESTABLISHING THE WIRE STOP HOLD YOUR POSITIONS STOP
        </p>
      )}
      {notice && (
        <p
          className="mt-3 cursor-pointer border-2 border-ink-soft px-3 py-2 text-center font-typewriter text-sm text-ink-soft"
          onClick={() => setNotice(null)}
        >
          {notice.toUpperCase()} STOP
        </p>
      )}

      {!state ? (
        <p className="mt-24 text-center font-body text-xl italic text-ink-soft">
          Opening the case file…
        </p>
      ) : (
        <main className="pb-24">
          {state.phase === "lobby" && (
            <HostLobby
              room={room}
              state={state}
              onStart={() => send({ type: "host:advance" })}
              onKick={(playerId) => send({ type: "host:kick", playerId })}
            />
          )}
          {state.phase === "briefing" && <HostBriefing state={state} />}
          {(state.phase === "evidence" || state.phase === "investigation") && (
            <HostBoard state={state} />
          )}
          {state.phase === "suspense" && <HostSuspense />}
          {state.phase === "reveal" && <HostReveal state={state} />}
          {state.phase === "docket" && <HostDocket state={state} />}
          {state.phase === "final" && <HostFinal state={state} />}

          {advanceLabel && (
            <div className="sticky bottom-6 mt-10 flex justify-center">
              <PlateButton
                primary
                onClick={() => send({ type: "host:advance" })}
                className="px-12 text-xl"
              >
                {advanceLabel} ☞
              </PlateButton>
            </div>
          )}
        </main>
      )}
    </div>
  );
}
