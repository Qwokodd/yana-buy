import { io } from "socket.io-client";

// URL of the shared realtime server (see /server). Override with a
// VITE_SERVER_URL env var when deploying (e.g. .env.production).
const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:4000";

// One shared socket for the whole restaurant app — imported wherever needed.
export const socket = io(SERVER_URL, {
  autoConnect: true,
  reconnection: true,
});
