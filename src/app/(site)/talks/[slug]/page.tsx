import { getTalkData } from '@/lib/sanity/get-talk-data';
import { FileList, FileRowLink } from '@/components/file-display';
import { File } from 'lucide-react';
import { NotTheFilesYouReLookingFor } from '@/components/file-display';

const Page = async ({ params }: { params: { slug: string } }) => {
	const res = await getTalkData(params.slug);

	if (!res)
		return (
			<div className="mb-20 mt-20 md:mt-28">
				<NotTheFilesYouReLookingFor filename={params.slug} />
			</div>
		);

	return (
		<div className="mb-20 space-y-10">
			<div className="container mx-auto mt-24 px-4 md:mt-28 md:px-10 lg:px-20">
				<div>
					<h1 className="mb-4 mt-6 text-center text-4xl font-bold md:text-6xl">
						{res.event}
					</h1>
					<p className="text-center text-lg md:text-xl">{res.date}</p>
					<blockquote className="my-4 text-center">
						<span className="inline-block border-l-4 border-gray-200 bg-gray-100 px-2 py-4 text-lg font-semibold italic text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 md:px-8 md:text-xl">
							&quot;{res.talk}&quot;
						</span>
					</blockquote>
				</div>
			</div>
			<FileList commitMsg="feat(🎙️): last minute adaptations" nrOfCommits={42}>
				{res.files.map(({ filename, relativeTimeAgo, commitMsg, url }) => {
					return (
						<FileRowLink
							key={filename}
							filename={filename}
							commitMsg={commitMsg}
							relativeTimeAgo={relativeTimeAgo}
							icon={File}
							linkProps={{
								href: url,
								target: '_blank',
								rel: 'noopener noreferrer',
							}}
						/>
					);
				})}
			</FileList>
		</div>
	);
};

export default Page;
