// client/src/lib/socket.ts
import { io, Socket } from "socket.io-client";
import { getToken } from "./auth";

let socket: Socket | null = null;

/**
 * Decode JWT payload (no verification — that's the server's job).
 * Returns { sub, username, ... } or null.
 */
function decodeTokenPayload(token: string): Record<string, any> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const json = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function getSocket(): Socket {
  if (!socket) {
    const token = getToken();
    const payload = decodeTokenPayload(token);

    const rawUrl = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:4000";
    // Mencegah error "//collab" jika env diset "/"
    const s = io(rawUrl === "/" ? "/collab" : `${rawUrl.replace(/\/$/, "")}/collab`, {
      auth: {
        token,
        userId: payload?.sub ?? "",
        username: payload?.username ?? `guest-${Date.now().toString(36)}`,
      },
    });

    socket = s;

    s.on("connect", () => console.log("[CLIENT] connected", s.id));
    s.on("connect_error", (e) =>
      console.warn("[CLIENT] connect_error", e.message)
    );
    s.on("disconnect", (r) => console.warn("[CLIENT] disconnect", r));
  }
  return socket!;
}

/** Destroy the current socket (used on logout). */
export function destroySocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
