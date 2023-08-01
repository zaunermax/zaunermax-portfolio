import Image from 'next/image';
import image from './assets/pp.jpg';
import Link from 'next/link';

export const OwnAvatar = () => {
	return (
		<Link
			href="/"
			className="relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full"
		>
			<Image
				className="flex h-full w-full items-center justify-center rounded-full bg-muted"
				src={image}
				alt="Profile avatar image of Max Zauner - Link to main page"
			/>
		</Link>
	);
};
