import type { StructureBuilder } from 'sanity/structure';

export const structure = (S: StructureBuilder) =>
	S.list()
		.title('Content')
		.items([
			S.listItem()
				.title('General')
				.child(S.editor().schemaType('general').documentId('general')),
			...S.documentTypeListItems().filter(
				(listItem) => !['general'].includes(listItem.getId() ?? ''),
			),
		]);
