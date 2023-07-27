'use client';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import * as z from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormMessage,
} from '@/components/ui/form';
import { useCallback } from 'react';
import { useRouter } from 'next/navigation';

const formSchema = z.object({
	question: z
		.string()
		.min(10, 'The question must be at least 10 characters long')
		.max(100, 'The question cannot be longer than 100 characters'),
});

export const QuestionFormLink = () => {
	const router = useRouter();
	const form = useForm<z.infer<typeof formSchema>>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			question: '',
		},
	});

	const onSubmit = useCallback(
		(values: z.infer<typeof formSchema>) => {
			const urlParams = new URLSearchParams();

			urlParams.append('q', values.question);

			router.push(`/main/query?${urlParams.toString()}`);
		},
		[router],
	);

	return (
		<Form {...form}>
			<form onSubmit={form.handleSubmit(onSubmit)}>
				<FormField
					control={form.control}
					render={({ field }) => (
						<FormItem>
							<span className="flex space-x-2">
								<FormControl>
									<Input
										type="text"
										placeholder="Ask a question about Max..."
										{...field}
									/>
								</FormControl>
								<Button variant="secondary" type="submit">
									Ask
								</Button>
							</span>
							<FormMessage />
						</FormItem>
					)}
					name={'question'}
				/>
			</form>
		</Form>
	);
};
