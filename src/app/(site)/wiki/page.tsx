import { getCVUrl } from '@/lib/get-person';
import { Button } from '@/components/ui/button';
import { File } from 'lucide-react';
import { MultiplyChildren } from '@/components/multiply-children';
import { FileRow } from './components/file-row';
import { FileList } from './components/file-list';

export const revalidate = 300;

const DownloadCVButton = async () => {
	const { fileUrl } = await getCVUrl();

	return (
		<Button asChild className="mx-auto" size="lg">
			<a href={fileUrl} target="_blank" rel="noopener noreferrer">
				Download CV
			</a>
		</Button>
	);
};

const Page = async () => {
	return (
		<div className="mt-20 md:mt-28">
			<FileList>
				<MultiplyChildren times={10}>
					<FileRow
						icon={File}
						fileName={'README.md'}
						commitMsg={'feat(📄): updated readme'}
						commitTimestamp={'yesterday'}
					/>
				</MultiplyChildren>
			</FileList>
		</div>
	);
};

export default Page;
