import { getWikiPageContent } from '@/lib/get-wiki-content';
import { PortableText } from '@portabletext/react';
import { FileContent } from './components/file-content';
import { components } from '@/lib/portable-text-components';

const Page = async ({ params }: { params: { slug: string } }) => {
	const { content, ...rest } = await getWikiPageContent(params.slug);

	return (
		<FileContent {...rest}>
			<PortableText value={content} components={components} />
		</FileContent>
	);
};

export default Page;
