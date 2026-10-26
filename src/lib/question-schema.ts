import { z } from 'zod';

export const questionSchema = z
	.string()
	.trim()
	.min(1, 'Please ask a question.')
	.max(100, 'The question cannot be longer than 100 characters');
export const completionRequestSchema = z.object({ prompt: questionSchema });
