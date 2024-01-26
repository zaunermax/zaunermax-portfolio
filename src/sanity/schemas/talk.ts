import { SchemaTypeDefinition } from 'sanity';

const Talk: SchemaTypeDefinition = {
	name: 'talk',
	title: 'Talk',
	type: 'document',
	fields: [
		{
			name: 'event',
			title: 'Event',
			type: 'string',
		},
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
