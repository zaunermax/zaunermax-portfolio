import { SchemaTypeDefinition } from 'sanity';

const General: SchemaTypeDefinition = {
	name: 'general',
	title: 'General',
	type: 'document',
	fields: [
		{
			name: 'name',
			title: 'Name',
			type: 'string',
		},
		{
			name: 'introSentences',
			title: 'Intro Sentences',
			type: 'array',
			of: [{ type: 'string' }],
		},
		{
			name: 'cv',
			title: 'CV',
			type: 'file',
			options: {
				accept: '.pdf',
			},
		},
	],
};

export default General;
