import { useCallback, useRef } from 'react';

export const useFocusableInputRef = () => {
	const inputRef = useRef<HTMLInputElement>(null);

	const handleInputFocus = useCallback(() => {
		const ref = inputRef.current;

		if (!ref) return;

		const length = ref.value.length;

		ref.focus();
		ref.setSelectionRange(length, length);
	}, []);

	return {
		inputRef,
		handleInputFocus,
	};
};
