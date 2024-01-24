import { SchemaTypeDefinition } from 'sanity';

const TalkFile: SchemaTypeDefinition = {
	name: 'talk-file',
	title: 'Talk File',
	type: 'object',
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
			name: 'file',
			title: 'File',
			type: 'file',
		},
		{
			name: 'url',
			title: 'External URL',
			type: 'url',
		},
	],
};

export default TalkFile;
