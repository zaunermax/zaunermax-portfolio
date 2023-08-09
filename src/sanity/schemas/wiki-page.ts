import { SchemaTypeDefinition } from 'sanity';

const WikiPage: SchemaTypeDefinition = {
	name: 'wiki-page',
	title: 'Wiki Page',
	type: 'document',
	fields: [
		{
			name: 'filename',
			title: 'Filename',
			type: 'string',
			validation: (rule) => rule.required(),
			options: {
				isUnique: true,
			},
		},
		{
			name: 'commitMsg',
			title: 'Commit Message',
			type: 'string',
			validation: (rule) => rule.required(),
		},
		{
			name: 'relativeTimeAgo',
			title: 'How long ago',
			type: 'string',
			validation: (rule) => rule.required(),
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
		{
			name: 'content',
			title: 'Content',
			type: 'array',
			of: [{ type: 'block' }],
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

export default WikiPage;
