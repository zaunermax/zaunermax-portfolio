import { PropsWithChildren, ReactNode } from 'react';
import { OwnAvatar } from '@/components/ui/own-avatar';
import { History } from 'lucide-react';

export type FileListProps = {
	children?: ReactNode;
	commitMsg?: string;
	nrOfCommits?: number;
};

export const FileList = ({ children, commitMsg, nrOfCommits }: FileListProps) => {
	return (
		<div className="m-auto flex max-w-screen-md flex-col space-y-2">
			<div className="mt-15 mx-auto w-full overflow-hidden rounded-lg border-[1px] border-black border-opacity-15 bg-wiki-body-light dark:border-white dark:border-opacity-20 dark:bg-wiki-body dark:text-white">
				<div className="flex items-center rounded-t-lg bg-wiki-header-light px-3 py-4 dark:bg-wiki-header">
					<div className="relative h-6 w-6 flex-shrink-0">
						<OwnAvatar className="absolute inset-0 m-auto mt-[1px] h-6 w-6" />
					</div>
					<div className="mx-2 flex-1 space-x-1.5 text-xs">
						<span className="font-bold hover:cursor-pointer hover:underline">
							zaunermax
						</span>
						<span className="hover:cursor-pointer hover:text-blue-500 hover:underline">
							{commitMsg ?? 'feat(📄): updated wiki'}
						</span>
					</div>
					<span className="group mr-2 flex items-center space-x-1 text-xs hover:cursor-pointer hover:text-blue-500 hover:underline">
						<span className="flex items-center">
							<History className="mr-0.5 h-4 w-4" />
							<span className="font-bold">{nrOfCommits ?? 1337}</span>
						</span>
						<span className="hidden text-gray-500 group-hover:text-blue-500 sm:inline">
							commits
						</span>
					</span>
				</div>
				{children}
			</div>
		</div>
	);
};
