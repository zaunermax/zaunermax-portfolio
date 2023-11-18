import { OpenAI } from 'openai';
import 'server-only';

export const openai = new OpenAI({
	apiKey: process.env.OPENAI_API_KEY,
});
