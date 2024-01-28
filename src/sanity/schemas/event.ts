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
		},
		{
			name: 'description',
			title: 'Description',
			type: 'array',
			of: [{ type: 'block' }],
		},
	],
};

export default Event;
