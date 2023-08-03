import { getCVUrl } from '@/lib/get-person';
import { File } from 'lucide-react';
import { FileRowLink } from './components/file-row';
import { FileList } from './components/file-list';

export const revalidate = 300;

const Page = async () => {
	const { fileUrl } = await getCVUrl();

	return (
		<div className="mt-20 md:mt-28">
			<FileList>
				<FileRowLink
					linkProps={{
						href: fileUrl,
						target: '_blank',
						rel: 'noopener noreferrer',
					}}
					icon={File}
					fileName={'CV.pdf'}
					commitMsg={'feat(📝): removed phone from public CV'}
					commitTimestamp={'yesterday'}
				/>
			</FileList>
		</div>
	);
};

export default Page;
