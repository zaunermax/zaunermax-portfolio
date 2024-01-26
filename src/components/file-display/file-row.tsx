import { LucideIcon } from 'lucide-react';
import Link, { LinkProps } from 'next/link';

export type FileRowProps = {
	filename: string;
	commitMsg: string;
	relativeTimeAgo: string;
	icon: LucideIcon;
};

export const FileRow = ({
	filename,
	relativeTimeAgo,
	commitMsg,
	icon: Icon,
}: FileRowProps) => {
	return (
		<div className="flex items-center border-t-[1px] border-black border-opacity-15 px-3 py-3 text-xs hover:cursor-pointer hover:bg-wiki-header-light dark:border-t-white dark:border-opacity-10 hover:dark:bg-wiki-header">
			<Icon className="mr-4 h-4 w-4" />
			<div className="w-100 flex-auto basis-1/5 hover:cursor-pointer hover:text-blue-500 hover:underline">
				{filename}
			</div>
			<div className="w-100 hidden flex-auto basis-1/6 text-gray-500 hover:cursor-pointer hover:text-blue-500 hover:underline sm:block">
				{commitMsg}
			</div>
			<div className="basis-auto flex-nowrap text-right text-gray-500 sm:basis-1/6">
				{relativeTimeAgo}
			</div>
		</div>
	);
};

export type FileRowLinkProps = FileRowProps & {
	linkProps: LinkProps & {
		target?: HTMLAnchorElement['target'];
		rel?: HTMLAnchorElement['rel'];
	};
};

export const FileRowLink = ({ linkProps, ...rest }: FileRowLinkProps) => {
	return (
		<Link {...linkProps}>
			<FileRow {...rest} />
		</Link>
	);
};
