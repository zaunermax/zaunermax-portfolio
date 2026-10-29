import OpenAI from 'openai';
import { createOpenAI } from '@ai-sdk/openai';

export function getOpenAI() {
	return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

export function getAIProvider() {
	return createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

export function getLanguageModel() {
	const model = process.env.OPENAI_MODEL;
	if (!model) throw new Error('OPENAI_MODEL is required');
	return getAIProvider().responses(model);
}
