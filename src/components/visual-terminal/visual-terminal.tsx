import { PropsWithChildren, MouseEventHandler } from 'react';

type Props = PropsWithChildren & {
	title: string;
	onClick?: MouseEventHandler;
};

export const VisualTerminal = ({ children, title, onClick }: Props) => {
	return (
		<div className="pt-5" onClick={onClick}>
			<div className="mt-15 mx-auto w-full max-w-3xl rounded-lg bg-terminal-body pb-4 text-white shadow-md">
				<div className="flex items-center justify-between rounded-t-lg bg-terminal-header p-2">
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
};
