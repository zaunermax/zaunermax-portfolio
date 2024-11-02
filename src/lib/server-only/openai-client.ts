import { OpenAI } from 'openai';
import { createOpenAI } from '@ai-sdk/openai';
import 'server-only';

export const openai = new OpenAI({
	apiKey: process.env.OPENAI_API_KEY,
});

export const openaiVercel = createOpenAI({
	compatibility: 'strict',
	apiKey: process.env.OPENAI_API_KEY,
});
