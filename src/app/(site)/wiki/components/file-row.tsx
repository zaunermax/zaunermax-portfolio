import { LucideIcon } from 'lucide-react';

export type FileRowProps = {
	fileName: string;
	commitMsg: string;
	commitTimestamp: string;
	icon: LucideIcon;
};

export const FileRow = ({
	fileName,
	commitTimestamp,
	commitMsg,
	icon: Icon,
}: FileRowProps) => {
	return (
		<div className="flex items-center border-t-[1px] border-t-white border-opacity-10 px-3 py-2 text-xs hover:cursor-pointer hover:bg-wiki-header">
			<Icon className="mr-4 h-4 w-4" />
			<div className="flex-auto">{fileName}</div>
			<div className="flex-auto text-gray-500">{commitMsg}</div>
			<div className="text-right text-gray-500">{commitTimestamp}</div>
		</div>
	);
};
