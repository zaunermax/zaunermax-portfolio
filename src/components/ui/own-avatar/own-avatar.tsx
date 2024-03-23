import Image from 'next/image';
import image from './assets/pp.jpg';
import Link from 'next/link';
import { cn } from '@/lib/utils';

export type OwnAvatarProps = {
	className?: string;
	link?: string;
};

export const OwnAvatar = ({ className, link }: OwnAvatarProps) => {
	return (
		<Link
			href={link ?? '/'}
			className={cn(
				'relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full',
				className,
			)}
			rel="noopener noreferrer"
			prefetch={false}
		>
			<Image
				className="flex h-full w-full items-center justify-center rounded-full bg-muted"
				src={image}
				alt="Profile avatar image of Max Zauner - Link to main page"
				priority
			/>
		</Link>
	);
};
