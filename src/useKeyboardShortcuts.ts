import {useEffect} from "react";

interface ShortcutHandlers {
    onNextTab?: () => void;
    onPreviousTab?: () => void;
    onCloseTab?: () => void;
    onOpenFile?: () => void;
    onToggleTheme?: () => void;
    onSearch?: () => void;
}

export function useKeyboardShortcuts(handlers: ShortcutHandlers) {
    useEffect(() => {
        function handleKeyDown(e: KeyboardEvent) {
            // Ctrl/Cmd abhängig vom OS
            const modifier = e.ctrlKey || e.metaKey;

            // Ctrl+Tab: Next tab
            if (modifier && e.key === 'Tab' && !e.shiftKey) {
                e.preventDefault();
                handlers.onNextTab?.();
            }

            // Ctrl+Shift+Tab: Previous tab
            if (modifier && e.shiftKey && e.key === 'Tab') {
                e.preventDefault();
                handlers.onPreviousTab?.();
            }

            // Ctrl+W: Close tab
            if (modifier && e.key === 'w') {
                e.preventDefault();
                handlers.onCloseTab?.();
            }

            // Ctrl+O: Open file
            if (modifier && e.key === 'o') {
                e.preventDefault();
                handlers.onOpenFile?.();
            }

            // Ctrl+T: Toggle theme
            if (modifier && e.key === 't') {
                e.preventDefault();
                handlers.onToggleTheme?.();
            }

            // Ctrl+F: Search
            if (modifier && e.key === 'f') {
                e.preventDefault();
                handlers.onSearch?.();
            }
        }

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handlers]);
}