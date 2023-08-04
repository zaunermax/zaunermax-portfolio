import { ReactNode } from 'react';
import { FileList } from './components/file-list';
import { FileRowLink } from './components/file-row';
import { File } from 'lucide-react';
import { getWikiContent } from '@/lib/get-wiki-content';
import { getCVUrl } from '@/lib/get-person';

export default async function Layout({ children }: { children: ReactNode }) {
	const { fileUrl } = await getCVUrl();
	const content = await getWikiContent();

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
				<FileRowLink
					linkProps={{
						href: fileUrl,
						target: '_blank',
						rel: 'noopener noreferrer',
					}}
					icon={File}
					filename={'CV.pdf'}
					commitMsg={'fix(📝): removed phone from public CV'}
					relativeTimeAgo={'yesterday'}
				/>
			</FileList>
			{children}
		</div>
	);
}