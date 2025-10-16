import {useState, useEffect, useRef, memo, useCallback} from "react";
import {flushSync} from "react-dom";
import {open} from "@tauri-apps/plugin-dialog";
import {readTextFile} from "@tauri-apps/plugin-fs";
import {listen} from "@tauri-apps/api/event";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {Prism as SyntaxHighlighter} from 'react-syntax-highlighter';
import {oneDark, vs} from 'react-syntax-highlighter/dist/cjs/styles/prism';
import "./App.css";

interface Tab {
    id: string;
    filePath: string;
    fileName: string;
    content: string;
}

const MarkdownTab = memo(({content, isActive, isDarkMode}: {
    content: string;
    isActive: boolean;
    isDarkMode: boolean
}) => {
    const codeComponent = useCallback((props: any) => {
        const {children, className, ...rest} = props;
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

    useEffect(() => {
        localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
        document.body.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
    }, [isDarkMode]);

    // NEUE LÖSUNG: Verwende flushSync für synchrones State Update
    const openFileByPath = useCallback(async (filePath: string) => {
        try {
            const content = await readTextFile(filePath);
            const fileName = filePath.split('/').pop() || filePath.split('\\').pop() || filePath;

            // Prüfe ob Tab bereits existiert
            const existingTab = tabs.find(tab => tab.filePath === filePath);
            if (existingTab) {
                setActiveTabId(existingTab.id);
                return;
            }

            // Neuen Tab erstellen
            tabIdCounter.current++;
            const newTabId = `tab-${Date.now()}-${tabIdCounter.current}`;
            const newTab: Tab = {
                id: newTabId,
                filePath,
                fileName,
                content
            };

            // Verwende flushSync um sicherzustellen dass der Tab gerendert wird
            flushSync(() => {
                setTabs(prev => [...prev, newTab]);
            });

            // Jetzt ist der Tab garantiert im DOM
            setActiveTabId(newTabId);
        } catch (error) {
            console.error('Fehler beim Öffnen der Datei:', error);
            console.error('Pfad:', filePath);
        }
    }, [tabs]);

    useEffect(() => {
        let unlistenCli: (() => void) | undefined;

        const setupCliListener = async () => {
            unlistenCli = await listen<string>('cli-open-file', async (event) => {
                await openFileByPath(event.payload);
            });
        };

        setupCliListener();

        return () => {
            if (unlistenCli) unlistenCli();
        };
    }, [openFileByPath]);

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

                    for (const filePath of markdownFiles) {
                        await openFileByPath(filePath);
                    }
                }
            );
        };

        setupDropListener();

        return () => {
            if (unlistenEnter) unlistenEnter();
            if (unlistenLeave) unlistenLeave();
            if (unlistenDrop) unlistenDrop();
        };
    }, [openFileByPath]);

    useEffect(() => {
        const onDragOver = (e: DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
        };
        const onDrop = (e: DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
        };
        const onDragEnter = (e: DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
        };
        const onDragLeave = (e: DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
        };

        document.addEventListener('dragover', onDragOver, {passive: false});
        document.addEventListener('drop', onDrop, {passive: false});
        document.addEventListener('dragenter', onDragEnter, {passive: false});
        document.addEventListener('dragleave', onDragLeave, {passive: false});

        window.addEventListener('dragover', onDragOver, {passive: false});
        window.addEventListener('drop', onDrop, {passive: false});
        window.addEventListener('dragenter', onDragEnter, {passive: false});
        window.addEventListener('dragleave', onDragLeave, {passive: false});

        return () => {
            document.removeEventListener('dragover', onDragOver);
            document.removeEventListener('drop', onDrop);
            document.removeEventListener('dragenter', onDragEnter);
            document.removeEventListener('dragleave', onDragLeave);
            window.removeEventListener('dragover', onDragOver);
            window.removeEventListener('drop', onDrop);
            window.removeEventListener('dragenter', onDragEnter);
            window.removeEventListener('dragleave', onDragLeave);
        };
    }, []);

    const goToNextTab = useCallback(() => {
        if (tabs.length === 0) return;
        const currentIndex = tabs.findIndex(tab => tab.id === activeTabId);
        const nextIndex = (currentIndex + 1) % tabs.length;
        setActiveTabId(tabs[nextIndex].id);
    }, [tabs, activeTabId]);

    const goToPrevTab = useCallback(() => {
        if (tabs.length === 0) return;
        const currentIndex = tabs.findIndex(tab => tab.id === activeTabId);
        const prevIndex = currentIndex <= 0 ? tabs.length - 1 : currentIndex - 1;
        setActiveTabId(tabs[prevIndex].id);
    }, [tabs, activeTabId]);

    const closeActiveTab = useCallback(() => {
        if (!activeTabId) return;
        const newTabs = tabs.filter(tab => tab.id !== activeTabId);
        setTabs(newTabs);

        if (newTabs.length > 0) {
            const closedIndex = tabs.findIndex(tab => tab.id === activeTabId);
            const newActiveTab = newTabs[Math.max(0, closedIndex - 1)];
            setActiveTabId(newActiveTab.id);
        } else {
            setActiveTabId(null);
        }
    }, [tabs, activeTabId]);

    const toggleTheme = useCallback(() => {
        setIsDarkMode(prev => !prev);
    }, []);

    useEffect(() => {
        function handleKeyDown(e: KeyboardEvent) {
            const modifier = e.ctrlKey || e.metaKey;

            if (modifier && e.key === 'Tab' && !e.shiftKey) {
                e.preventDefault();
                goToNextTab();
            }

            if (modifier && e.shiftKey && e.key === 'Tab') {
                e.preventDefault();
                goToPrevTab();
            }

            if (modifier && e.key === 'w') {
                e.preventDefault();
                closeActiveTab();
            }

            if (modifier && e.key === 'o') {
                e.preventDefault();
                openMarkdownFile();
            }

            if (modifier && e.key === 't') {
                e.preventDefault();
                toggleTheme();
            }

            if (modifier && e.key >= '1' && e.key <= '9') {
                e.preventDefault();
                const tabIndex = parseInt(e.key) - 1;
                if (tabs[tabIndex]) {
                    setActiveTabId(tabs[tabIndex].id);
                }
            }
        }

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [goToNextTab, goToPrevTab, closeActiveTab, toggleTheme, tabs]);

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
        <div
            className={`app ${isDragging ? 'dragging' : ''}`}
            onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
            }}
            onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
            }}
            onDragEnter={(e) => {
                e.preventDefault();
                e.stopPropagation();
            }}
            onDragLeave={(e) => {
                e.preventDefault();
                e.stopPropagation();
            }}
        >
            <header className="header">
                <h1 className="title">Viewdown</h1>
                <div className="header-actions">
                    <button
                        onClick={toggleTheme}
                        className="btn-theme"
                        aria-label="Theme wechseln (Ctrl+T)"
                        title="Toggle Theme (Ctrl+T)"
                    >
                        {isDarkMode ? '☀️' : '🌙'}
                    </button>
                    <button
                        onClick={openMarkdownFile}
                        className="btn-primary"
                        title="Datei öffnen (Ctrl+O)"
                    >
                        Datei öffnen
                    </button>
                </div>
            </header>

            {tabs.length > 0 && (
                <div className="tabs-container">
                    <div className="tabs-list">
                        {tabs.map((tab, index) => (
                            <div
                                key={tab.id}
                                className={`tab ${activeTabId === tab.id ? 'active' : ''}`}
                                onClick={() => setActiveTabId(tab.id)}
                                title={`${tab.fileName} (Ctrl+${index + 1})`}
                            >
                                <span className="tab-name">{tab.fileName}</span>
                                <button
                                    className="tab-close"
                                    onClick={(e) => closeTab(tab.id, e)}
                                    aria-label="Tab schließen"
                                    title="Close (Ctrl+W)"
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
                                Datei öffnen
                            </button>
                            <div className="shortcuts-hint">
                                <p style={{fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '2rem'}}>
                                    <strong>Shortcuts:</strong><br/>
                                    Ctrl+O: Datei öffnen | Ctrl+W: Tab schließen<br/>
                                    Ctrl+Tab: Nächster Tab | Ctrl+T: Theme wechseln<br/>
                                    Ctrl+1-9: Tab direkt wechseln
                                </p>
                            </div>
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
