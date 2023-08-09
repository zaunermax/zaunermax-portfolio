import { WikiPageContent } from '@/lib/get-wiki-content';
import { PortableText } from '@portabletext/react';
import { FileContent } from './components/file-content';
import { components } from '@/lib/portable-text-components';
import { serverURL } from '@/lib/server-url';
import { redirect } from 'next/navigation';
import { doFetch } from '@/lib/fetch-utils';

const fetchWikiPageContent = (filename: string): Promise<WikiPageContent | null> =>
	doFetch({
		url: `${serverURL}/api/file/${filename}`,
		defaultValue: null,
	});

const Page = async ({ params }: { params: { slug: string } }) => {
	const res = await fetchWikiPageContent(params.slug);

	// TODO: add wiki 404
	if (res === null) redirect('/');

	const { content, ...rest } = res;

	return (
		<FileContent {...rest}>
			<PortableText value={content} components={components} />
		</FileContent>
	);
};

export default Page;
