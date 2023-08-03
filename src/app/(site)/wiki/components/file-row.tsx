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
		<div className="flex items-center border-t-[1px] border-t-white border-opacity-10 px-3 py-2 text-xs hover:cursor-pointer hover:bg-wiki-header">
			<Icon className="mr-4 h-4 w-4" />
			<div className="w-100 flex-auto basis-1/6">{filename}</div>
			<div className="w-100 hidden flex-auto basis-1/3 text-gray-500 sm:block">
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
