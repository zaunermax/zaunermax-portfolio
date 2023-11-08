import { MouseEventHandler, PropsWithChildren } from 'react';
import { cn } from '@/lib/utils';

export type TerminalLineProps = PropsWithChildren & {
	onClick?: MouseEventHandler;
	hasCursor?: boolean;
	className?: string;
};

export const TerminalOutput = ({
	children,
	onClick,
	hasCursor,
	className,
}: TerminalLineProps) => {
	return (
		<div
			className={cn('font-mono text-xs', hasCursor && 'type', className)}
			onClick={onClick}
		>
			<span style={{ color: '#15b40c' }}>guest@max-portfolio</span>:
			<span style={{ color: '#2f5cc0' }}>~ $</span> {children}
		</div>
	);
};
