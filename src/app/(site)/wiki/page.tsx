import { getCVUrl } from '@/lib/get-person';
import { File } from 'lucide-react';
import { FileRowLink } from './components/file-row';
import { FileList } from './components/file-list';
import { getWikiContent } from '@/lib/get-wiki-content';

export const revalidate = 300;

const Page = async () => {
	const content = await getWikiContent();
	const { fileUrl } = await getCVUrl();

	return (
		<div className="mt-20 md:mt-28">
			<FileList>
				{content.map((doc) => {
					return (
						<FileRowLink
							{...doc}
							key={doc.filename}
							icon={File}
							linkProps={{
								href: `wiki/${doc.filename}`,
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
		</div>
	);
};

export default Page;
