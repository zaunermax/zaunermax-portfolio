import { SchemaTypeDefinition } from 'sanity';

const Talk: SchemaTypeDefinition = {
	name: 'talk',
	title: 'Talk',
	type: 'document',
	fields: [
		{
			name: 'talk',
			title: 'Talk Name',
			type: 'string',
		},
		{
			name: 'date',
			title: 'Date',
			type: 'string',
		},
		{
			name: 'eventV2',
			title: 'Event V2',
			type: 'reference',
			to: [{ type: 'event' }],
		},
		{
			name: 'event',
			title: 'Event (Legacy)',
			type: 'string',
			hidden: true,
		},
		{
			name: 'slug',
			title: 'slug',
			type: 'string',
		},
		{
			name: 'public',
			title: 'Is public',
			type: 'boolean',
			initialValue: false,
		},
		{
			name: 'files',
			title: 'Files',
			type: 'array',
			of: [
				{
					type: 'talk-file',
				},
			],
		},
	],
};

export default Talk;
