import { NotTheFilesYouReLookingFor } from './components/not-the-files-you-re-looking-for';
import { WikiPageContent } from '@/lib/get-wiki-content';
import { PortableText } from '@portabletext/react';
import { FileContent } from './components/file-content';
import { components } from '@/lib/portable-text-components';
import { serverURL } from '@/lib/server-only/server-url';
import { doFetch } from '@/lib/fetch-utils';

const fetchWikiPageContent = (filename: string): Promise<WikiPageContent | null> =>
	doFetch({
		url: `${serverURL}/api/file/${filename}`,
		defaultValue: null,
	});

const Page = async ({ params }: { params: { slug: string } }) => {
	const res = await fetchWikiPageContent(params.slug);

	if (res === null) return <NotTheFilesYouReLookingFor filename={params.slug} />;

	const { content, ...rest } = res;

	return (
		<FileContent {...rest}>
			<PortableText value={content} components={components} />
		</FileContent>
	);
};

export default Page;
