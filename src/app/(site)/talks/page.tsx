import { FileContent, NotTheFilesYouReLookingFor } from '@/components/file-display';
import { getPublicTalks } from '@/lib/sanity/get-public-talks';
import { H1, H2, Link, Paragraph } from '@/components/text-components';

export const revalidate = 300;

const Page = async () => {
	const talks = await getPublicTalks();

	if (!talks.length)
		return (
			<div className="mb-20 mt-20 md:mt-28">
				<NotTheFilesYouReLookingFor filename={'talks'} />
			</div>
		);

	return (
		<div className="mt-20 md:mt-28">
			<FileContent filename={'talks'} commitMsg="feat(talks): did some talks">
				<H1>Welcome to my Talks section 🗣️</H1>
				<Paragraph>
					You can find some past talks I did in this section. Feel free to browse a bit.
				</Paragraph>
				<H2>React Vienna</H2>
				<Paragraph>
					<Link href="https://www.meetup.com/de-DE/reactvienna/">React Vienna</Link> is a
					viennese meetup not only about React, but also web technology stuff in general.
				</Paragraph>
				<Paragraph>Talks:</Paragraph>
				{talks.map((talk) => (
					<div key={talk.talk}>
						<div>{talk.event}</div>
						<div>{talk.talk}</div>
						<div>{talk.date}</div>
					</div>
				))}
			</FileContent>
		</div>
	);
};

export default Page;
