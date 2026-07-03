/**
 * The Code Detective wire server: a plain Node WebSocket server hosting
 * one GameRoom per live session. Speaks the same URL shape partysocket
 * builds (/parties/code-detective/<room>), so the client needs nothing
 * platform-specific. Run with: tsx server/index.ts
 */

import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";

import { GameRoom, type WireConnection } from "./room";

const PORT = Number(process.env.PORT ?? 1999);
const ROOM_PATH = /^\/parties\/code-detective\/([A-Za-z0-9_-]{1,32})$/;
const HEARTBEAT_MS = 30_000;
const SWEEP_MS = 10 * 60_000;
const ROOM_IDLE_MS = 2 * 60 * 60_000;

interface RoomEntry {
  game: GameRoom;
  lastTouched: number;
}

const rooms = new Map<string, RoomEntry>();

function roomFor(id: string): RoomEntry {
  let entry = rooms.get(id);
  if (!entry) {
    entry = { game: new GameRoom(), lastTouched: Date.now() };
    rooms.set(id, entry);
  }
  entry.lastTouched = Date.now();
  return entry;
}

const httpServer = createServer((req, res) => {
  // Health checks and the curious land here; the game rides WebSockets.
  res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
  res.end("The Code Detective wire is up. Rooms in session: " + rooms.size);
});

const wss = new WebSocketServer({ noServer: true });

httpServer.on("upgrade", (request, socket, head) => {
  const url = new URL(request.url ?? "/", "http://localhost");
  const match = ROOM_PATH.exec(url.pathname);
  if (!match) {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit("connection", ws, request, match[1], url);
  });
});

interface LiveSocket extends WebSocket {
  isAlive?: boolean;
}

wss.on(
  "connection",
  (ws: LiveSocket, _request: unknown, roomId: string, url: URL) => {
    const entry = roomFor(roomId);
    const conn: WireConnection = {
      id: randomUUID(),
      send(data) {
        if (ws.readyState === ws.OPEN) ws.send(data);
      },
      close() {
        ws.close();
      },
    };

    ws.isAlive = true;
    ws.on("pong", () => {
      ws.isAlive = true;
    });

    try {
      entry.game.onConnect(conn, url);
    } catch (err) {
      console.error(`[room ${roomId}] onConnect failed:`, err);
      ws.close();
      return;
    }

    ws.on("message", (data, isBinary) => {
      entry.lastTouched = Date.now();
      if (isBinary) return; // binary frames are not part of the protocol
      try {
        entry.game.onMessage(conn, data.toString());
      } catch (err) {
        console.error(`[room ${roomId}] onMessage failed:`, err);
      }
    });

    ws.on("close", () => {
      try {
        entry.game.onClose(conn);
      } catch (err) {
        console.error(`[room ${roomId}] onClose failed:`, err);
      }
    });

    ws.on("error", (err) => {
      console.error(`[room ${roomId}] socket error:`, err.message);
    });
  },
);

// Keep proxies from culling quiet connections; cull truly dead ones.
setInterval(() => {
  for (const ws of wss.clients as Set<LiveSocket>) {
    if (ws.isAlive === false) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, HEARTBEAT_MS).unref();

// A room with no sockets and no recent activity is over.
setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of rooms) {
    if (entry.game.isIdle && now - entry.lastTouched > ROOM_IDLE_MS) {
      entry.game.dispose();
      rooms.delete(id);
    }
  }
}, SWEEP_MS).unref();

httpServer.listen(PORT, () => {
  console.log(`Code Detective wire listening on :${PORT}`);
});
