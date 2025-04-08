'use client';

import React, { memo, useEffect, useState } from 'react';
import { formatDistanceToNow, parse } from 'date-fns';

export type TimeAgoProps = {
	dateString: string;
};

export const TimeAgo = ({ dateString }: TimeAgoProps) => {
	const [timeAgo, setTimeAgo] = useState<string>('');

	useEffect(() => {
		const updateTimeAgo = () => {
			const date = parse(dateString, 'dd.MM.yyyy', new Date());
			const newTimeAgo = formatDistanceToNow(date, { addSuffix: true });
			setTimeAgo(newTimeAgo);
		};

		updateTimeAgo();
	}, [dateString]);

	return <div>{timeAgo}</div>;
};
