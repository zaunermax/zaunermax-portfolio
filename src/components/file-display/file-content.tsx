import { File } from 'lucide-react';
import { PropsWithChildren } from 'react';

export type FileContentProps = PropsWithChildren<{
	filename: string;
	commitMsg: string;
}>;

export const FileContent = ({ children, filename, commitMsg }: FileContentProps) => {
	return (
		<div className="m-auto mt-4 flex max-w-screen-md flex-col space-y-2">
			<div className="mt-15 mx-auto w-full overflow-hidden rounded-lg border-[1px] border-opacity-15 border-black bg-wiki-body-light dark:border-white dark:border-opacity-20 dark:bg-wiki-body dark:text-white">
				<div className="flex items-center rounded-t-lg px-3 py-4 dark:bg-wiki-body">
					<div className="relative h-4 w-4 flex-shrink-0">
						<File className="h-4 w-4" />
					</div>
					<div className="mx-2 flex-1 text-xs">{filename}</div>
					<span className="group mr-2 inline text-xs hover:cursor-pointer hover:text-blue-500 hover:underline sm:hidden">
						{commitMsg}
					</span>
				</div>
				<div className="border-t-black border-t-[1px] border-opacity-15 px-6 py-3 text-xs dark:border-t-white dark:border-opacity-10">
					{children}
				</div>
			</div>
		</div>
	);
};
