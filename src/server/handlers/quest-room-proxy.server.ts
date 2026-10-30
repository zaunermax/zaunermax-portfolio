import { env } from 'cloudflare:workers';
import { CLOSE_DISABLED } from '@/quest/room/protocol';
import { multiplayerEnabled } from '../multiplayer.server';

export async function GET(request: Request): Promise<Response> {
	if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
		return Response.json({ message: 'WebSocket upgrade required.' }, { status: 426 });
	}
	if (!multiplayerEnabled(env)) {
		const { 0: client, 1: server } = new WebSocketPair();
		server.accept();
		server.close(CLOSE_DISABLED, 'disabled');
		return new Response(null, { status: 101, webSocket: client });
	}
	return env.QUEST_ROOM.getByName('global').fetch(request);
}
