import { NotTheFilesYouReLookingFor } from './components/not-the-files-you-re-looking-for';
import { getWikiPageContent } from '@/lib/get-wiki-content';
import { PortableText } from '@portabletext/react';
import { FileContent } from './components/file-content';
import { components } from '@/lib/portable-text-components';

export const revalidate = 300;

const Page = async ({ params }: { params: { slug: string } }) => {
	const res = await getWikiPageContent(params.slug);

	if (res === null) return <NotTheFilesYouReLookingFor filename={params.slug} />;

	const { content, ...rest } = res;

	return (
		<FileContent {...rest}>
			<PortableText value={content} components={components} />
		</FileContent>
	);
};

export default Page;
