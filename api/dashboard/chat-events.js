// GET /api/dashboard/chat-events — see api/dashboard/events.js
import { makeEventsHandler } from "./events.js";

export default makeEventsHandler("chat");
