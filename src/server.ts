import handler from './start-server';
export { QuestForge } from './server/quest-forge.server';
export { QuestLimits } from './server/quest-limits.server';
export { QuestRoom } from './server/quest-room.server';

export default {
	fetch(request, env, ctx) {
		const url = new URL(request.url);
		if (url.pathname === '/main' || url.pathname.startsWith('/main/')) {
			url.pathname = url.pathname.slice('/main'.length) || '/';
			return Response.redirect(url.toString(), 307);
		}
		if (url.pathname === '/impressum') {
			return Response.redirect('https://zaunermax.at/wiki/IMPRESSUM.md', 307);
		}
		return handler.fetch(request, { context: { cloudflare: { env, ctx } } });
	},
} satisfies ExportedHandler<Env>;
