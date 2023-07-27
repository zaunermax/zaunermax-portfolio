import {
	PropsWithChildren,
	EventHandler,
	SyntheticEvent,
	MouseEventHandler,
} from 'react';

type Props = PropsWithChildren & {
	title: string;
	onClick?: MouseEventHandler;
};

export const VisualTerminal = ({ children, title, onClick }: Props) => {
	return (
		<div className="pt-5" onClick={onClick}>
			<div className="mt-15 mx-auto w-full max-w-3xl rounded-lg bg-black p-6 text-white shadow-md">
				<div className="flex items-center justify-between">
					<div className="flex items-center space-x-2 text-xs">
						<div className="h-3 w-3 rounded-full bg-red-500"></div>
						<div className="h-3 w-3 rounded-full bg-yellow-500"></div>
						<div className="h-3 w-3 rounded-full bg-green-500"></div>
					</div>
					<span className="font-mono text-sm">{title}</span>
				</div>
				<div className="mt-4 space-y-2">{children}</div>
			</div>
		</div>
	);
};

type TerminalLineProps = PropsWithChildren & {
	onClick?: MouseEventHandler;
};

export const TerminalLine = ({ children, onClick }: TerminalLineProps) => {
	return (
		<div className="font-mono text-xs" onClick={onClick}>
			<span style={{ color: 'green' }}>guest@max-portfolio</span>:
			<span style={{ color: 'blue' }}>~ $</span> {children}
		</div>
	);
};

export const BlankTerminalLine = () => <div className="opacity-0">_</div>;
