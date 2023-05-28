export default {
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
			name: 'portrait',
			title: 'Portrait',
			type: 'image',
			options: {
				hotspot: true,
			}
		}
	]
}
