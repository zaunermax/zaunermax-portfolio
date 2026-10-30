import { DurableObject } from 'cloudflare:workers';
import { createRoom, newSessionId, publicIdFor } from '@/quest/room/room.server';
import {
	PING,
	PONG,
	SESSION_ID,
	SESSION_PARAM,
	type ForgePhase,
} from '@/quest/room/protocol';

export class QuestRoom extends DurableObject<Env> {
	private readonly room;

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(PING, PONG));
		this.room = createRoom({
			sockets: () => ctx.getWebSockets(),
			now: () => Date.now(),
			lastPing: (ws) =>
				ctx.getWebSocketAutoResponseTimestamp(ws as WebSocket)?.getTime() ?? null,
		});
	}

	async fetch(request: Request): Promise<Response> {
		if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
			return Response.json({ message: 'WebSocket upgrade required.' }, { status: 426 });
		}
		const candidate = new URL(request.url).searchParams.get(SESSION_PARAM);
		const session = candidate && SESSION_ID.test(candidate) ? candidate : newSessionId();
		const id = await publicIdFor(session);
		const { 0: client, 1: server } = new WebSocketPair();
		this.ctx.acceptWebSocket(server);
		this.room.join(server, session, id);
		return new Response(null, { status: 101, webSocket: client });
	}

	webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
		this.room.message(ws, message);
	}

	webSocketClose(ws: WebSocket) {
		// Since 2026-04-07 the runtime completes the close handshake, including hibernated sockets.
		this.room.close(ws);
	}

	webSocketError(ws: WebSocket) {
		this.room.close(ws);
		try {
			ws.close(1011, 'socket error');
		} catch {
			/* Already disconnected. */
		}
	}

	async forgeEvent(phase: ForgePhase): Promise<void> {
		this.room.forge(phase);
	}
}
