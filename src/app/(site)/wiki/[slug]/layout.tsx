import { ReactNode } from 'react';
import { FileList } from '@/components/file-display';
import { FileRowLink } from '@/components/file-display';
import { File } from 'lucide-react';
import { getWikiContent } from '@/lib/sanity/get-wiki-content';
import { getGeneralInfo } from '@/lib/sanity/get-general-info';

export default async function Layout({ children }: { children: ReactNode }) {
	const [content, info] = await Promise.all([getWikiContent(), getGeneralInfo()]);

	return (
		<div className="mb-20 mt-20 md:mt-28">
			<FileList>
				{content.map((doc) => {
					return (
						<FileRowLink
							{...doc}
							key={doc.filename}
							icon={File}
							linkProps={{
								href: `${doc.filename}`,
							}}
						/>
					);
				})}
			</FileList>
			{children}
		</div>
	);
}
