import { useState, useEffect, useRef, memo, useCallback } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { listen } from "@tauri-apps/api/event";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark, vs } from 'react-syntax-highlighter/dist/cjs/styles/prism';
import "./App.css";

interface Tab {
    id: string;
    filePath: string;
    fileName: string;
    content: string;
}

// Memoized Markdown Component mit Theme-Support
const MarkdownTab = memo(({ content, isActive, isDarkMode }: { content: string; isActive: boolean; isDarkMode: boolean }) => {
    const codeComponent = useCallback((props: any) => {
        const { children, className, ...rest } = props;
        const match = /language-(\w+)/.exec(className || '');

        if (match) {
            return (
                <SyntaxHighlighter
                    {...rest}
                    PreTag="div"
                    language={match[1]}
                    style={isDarkMode ? oneDark : vs}
                    customStyle={{
                        margin: '1em 0',
                        borderRadius: '6px',
                        padding: '1rem'
                    }}
                >
                    {String(children).replace(/\n$/, '')}
                </SyntaxHighlighter>
            );
        }

        return (
            <code className={className} {...rest}>
                {children}
            </code>
        );
    }, [isDarkMode]);

    return (
        <article
            className={`markdown-body ${isActive ? 'active' : ''}`}
            style={{
                display: isActive ? 'block' : 'none',
            }}
        >
            <Markdown
                remarkPlugins={[remarkGfm]}
                components={{
                    code: codeComponent
                }}
            >
                {content}
            </Markdown>
        </article>
    );
}, (prevProps, nextProps) => {
    return prevProps.content === nextProps.content &&
        prevProps.isActive === nextProps.isActive &&
        prevProps.isDarkMode === nextProps.isDarkMode;
});

function App() {
    const [tabs, setTabs] = useState<Tab[]>([]);
    const [activeTabId, setActiveTabId] = useState<string | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [isDarkMode, setIsDarkMode] = useState(() => {
        const savedTheme = localStorage.getItem('theme');
        return savedTheme === 'dark';
    });
    const tabIdCounter = useRef(0);

    // Theme in localStorage speichern
    useEffect(() => {
        localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
        document.body.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
    }, [isDarkMode]);

    // openFileByPath mit useCallback, damit es immer den aktuellen State hat
    const openFileByPath = useCallback(async (filePath: string) => {
        console.log('Opening file:', filePath);

        try {
            const content = await readTextFile(filePath);
            const fileName = filePath.split('/').pop() || filePath.split('\\').pop() || filePath;

            setTabs(currentTabs => {
                // Prüfe ob Tab bereits existiert
                const existingTab = currentTabs.find(tab => tab.filePath === filePath);
                if (existingTab) {
                    setActiveTabId(existingTab.id);
                    return currentTabs;
                }

                // Neuen Tab erstellen
                tabIdCounter.current++;
                const newTab: Tab = {
                    id: `tab-${Date.now()}-${tabIdCounter.current}`,
                    filePath,
                    fileName,
                    content
                };

                setActiveTabId(newTab.id);
                return [...currentTabs, newTab];
            });

            console.log('File opened successfully:', fileName);
        } catch (error) {
            console.error('Fehler beim Öffnen der Datei:', error);
            console.error('Pfad:', filePath);
        }
    }, []);

    // CLI File Open Event Listener
    useEffect(() => {
        let unlistenCli: (() => void) | undefined;

        const setupCliListener = async () => {
            console.log('Setting up CLI listener...');
            unlistenCli = await listen<string>('cli-open-file', async (event) => {
                console.log('CLI event received:', event.payload);
                await openFileByPath(event.payload);
            });
            console.log('CLI listener ready');
        };

        setupCliListener();

        return () => {
            if (unlistenCli) unlistenCli();
        };
    }, [openFileByPath]);

    // Drag & Drop Event Listeners
    useEffect(() => {
        let unlistenEnter: (() => void) | undefined;
        let unlistenLeave: (() => void) | undefined;
        let unlistenDrop: (() => void) | undefined;

        const setupDropListener = async () => {
            unlistenEnter = await listen('tauri://drag-enter', () => {
                setIsDragging(true);
            });

            unlistenLeave = await listen('tauri://drag-leave', () => {
                setIsDragging(false);
            });

            unlistenDrop = await listen(
                'tauri://drag-drop',
                async (event) => {
                    setIsDragging(false);

                    let paths: string[] = [];
                    const payload = event.payload as any;

                    if (Array.isArray(payload)) {
                        paths = payload;
                    } else if (payload && payload.paths && Array.isArray(payload.paths)) {
                        paths = payload.paths;
                    } else if (typeof payload === 'string') {
                        paths = [payload];
                    }

                    const markdownFiles = paths.filter(path =>
                        path.endsWith('.md') || path.endsWith('.markdown') || path.endsWith('.txt')
                    );

                    if (markdownFiles.length === 0) return;

                    const loadedTabs = await Promise.all(
                        markdownFiles.map(async (filePath, index) => {
                            try {
                                const content = await readTextFile(filePath);
                                const fileName = filePath.split('/').pop() || filePath.split('\\').pop() || filePath;
                                tabIdCounter.current++;
                                return {
                                    id: `tab-${Date.now()}-${tabIdCounter.current}-${index}`,
                                    filePath,
                                    fileName,
                                    content
                                } as Tab;
                            } catch (error) {
                                console.error(`Fehler beim Öffnen von ${filePath}:`, error);
                                return null;
                            }
                        })
                    );

                    const validTabs = loadedTabs.filter(tab => tab !== null) as Tab[];

                    setTabs(currentTabs => {
                        const existingPaths = new Set(currentTabs.map(t => t.filePath));
                        const uniqueNewTabs = validTabs.filter(tab => !existingPaths.has(tab.filePath));

                        if (uniqueNewTabs.length === 0) {
                            const firstExisting = currentTabs.find(t =>
                                validTabs.some(vt => vt.filePath === t.filePath)
                            );
                            if (firstExisting) {
                                setActiveTabId(firstExisting.id);
                            }
                            return currentTabs;
                        }

                        setActiveTabId(uniqueNewTabs[0].id);
                        return [...currentTabs, ...uniqueNewTabs];
                    });
                }
            );
        };

        setupDropListener();

        return () => {
            if (unlistenEnter) unlistenEnter();
            if (unlistenLeave) unlistenLeave();
            if (unlistenDrop) unlistenDrop();
        };
    }, []);

    async function openMarkdownFile() {
        try {
            const selected = await open({
                multiple: false,
                filters: [{
                    name: 'Markdown',
                    extensions: ['md', 'markdown', 'txt']
                }]
            });

            if (selected) {
                await openFileByPath(selected);
            }
        } catch (error) {
            console.error('Fehler beim Öffnen der Datei:', error);
        }
    }

    function closeTab(tabId: string, event: React.MouseEvent) {
        event.stopPropagation();
        const newTabs = tabs.filter(tab => tab.id !== tabId);
        setTabs(newTabs);

        if (activeTabId === tabId) {
            if (newTabs.length > 0) {
                const closedIndex = tabs.findIndex(tab => tab.id === tabId);
                const newActiveTab = newTabs[Math.max(0, closedIndex - 1)];
                setActiveTabId(newActiveTab.id);
            } else {
                setActiveTabId(null);
            }
        }
    }

    return (
        <div className={`app ${isDragging ? 'dragging' : ''}`}>
            <header className="header">
                <h1 className="title">Markdown Reader</h1>
                <div className="header-actions">
                    <button
                        onClick={() => setIsDarkMode(!isDarkMode)}
                        className="btn-theme"
                        aria-label="Theme wechseln"
                    >
                        {isDarkMode ? '☀️' : '🌙'}
                    </button>
                    <button onClick={openMarkdownFile} className="btn-primary">
                        📄 Datei öffnen
                    </button>
                </div>
            </header>

            {tabs.length > 0 && (
                <div className="tabs-container">
                    <div className="tabs-list">
                        {tabs.map(tab => (
                            <div
                                key={tab.id}
                                className={`tab ${activeTabId === tab.id ? 'active' : ''}`}
                                onClick={() => setActiveTabId(tab.id)}
                            >
                                <span className="tab-name">{tab.fileName}</span>
                                <button
                                    className="tab-close"
                                    onClick={(e) => closeTab(tab.id, e)}
                                    aria-label="Tab schließen"
                                >
                                    ✕
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <main className="content">
                {tabs.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-state-content">
                            <h2>Keine Datei geöffnet</h2>
                            <p>Öffne eine Markdown-Datei oder ziehe sie ins Fenster</p>
                            <button onClick={openMarkdownFile} className="btn-primary">
                                📄 Datei öffnen
                            </button>
                        </div>
                    </div>
                ) : (
                    <>
                        {tabs.map(tab => (
                            <MarkdownTab
                                key={tab.id}
                                content={tab.content}
                                isActive={activeTabId === tab.id}
                                isDarkMode={isDarkMode}
                            />
                        ))}
                    </>
                )}

                {isDragging && (
                    <div className="drop-overlay">
                        <div className="drop-overlay-content">
                            <div className="drop-icon">📄</div>
                            <p>Dateien hier ablegen</p>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}

export default App;
