import React, { memo } from 'react';
import { formatDistanceToNow, parse } from 'date-fns';

export type TimeAgoProps = {
	dateString: string;
};

export const TimeAgo = memo(({ dateString }: TimeAgoProps) => {
	const date = parse(dateString, 'dd.MM.yyyy', new Date());
	const timeAgo = formatDistanceToNow(date, { addSuffix: true });

	return <div>{timeAgo}</div>;
});

TimeAgo.displayName = 'TimeAgo';
