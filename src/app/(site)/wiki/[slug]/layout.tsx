import { ReactNode } from 'react';
import { FileList } from './components/file-list';
import { FileRowLink } from './components/file-row';
import { File } from 'lucide-react';
import { WikiContent } from '@/lib/get-wiki-content';
import { serverURL } from '@/lib/server-url';
import { GeneralInfoType } from '@/lib/get-general-info';
import { doFetch } from '@/lib/fetch-utils';

const fetchWikiContent = async (): Promise<WikiContent[]> =>
	doFetch({ url: `${serverURL}/api/file`, defaultValue: [] });

const fetchGeneralInfo = async (): Promise<GeneralInfoType | null> =>
	doFetch({ url: `${serverURL}/api/general`, defaultValue: null });

export default async function Layout({ children }: { children: ReactNode }) {
	const [content, info] = await Promise.all([fetchWikiContent(), fetchGeneralInfo()]);

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
				{info ? (
					<FileRowLink
						linkProps={{
							href: info.fileUrl,
							target: '_blank',
							rel: 'noopener noreferrer',
						}}
						icon={File}
						filename={'CV.pdf'}
						commitMsg={'fix(📝): removed phone from public CV'}
						relativeTimeAgo={'yesterday'}
					/>
				) : null}
			</FileList>
			{children}
		</div>
	);
}
