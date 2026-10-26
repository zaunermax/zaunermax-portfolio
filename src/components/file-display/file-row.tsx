import { LucideIcon } from 'lucide-react';
import Link, { LinkProps } from 'next/link';
import { ReactNode } from 'react';

type BaseFileRowProps = {
	filename: ReactNode;
	relativeTimeAgo: ReactNode;
	icon: LucideIcon;
};

export type FileRowProps = BaseFileRowProps & {
	commitMsg: string;
};

export const FileRow = ({
	filename,
	relativeTimeAgo,
	commitMsg,
	icon: Icon,
}: FileRowProps) => {
	return (
		<div className="hover:bg-wiki-header-light hover:dark:bg-wiki-header flex items-center border-t-[1px] border-black/15 px-3 py-3 text-xs hover:cursor-pointer dark:border-t-white/10">
			<Icon className="mr-4 h-4 w-4" />
			<div className="flex-auto basis-1/5 hover:cursor-pointer hover:text-blue-500 hover:underline">
				{filename}
			</div>
			<div className="hidden flex-auto basis-1/6 text-gray-500 hover:cursor-pointer hover:text-blue-500 hover:underline sm:block">
				{commitMsg}
			</div>
			<div className="basis-auto flex-nowrap text-right text-gray-500 sm:basis-1/6">
				{relativeTimeAgo}
			</div>
		</div>
	);
};

export type FileRowCompactProps = BaseFileRowProps;

export const FileRowCompact = ({
	filename,
	relativeTimeAgo,
	icon: Icon,
}: FileRowCompactProps) => {
	return (
		<div className="hover:bg-wiki-header-light hover:dark:bg-wiki-header flex items-center border-t-[1px] border-black/15 px-3 py-3 text-xs hover:cursor-pointer dark:border-t-white/10">
			<Icon className="mr-4 h-4 w-4" />
			<div className="flex-auto basis-1/3 hover:cursor-pointer hover:text-blue-500 hover:underline">
				{filename}
			</div>
			<div className="basis-auto flex-nowrap text-right text-gray-500 sm:basis-1/3">
				{relativeTimeAgo}
			</div>
		</div>
	);
};

type CustomLinkProps = LinkProps & {
	target?: HTMLAnchorElement['target'];
	rel?: HTMLAnchorElement['rel'];
};

export type FileRowLinkProps =
	| ({ mode: 'compact'; linkProps: CustomLinkProps } & FileRowCompactProps)
	| ({ mode?: 'default'; linkProps: CustomLinkProps } & FileRowProps);

export const FileRowLink = (props: FileRowLinkProps) => {
	return (
		<Link {...props.linkProps}>
			{props.mode === 'compact' ? <FileRowCompact {...props} /> : <FileRow {...props} />}
		</Link>
	);
};
