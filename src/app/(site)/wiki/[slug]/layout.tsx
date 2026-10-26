import { ReactNode } from 'react';
import { FileList } from '@/components/file-display';
import { FileRowLink } from '@/components/file-display';
import { File } from 'lucide-react';
import { getWikiContent } from '@/lib/sanity/get-wiki-content';

export default async function Layout({ children }: { children: ReactNode }) {
	const content = await getWikiContent();

	return (
		<div className="mt-20 mb-20 md:mt-28">
			<FileList>
				{content.map((doc) => {
					return (
						<FileRowLink
							{...doc}
							key={doc.filename}
							icon={File}
							linkProps={{
								href: `/wiki/${doc.filename}`,
							}}
						/>
					);
				})}
			</FileList>
			{children}
		</div>
	);
}
