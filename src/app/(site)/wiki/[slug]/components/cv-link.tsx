import { getCVUrl } from '@/lib/get-person';
import { FileRowLink } from '@/app/(site)/wiki/[slug]/components/file-row';
import { File } from 'lucide-react';

export const CvLink = async () => {
	const { fileUrl } = await getCVUrl();

	return (
		<FileRowLink
			linkProps={{
				href: fileUrl,
				target: '_blank',
				rel: 'noopener noreferrer',
			}}
			icon={File}
			filename={'CV.pdf'}
			commitMsg={'fix(📝): removed phone from public CV'}
			relativeTimeAgo={'yesterday'}
		/>
	);
};

export const LoadingCvLink = () => (
	<FileRowLink
		linkProps={{ href: `/` }}
		icon={File}
		filename={'...'}
		relativeTimeAgo={'...'}
		commitMsg={'...'}
	/>
);
