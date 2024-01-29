import { SchemaTypeDefinition } from 'sanity';

const Event: SchemaTypeDefinition = {
	name: 'event',
	title: 'Event',
	type: 'document',
	fields: [
		{
			name: 'name',
			title: 'Name',
			type: 'string',
			validation: (rule) => rule.required(),
		},
		{
			name: 'description',
			title: 'Description',
			type: 'array',
			of: [{ type: 'block' }],
		},
		{
			name: 'url',
			title: 'URL of Event',
			type: 'url',
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
	],
	orderings: [
		{
			title: 'Order',
			name: 'order',
			by: [{ field: 'order', direction: 'asc' }],
		},
	],
};

export default Event;
