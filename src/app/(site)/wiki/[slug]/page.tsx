import { getWikiPageContent } from '@/lib/get-wiki-content';
import { PortableText, PortableTextProps } from '@portabletext/react';

import { File } from 'lucide-react';

const components: PortableTextProps['components'] = {
	block: {
		h1: ({ children }) => <h1 className="text-3xl">{children}</h1>,
	},
};

const Page = async ({ params }: { params: { slug: string } }) => {
	const { content: fileContent } = await getWikiPageContent(params.slug);

	return (
		<div className="m-auto mt-4 flex max-w-screen-md flex-col space-y-2">
			<div className="mt-15 mx-auto w-full overflow-hidden rounded-lg border-[1px] border-white border-opacity-20 bg-wiki-body text-white shadow-md">
				<div className="flex items-center rounded-t-lg bg-wiki-body px-3 py-4">
					<div className="relative h-4 w-4 flex-shrink-0">
						<File className="h-4 w-4" />
					</div>
					<div className="mx-2 flex-1 text-xs">README.md</div>
					<span className="group mr-2 inline text-xs hover:cursor-pointer hover:text-blue-500 hover:underline sm:hidden">
						feat(📖): added readme
					</span>
				</div>
				<div className="border-t-[1px] border-t-white border-opacity-10 px-3 py-2 text-xs">
					<PortableText value={fileContent} components={components} />
				</div>
			</div>
		</div>
	);
};

export default Page;
