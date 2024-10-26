import { NotTheFilesYouReLookingFor } from '@/components/file-display';
import { getWikiPageContent } from '@/lib/sanity/get-wiki-content';
import { FileContent } from '@/components/file-display';
import { CustomPortableText } from '@/components/custom-portable-text';

const Page = async (props: { params: Promise<{ slug: string }> }) => {
	const params = await props.params;
	const res = await getWikiPageContent(params.slug);

	if (!res) return <NotTheFilesYouReLookingFor filename={params.slug} />;

	const { content, ...rest } = res;

	return (
		<FileContent {...rest}>
			<CustomPortableText value={content} />
		</FileContent>
	);
};

export default Page;
