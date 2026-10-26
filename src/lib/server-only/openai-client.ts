import 'server-only';
import OpenAI from 'openai';
import { createOpenAI } from '@ai-sdk/openai';

export const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
export const aiOpenAI = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });

export function getLanguageModel() {
	const model = process.env.OPENAI_MODEL;
	if (!model) throw new Error('OPENAI_MODEL is required');
	return aiOpenAI.responses(model);
}
