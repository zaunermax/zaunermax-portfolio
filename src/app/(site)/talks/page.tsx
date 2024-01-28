import {
	FileContent,
	FileList,
	FileRow,
	FileRowLink,
	NotTheFilesYouReLookingFor,
} from '@/components/file-display';
import { getPublicTalks } from '@/lib/sanity/get-public-talks';
import { Folder } from 'lucide-react';
import { getTalksSectionContent } from '@/lib/sanity/get-talks-section-content';
import { PortableText } from '@portabletext/react';
import { components } from '@/lib/portable-text-components';

export const revalidate = 300;

const Page = async () => {
	const [talks, content] = await Promise.all([
		getPublicTalks(),
		getTalksSectionContent(),
	]);

	if (!talks.length)
		return (
			<div className="mb-20 mt-20 md:mt-28">
				<NotTheFilesYouReLookingFor filename={'talks'} />
			</div>
		);

	return (
		<div className="mt-20 md:mt-28">
			<FileList commitMsg={"feat(🎙️): did some talkin'"} nrOfCommits={talks.length}>
				{talks.map(({ talk, slug, event }) => (
					<FileRowLink
						key={talk}
						mode={'compact'}
						filename={
							<>
								<span className="hidden md:inline">{event} - </span>
								<span>{talk}</span>
							</>
						}
						relativeTimeAgo={'3 weeks ago'}
						icon={Folder}
						linkProps={{
							href: `/talks/${slug}`,
						}}
					/>
				))}
			</FileList>
			<FileContent filename={'TALKS.md'} commitMsg="feat(👼): being a tech enthusiast">
				{content ? (
					<PortableText value={content.talksContent} components={components} />
				) : (
					<NotTheFilesYouReLookingFor filename={'TALKS_CONTENT.md'} />
				)}
			</FileContent>
		</div>
	);
};

export default Page;
