import { File } from 'lucide-react';
import { PropsWithChildren } from 'react';

export type FileContentProps = PropsWithChildren<{
	filename: string;
	commitMsg: string;
}>;

export const FileContent = ({ children, filename, commitMsg }: FileContentProps) => {
	return (
		<div className="m-auto mt-4 flex max-w-screen-md flex-col space-y-2">
			<div className="mt-15 mx-auto w-full overflow-hidden rounded-lg border-[1px] border-white border-opacity-20 bg-wiki-body text-white shadow-md">
				<div className="flex items-center rounded-t-lg bg-wiki-body px-3 py-4">
					<div className="relative h-4 w-4 flex-shrink-0">
						<File className="h-4 w-4" />
					</div>
					<div className="mx-2 flex-1 text-xs">{filename}</div>
					<span className="group mr-2 inline text-xs hover:cursor-pointer hover:text-blue-500 hover:underline sm:hidden">
						{commitMsg}
					</span>
				</div>
				<div className="border-t-[1px] border-t-white border-opacity-10 px-6 py-3 text-xs">
					{children}
				</div>
			</div>
		</div>
	);
};
