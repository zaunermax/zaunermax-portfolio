import { getWikiPageContent } from '@/lib/get-wiki-content';
import { PortableText, PortableTextProps } from '@portabletext/react';
import Link from 'next/link';

const components: PortableTextProps['components'] = {
	block: {
		h1: ({ children }) => <h1 className="text-3xl">{children}</h1>,
	},
};

const Page = async ({ params }: { params: { slug: string } }) => {
	const { content } = await getWikiPageContent(params.slug);

	console.log(content);

	return (
		<div className="mt-28">
			<PortableText value={content} components={components} />
			<Link href={'/wiki'}>Back</Link>
		</div>
	);
};

export default Page;
