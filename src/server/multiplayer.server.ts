export function multiplayerEnabled(env: { QUEST_MULTIPLAYER?: unknown }): boolean {
	return ['1', 'true', 'on'].includes(
		String(env.QUEST_MULTIPLAYER ?? '')
			.trim()
			.toLowerCase(),
	);
}
