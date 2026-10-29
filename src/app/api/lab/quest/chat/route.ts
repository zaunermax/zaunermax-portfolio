import {
	createUIMessageStream,
	createUIMessageStreamResponse,
	generateId,
	stepCountIs,
	streamText,
	toUIMessageStream,
} from 'ai';
import { business } from '@/app/(lab)/lab/_shared/content';
import { CHAT_LIMITS } from '@/app/(lab)/lab/1-quest/chat/contract';
import {
	chatRequestSchema,
	readHistory,
	toModelMessages,
	turnText,
} from '@/app/(lab)/lab/1-quest/chat/history';
import { buildQuestInstructions, CANNED } from '@/app/(lab)/lab/1-quest/chat/prompt';
import { questTools, sanitizeToolStream } from '@/app/(lab)/lab/1-quest/chat/tools';
import { clientKey, rateLimit } from '@/app/(lab)/lab/1-quest/server/rate-limit';
import { getLlmContext } from '@/lib/server-only/llm-context-utils';
import { aiOpenAI, getLanguageModel, openai } from '@/lib/server-only/openai-client';

export const maxDuration = 60;

const MAX_BODY_CHARS = 64_000;
const PER_IP = { limit: 20, windowMs: 10 * 60_000 };
const DAILY = { limit: 1500, windowMs: 24 * 60 * 60_000 };
const NO_STORE = { 'Cache-Control': 'no-store' };

function fail(status: number, message: string, headers: Record<string, string> = {}) {
	return Response.json({ message }, { status, headers: { ...NO_STORE, ...headers } });
}

function questModel() {
	const model = process.env.QUEST_CHAT_MODEL?.trim();
	return model ? aiOpenAI.responses(model) : getLanguageModel();
}

/** A fixed reply streamed like a normal one, so it lands in the chat as Max's line. */
function cannedReply(text: string) {
	return createUIMessageStreamResponse({
		stream: createUIMessageStream({
			execute({ writer }) {
				const id = generateId();
				writer.write({ type: 'start' });
				writer.write({ type: 'text-start', id });
				writer.write({ type: 'text-delta', id, delta: text });
				writer.write({ type: 'text-end', id });
				writer.write({ type: 'finish' });
			},
		}),
		headers: NO_STORE,
	});
}

export async function POST(request: Request) {
	if (!request.headers.get('content-type')?.includes('application/json')) {
		return fail(400, 'Send the conversation as JSON.');
	}
	const raw = await request.text().catch(() => '');
	if (raw.length > MAX_BODY_CHARS)
		return fail(400, 'That conversation is too long to send.');
	let body: unknown;
	try {
		body = JSON.parse(raw);
	} catch {
		return fail(400, 'That message could not be read. Reload the page and try again.');
	}
	const parsed = chatRequestSchema.safeParse(body);
	if (!parsed.success) {
		return fail(400, 'That message could not be read. Reload the page and try again.');
	}
	const history = readHistory(parsed.data.messages);
	if (!history.ok) {
		return fail(
			400,
			history.reason === 'message-too-long'
				? `That's a long one. Keep a message under ${CHAT_LIMITS.messageChars} characters.`
				: 'Say something first, then I can answer.',
		);
	}

	const ip = clientKey(request);
	const perIp = rateLimit(`quest-chat:ip:${ip}`, PER_IP.limit, PER_IP.windowMs);
	if (!perIp.ok) {
		const minutes = Math.max(1, Math.ceil(perIp.retryAfterSeconds / 60));
		return fail(
			429,
			`My echo needs a breather after so many questions. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
			{ 'Retry-After': String(perIp.retryAfterSeconds) },
		);
	}
	const daily = rateLimit('quest-chat:global', DAILY.limit, DAILY.windowMs);
	if (!daily.ok) {
		return fail(
			429,
			`My echo has talked all day and needs to rest. Come back tomorrow, or email Max at ${business.email}.`,
			{ 'Retry-After': String(daily.retryAfterSeconds) },
		);
	}

	try {
		// Moderate the whole kept history in one call: the latest message decides whether we answer,
		// flagged earlier messages are left out of the model's context.
		const moderation = await openai.moderations.create(
			{ model: 'omni-moderation-latest', input: history.turns.map(turnText) },
			{ signal: request.signal },
		);
		const flagged = history.turns.map(
			(_, index) => moderation.results[index]?.flagged ?? true,
		);
		if (flagged.at(-1)) return cannedReply(CANNED.moderation);
		const turns = history.turns.filter((_, index) => !flagged[index]);

		const cvTexts = await getLlmContext()
			.then((entries) => entries.map(({ text }) => text))
			.catch((error: unknown) => {
				console.error('[quest] CMS context is unavailable:', error);
				return [];
			});

		const result = streamText({
			model: questModel(),
			instructions: buildQuestInstructions({ cvTexts, now: new Date() }),
			messages: toModelMessages(turns),
			tools: questTools,
			toolChoice: 'auto',
			// Step 1 may draft a scroll; step 2 then only talks about it.
			stopWhen: stepCountIs(2),
			prepareStep: ({ stepNumber }) => (stepNumber > 0 ? { toolChoice: 'none' } : {}),
			maxOutputTokens: 400,
			maxRetries: 1,
			providerOptions: { openai: { store: false, parallelToolCalls: false } },
			abortSignal: request.signal,
		});

		return createUIMessageStreamResponse({
			stream: toUIMessageStream({
				stream: result.stream.pipeThrough(sanitizeToolStream<typeof questTools>()),
				tools: questTools,
				sendReasoning: false,
				sendSources: false,
				onError: (error) => {
					console.error('[quest] Chat stream failed:', error);
					return CANNED.streamError;
				},
			}),
			headers: NO_STORE,
		});
	} catch (error) {
		console.error('[quest] Unable to answer:', error);
		return fail(503, "My echo can't hear you right now. Try again in a moment.");
	}
}
