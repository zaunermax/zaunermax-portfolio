import { SchemaTypeDefinition } from 'sanity';

const Person: SchemaTypeDefinition = {
	name: 'person',
	title: 'Person',
	type: 'document',
	fields: [
		{
			name: 'fullName',
			title: 'Full name',
			type: 'string',
		},
		{
			name: 'bio',
			title: 'Bio',
			type: 'text',
		},
		{
			name: 'portrait',
			title: 'Portrait',
			type: 'image',
			options: {
				hotspot: true,
			},
		},
	],
};

export default Person;
