import { getTalkData } from '@/lib/get-talk-data';
import { FileList, FileRowLink } from '@/components/file-display';
import { File } from 'lucide-react';
import { NotTheFilesYouReLookingFor } from '@/components/file-display';

export const revalidate = 300;

const Page = async ({ params }: { params: { slug: string } }) => {
	const res = await getTalkData(params.slug);

	if (!res)
		return (
			<div className="mb-20 mt-20 md:mt-28">
				<NotTheFilesYouReLookingFor filename={params.slug} />
			</div>
		);

	return (
		<div className="container mx-auto mt-24 space-y-10 px-4 md:mt-28 md:px-10 lg:px-20">
			<div>
				<h1 className="mb-4 mt-6 text-center text-4xl font-bold md:text-6xl">
					{res.event}
				</h1>
				<p className="text-center text-lg md:text-xl">{res.date}</p>
				<blockquote className="text-md mt-2 text-center italic text-gray-600 md:text-lg">
					&quot;{res.talk}&quot;
				</blockquote>
			</div>
			<FileList commitMsg="feat(🎙️): last minute adaptations" nrOfCommits={42}>
				{res.fileUrls.map((url) => {
					return (
						<FileRowLink
							key={url}
							filename={'test'}
							commitMsg={'cool'}
							relativeTimeAgo={'20 days ago'}
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
