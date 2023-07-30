import { PropsWithChildren } from 'react';

type MultiplyChildrenProps = PropsWithChildren<{
	times: number;
}>;

export const MultiplyChildren = ({ times, children }: MultiplyChildrenProps) => {
	return Array.from({ length: times }).map(() => children);
};
