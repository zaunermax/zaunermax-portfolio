'use client';

import { useEffect } from 'react';
import { VisualTerminal } from '@/components/visual-terminal';
import { HelpSection } from './help-section';
import { AnswersSection } from './answers-section';
import { QuestionCommandSection } from './question-command-section';
import { useFocusableInputRef } from '../hooks';

const modelName = 'max-q-learning-16k-0623';

export const QuestionSection = () => {
	const { inputRef, handleInputFocus } = useFocusableInputRef();

	useEffect(() => {
		handleInputFocus();
	}, [handleInputFocus]);

	return (
		<div className="m-auto mb-16 flex max-w-screen-lg flex-col space-y-2">
			<VisualTerminal
				title={modelName}
				onClick={handleInputFocus}
				className="drop-shadow-2xl"
			>
				<HelpSection modelName={modelName} />
				<AnswersSection />
				<QuestionCommandSection ref={inputRef} handleInputFocus={handleInputFocus} />
			</VisualTerminal>
		</div>
	);
};
