import { defineConfig } from 'sanity';
import { deskTool } from 'sanity/desk';

import { schemaTypes } from './schemas';
import { structure } from './desk-structure';

const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID!;
const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET!;

export const config = defineConfig({
	basePath: '/studio', // <-- important that `basePath` matches the route you're mounting your studio from, it applies to both `/pages` and `/app`

	projectId,
	dataset,

	plugins: [deskTool({ structure })],

	schema: { types: schemaTypes },

	document: {
		actions: (prev, { schemaType }) => {
			if (schemaType === 'general') {
				return prev.filter(
					({ action }) => !['unpublish', 'delete', 'duplicate'].includes(action ?? ''),
				);
			}
			return prev;
		},
		newDocumentOptions: (prev, { creationContext }) => {
			if (creationContext.type === 'global') {
				return prev.filter((templateItem) => templateItem.templateId !== 'general');
			}
			return prev;
		},
	},
});
