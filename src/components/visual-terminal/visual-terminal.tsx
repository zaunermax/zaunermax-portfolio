import { PropsWithChildren, MouseEventHandler, memo } from 'react';

type Props = PropsWithChildren & {
	title: string;
	onClick?: MouseEventHandler;
	className?: string;
};

export const VisualTerminal = memo(({ children, title, onClick, className }: Props) => {
	return (
		<div className={className} onClick={onClick}>
			<div className="mx-auto w-full max-w-3xl rounded-lg border-[1px] border-black border-opacity-20 bg-terminal-body-light pb-4 text-black shadow-md dark:border-white dark:border-opacity-20 dark:bg-terminal-body dark:text-white">
				<div className="flex items-center justify-between rounded-t-lg border-b-[1px] border-b-black border-opacity-5 bg-terminal-header-light p-2 dark:border-0 dark:bg-terminal-header">
					<div className="flex items-center space-x-2 text-xs">
						<div className="h-3 w-3 rounded-full bg-red-500"></div>
						<div className="h-3 w-3 rounded-full bg-yellow-500"></div>
						<div className="h-3 w-3 rounded-full bg-green-500"></div>
					</div>
					<span className="font-mono text-sm">{title}</span>
				</div>
				<div className="space-y-1.5 p-1 px-2">{children}</div>
			</div>
		</div>
	);
});

VisualTerminal.displayName = 'VisualTerminal';
