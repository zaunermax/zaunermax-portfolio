import { SchemaTypeDefinition } from 'sanity';

const LlmContent: SchemaTypeDefinition = {
	name: 'llm-content',
	title: 'LLM-Content',
	type: 'document',
	fields: [
		{
			name: 'title',
			title: 'Title',
			type: 'string',
		},
		{
			name: 'text',
			title: 'Text',
			type: 'text',
		},
		{
			name: 'order',
			title: 'Order',
			type: 'number',
			initialValue: Date.now(),
			validation: (rule) => rule.required(),
			options: {
				isUnique: true,
			},
		},
	],
	orderings: [
		{
			title: 'Order',
			name: 'order',
			by: [{ field: 'order', direction: 'asc' }],
		},
	],
};

export default LlmContent;
