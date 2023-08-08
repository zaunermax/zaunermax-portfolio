import { ReactNode, Suspense } from 'react';
import { FileList } from './components/file-list';
import { FileRowLink } from './components/file-row';
import { File } from 'lucide-react';
import { WikiContent } from '@/lib/get-wiki-content';
import { serverURL } from '@/lib/server-url';
import { CvLink, LoadingCvLink } from './components/cv-link';

const fetchWikiContent = async () =>
	fetch(`${serverURL}/api/file`, {
		next: { revalidate: 300 },
	})
		.then((res) => (!res.ok ? [] : res.json()) as WikiContent[])
		.catch((e) => {
			console.error(e);
			return [] as WikiContent[];
		});

export default async function Layout({ children }: { children: ReactNode }) {
	const content = await fetchWikiContent();

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
				<Suspense fallback={<LoadingCvLink />}>
					<CvLink />
				</Suspense>
			</FileList>
			{children}
		</div>
	);
}
