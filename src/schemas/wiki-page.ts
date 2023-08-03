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
		},
		{
			name: 'commitMsg',
			title: 'Commit Message',
			type: 'string',
		},
		{
			name: 'relativeTimeAgo',
			title: 'How long ago',
			type: 'string',
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
			title: 'Content',
			name: 'content',
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
