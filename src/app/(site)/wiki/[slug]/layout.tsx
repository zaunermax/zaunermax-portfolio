import { ReactNode } from 'react';
import { FileList } from './components/file-list';
import { FileRowLink } from './components/file-row';
import { File } from 'lucide-react';
import { WikiContent } from '@/lib/get-wiki-content';
import { serverURL } from '@/lib/server-url';
import { GeneralInfoType } from '@/lib/get-general-info';

const fetchWikiContent = async () =>
	fetch(`${serverURL}/api/file`, {
		next: { revalidate: 300 },
	})
		.then((res) => (!res.ok ? [] : res.json()) as WikiContent[])
		.catch((e) => {
			console.error(e);
			return [] as WikiContent[];
		});

const fetchGeneralInfo = async () =>
	fetch(`${serverURL}/api/general`, {
		next: { revalidate: 300 },
	})
		.then((res) => (!res.ok ? null : res.json()) as GeneralInfoType | null)
		.catch((e) => {
			console.error(e);
			return null;
		});

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
