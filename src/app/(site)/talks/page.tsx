import {
	FileContent,
	FileList,
	FileRowLink,
	NotTheFilesYouReLookingFor,
} from '@/components/file-display';
import { getPublicTalks } from '@/lib/sanity/get-public-talks';
import { Folder } from 'lucide-react';
import { getTalksSectionContent } from '@/lib/sanity/get-talks-section-content';
import { getEvents } from '@/lib/sanity/get-events';
import { H2, Link } from '@/components/text-components';
import { Fragment } from 'react';
import { CustomPortableText } from '@/components/custom-portable-text';
import { TimeAgo } from '@/components/time-ago/time-ago';

export const revalidate = 300;

const Page = async () => {
	const [talks, content, events] = await Promise.all([
		getPublicTalks(),
		getTalksSectionContent(),
		getEvents(),
	]);

	if (!talks.length)
		return (
			<div className="mb-20 mt-20 md:mt-28">
				<NotTheFilesYouReLookingFor filename={'talks'} />
			</div>
		);

	return (
		<div className="mb-20 mt-20 md:mt-28">
			{talks.length ? (
				<FileList commitMsg={"feat(🎙️): did some talkin'"} nrOfCommits={talks.length}>
					{talks.map(({ talk, slug, event, date }) => (
						<FileRowLink
							key={talk}
							mode={'compact'}
							filename={
								<>
									<span className="hidden md:inline">{event} - </span>
									<span>{talk}</span>
								</>
							}
							relativeTimeAgo={<TimeAgo dateString={date} />}
							icon={Folder}
							linkProps={{
								href: `/talks/${slug}`,
							}}
						/>
					))}
				</FileList>
			) : null}
			{content ? (
				<FileContent filename={'TALKS.md'} commitMsg="feat(👼): being a tech enthusiast">
					<CustomPortableText value={content.talksContent} />
					{events.map(({ name, description, url }) => (
						<Fragment key={name}>
							<H2>
								<Link href={url}>{name}</Link>
							</H2>
							<CustomPortableText value={description} />
						</Fragment>
					))}
				</FileContent>
			) : (
				<NotTheFilesYouReLookingFor filename={'TALKS_CONTENT.md'} />
			)}
		</div>
	);
};

export default Page;
