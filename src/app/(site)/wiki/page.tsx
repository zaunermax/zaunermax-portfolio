import { getCVUrl } from '@/lib/get-person';
import { Button } from '@/components/ui/button';
import { OwnAvatar } from '@/components/ui/own-avatar';
import { History, Folder, File } from 'lucide-react';
import { MultiplyChildren } from '@/components/multiply-children';

export const revalidate = 300;

const DownloadCVButton = async () => {
	const { fileUrl } = await getCVUrl();

	return (
		<Button asChild className="mx-auto" size="lg">
			<a href={fileUrl} target="_blank" rel="noopener noreferrer">
				Download CV
			</a>
		</Button>
	);
};

const Page = async () => {
	return (
		<div className="mt-20 md:mt-28">
			<div className="m-auto mb-16 flex max-w-screen-lg flex-col space-y-2">
				<div className="mt-15 mx-auto w-full rounded-lg border-[1px] border-white border-opacity-20 bg-wiki-body text-white shadow-md">
					<div className="flex items-center rounded-t-lg bg-wiki-header px-3 py-4">
						<div className="relative h-6 w-6 flex-shrink-0">
							<OwnAvatar className="absolute inset-0 m-auto mt-[1px] h-6 w-6" />
						</div>
						<div className="mx-2 flex-1 space-x-1.5 text-xs">
							<span className="font-bold hover:cursor-pointer hover:underline">
								zaunermax
							</span>
							<span className="hover:cursor-pointer hover:text-blue-500 hover:underline">
								feat(📄): updated wiki
							</span>
						</div>
						<span className="group mr-2 flex items-center space-x-1 text-xs hover:cursor-pointer hover:text-blue-500 hover:underline">
							<span className="flex items-center">
								<History className="mr-0.5 h-5 w-5" />
								<span className="font-bold">1337</span>{' '}
							</span>
							<span className="hidden text-gray-500 group-hover:text-blue-500 sm:inline">
								commits
							</span>
						</span>
					</div>
					<MultiplyChildren times={10}>
						<div className="flex items-center border-t-[1px] border-t-white border-opacity-10 px-3 py-2 text-xs hover:cursor-pointer hover:bg-wiki-header">
							<File className="mr-4 h-4 w-4" />
							<div className="flex-auto">README.md</div>
							<div className="flex-auto text-gray-500">feat(📄): updated readme</div>
							<div className="text-right text-gray-500">yesterday</div>
						</div>
					</MultiplyChildren>
				</div>
			</div>
		</div>
	);
};

export default Page;
