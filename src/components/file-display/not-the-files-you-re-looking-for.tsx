import { FileContent } from '@/app/(site)/wiki/[slug]/components/file-content';
import Image from 'next/image';
import image from './assets/not-the-files-you-re-looking-for.jpg';

export type NotTheFilesYouReLookingForProps = {
	filename: string;
};

export const NotTheFilesYouReLookingFor = ({
	filename,
}: NotTheFilesYouReLookingForProps) => {
	return (
		<FileContent filename={filename.slice(0, 20)} commitMsg={'fix(🗃️): what??'}>
			<Image
				src={image}
				alt={
					'Obi-Wan Kenobi mind tricking storm troopers with "these are not the files you\'re looking for'
				}
			/>
		</FileContent>
	);
};
