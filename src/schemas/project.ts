import { SchemaTypeDefinition } from 'sanity';

const Project: SchemaTypeDefinition = {
	name: 'project',
	title: 'Project',
	type: 'document',
	fields: [
		{
			name: 'projectName',
			title: 'Project Name',
			type: 'string',
		},
	],
};

export default Project;
