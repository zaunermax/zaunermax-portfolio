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
			hidden: true,
		},
		{
			name: 'introSentencesV2',
			title: 'Intro Sentences V2',
			type: 'array',
			of: [
				{
					type: 'object',
					fields: [
						{
							name: 'sentence',
							title: 'Sentence',
							type: 'string',
						},
						{
							name: 'isRandom',
							title: 'Is Random',
							type: 'boolean',
						},
					],
				},
			],
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
