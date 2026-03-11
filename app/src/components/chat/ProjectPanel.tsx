import React, { useEffect, useMemo, useRef, useState } from 'react';
import hljs from 'highlight.js';
import {
  ChevronDownIcon,
  ChevronIcon,
  CloseIcon,
  FileReadIcon,
  FolderIcon,
  ListManageIcon,
  PanelLeftIcon,
  RefreshIcon,
  StopIcon,
  TrashIcon,
} from '@/components/icons';
import { useT } from '@/i18n';
import type { ManagedProcessInfo } from '@/types';
import './ProjectPanel.less';

type ProjectViewMode = 'working' | 'baseline' | 'diff';
const CLOSE_ANIMATION_MS = 180;

interface ProjectTreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: ProjectTreeNode[];
}

interface ProjectFileSnapshot {
  relativePath: string;
  language: string;
  isText: boolean;
  workingExists: boolean;
  baselineExists: boolean;
  workingContent: string | null;
  baselineContent: string | null;
}

interface ProjectChangedFile {
  path: string;
  changeType: 'added' | 'removed' | 'modified';
}

interface ProjectPanelProps {
  conversationId: string;
  open: boolean;
  refreshToken: number;
  width: number;
  onClose: () => void;
  onChangedFilesCountChange?: (count: number) => void;
}

interface CodeLine {
  lineNumber: number;
  html: string;
}

interface DiffRow {
  left?: CodeLine;
  right?: CodeLine;
  type: 'equal' | 'added' | 'removed' | 'changed';
}

function formatDateTime(timestamp?: number): string {
  if (!timestamp) {
    return '--';
  }

  return new Date(timestamp).toLocaleString();
}

function normalizeCodeLines(content: string | null, language: string): CodeLine[] {
  if (content == null) {
    return [];
  }

  return content.replace(/\r\n/g, '\n').split('\n').map((line, index) => {
    const safeLine = line || ' ';
    const html = language && hljs.getLanguage(language)
      ? hljs.highlight(safeLine, { language }).value
      : hljs.highlightAuto(safeLine).value;

    return {
      lineNumber: index + 1,
      html: html || '&nbsp;',
    };
  });
}

function buildDiffRows(leftLines: CodeLine[], rightLines: CodeLine[]): DiffRow[] {
  const lineProduct = leftLines.length * rightLines.length;
  if (lineProduct > 200000) {
    const rows: DiffRow[] = [];
    const maxLen = Math.max(leftLines.length, rightLines.length);
    for (let index = 0; index < maxLen; index += 1) {
      const left = leftLines[index];
      const right = rightLines[index];
      if (!left && right) {
        rows.push({ right, type: 'added' });
      } else if (left && !right) {
        rows.push({ left, type: 'removed' });
      } else if (left?.html !== right?.html) {
        rows.push({ left, right, type: 'changed' });
      } else {
        rows.push({ left, right, type: 'equal' });
      }
    }
    return rows;
  }

  const dp = Array.from({ length: leftLines.length + 1 }, () =>
    Array.from<number>({ length: rightLines.length + 1 }).fill(0)
  );

  for (let i = leftLines.length - 1; i >= 0; i -= 1) {
    for (let j = rightLines.length - 1; j >= 0; j -= 1) {
      if (leftLines[i].html === rightLines[j].html) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const rows: DiffRow[] = [];
  let i = 0;
  let j = 0;

  while (i < leftLines.length && j < rightLines.length) {
    if (leftLines[i].html === rightLines[j].html) {
      rows.push({ left: leftLines[i], right: rightLines[j], type: 'equal' });
      i += 1;
      j += 1;
      continue;
    }

    if (dp[i + 1][j] === dp[i][j + 1]) {
      rows.push({ left: leftLines[i], right: rightLines[j], type: 'changed' });
      i += 1;
      j += 1;
      continue;
    }

    if (dp[i + 1][j] > dp[i][j + 1]) {
      rows.push({ left: leftLines[i], type: 'removed' });
      i += 1;
    } else {
      rows.push({ right: rightLines[j], type: 'added' });
      j += 1;
    }
  }

  while (i < leftLines.length) {
    rows.push({ left: leftLines[i], type: 'removed' });
    i += 1;
  }

  while (j < rightLines.length) {
    rows.push({ right: rightLines[j], type: 'added' });
    j += 1;
  }

  return rows;
}

function renderTreeNode(
  node: ProjectTreeNode,
  expanded: Set<string>,
  selectedPath: string | null,
  onToggleDir: (path: string) => void,
  onSelectFile: (path: string) => void,
  depth = 0
): React.ReactNode {
  const isDirectory = node.type === 'directory';
  const isExpanded = expanded.has(node.path);
  const isSelected = selectedPath === node.path;

  return (
    <div key={node.path} className="project-tree-node">
      <button
        type="button"
        className={`project-tree-row ${isSelected ? 'is-selected' : ''}`}
        style={{ paddingLeft: `${12 + depth * 14}px` }}
        onClick={() => {
          if (isDirectory) {
            onToggleDir(node.path);
          } else {
            onSelectFile(node.path);
          }
        }}
      >
        <span className="project-tree-caret">
          {isDirectory ? (
            isExpanded ? <ChevronDownIcon size={14} /> : <ChevronIcon size={12} />
          ) : (
            <span className="project-tree-caret-spacer" />
          )}
        </span>
        <span className={`project-tree-icon ${isDirectory ? 'folder' : 'file'}`}>
          {isDirectory ? <FolderIcon size={14} /> : <FileReadIcon size={14} />}
        </span>
        <span className="project-tree-name">{node.name}</span>
      </button>

      {isDirectory && isExpanded && node.children?.length ? (
        <div className="project-tree-children">
          {node.children.map((child) =>
            renderTreeNode(child, expanded, selectedPath, onToggleDir, onSelectFile, depth + 1)
          )}
        </div>
      ) : null}
    </div>
  );
}

function CodeView({
  lines,
  emptyText,
}: {
  lines: CodeLine[];
  emptyText: string;
}): React.ReactNode {
  if (!lines.length) {
    return <div className="project-view-empty">{emptyText}</div>;
  }

  return (
    <div className="project-code-view">
      {lines.map((line) => (
        <div key={`code-${line.lineNumber}`} className="project-code-line">
          <span className="project-code-line-no">{line.lineNumber}</span>
          <code className="project-code-line-content" dangerouslySetInnerHTML={{ __html: line.html }} />
        </div>
      ))}
    </div>
  );
}

function DiffView({ rows }: { rows: DiffRow[] }): React.ReactNode {
  return (
    <div className="project-diff-view">
      {rows.map((row, index) => (
        <div key={`diff-${index}`} className={`project-diff-row ${row.type}`}>
          <div className="project-diff-cell">
            <span className="project-code-line-no">{row.left?.lineNumber ?? ''}</span>
            <code
              className="project-code-line-content"
              dangerouslySetInnerHTML={{ __html: row.left?.html ?? '&nbsp;' }}
            />
          </div>
          <div className="project-diff-cell">
            <span className="project-code-line-no">{row.right?.lineNumber ?? ''}</span>
            <code
              className="project-code-line-content"
              dangerouslySetInnerHTML={{ __html: row.right?.html ?? '&nbsp;' }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export const ProjectPanel: React.FC<ProjectPanelProps> = ({
  conversationId,
  open,
  refreshToken,
  width,
  onClose,
  onChangedFilesCountChange,
}) => {
  const t = useT();
  const [tree, setTree] = useState<ProjectTreeNode[]>([]);
  const [treeLoading, setTreeLoading] = useState(false);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [treeVisible, setTreeVisible] = useState(true);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [changedFiles, setChangedFiles] = useState<ProjectChangedFile[]>([]);
  const [changesLoading, setChangesLoading] = useState(false);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [fileData, setFileData] = useState<ProjectFileSnapshot | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ProjectViewMode>('diff');
  const [treePaneHeight, setTreePaneHeight] = useState(260);
  const [processManagerOpen, setProcessManagerOpen] = useState(false);
  const [processManagerClosing, setProcessManagerClosing] = useState(false);
  const [processes, setProcesses] = useState<ManagedProcessInfo[]>([]);
  const [processesLoading, setProcessesLoading] = useState(false);
  const [processActionId, setProcessActionId] = useState<string | null>(null);
  const [processError, setProcessError] = useState<string | null>(null);
  const treeColumnRef = useRef<HTMLDivElement>(null);
  const treeSplitDragRef = useRef<{ startY: number; startHeight: number } | null>(null);
  const processManagerCloseTimerRef = useRef<number | null>(null);

  const loadTree = async () => {
    setTreeLoading(true);
    setTreeError(null);
    try {
      const response = await fetch(`/api/conversations/${conversationId}/project/tree`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || t.projectPanelOpenFailed);
      }
      setTree(data as ProjectTreeNode[]);
    } catch (err) {
      setTree([]);
      setTreeError((err as Error).message);
    } finally {
      setTreeLoading(false);
    }
  };

  const loadChanges = async () => {
    setChangesLoading(true);
    try {
      const response = await fetch(`/api/conversations/${conversationId}/project/changes`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || t.projectPanelOpenFailed);
      }
      setChangedFiles(data as ProjectChangedFile[]);
    } catch {
      setChangedFiles([]);
    } finally {
      setChangesLoading(false);
    }
  };

  const loadProcesses = async (silent = false) => {
    if (!silent) {
      setProcessesLoading(true);
    }
    setProcessError(null);

    try {
      const response = await fetch(`/api/conversations/${conversationId}/processes`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || t.processManagerLoadFailed);
      }
      setProcesses(data as ManagedProcessInfo[]);
    } catch (err) {
      setProcesses([]);
      setProcessError((err as Error).message);
    } finally {
      if (!silent) {
        setProcessesLoading(false);
      }
    }
  };

  useEffect(() => {
    if (!open) {
      return;
    }

    void loadTree();
    void loadChanges();
  }, [conversationId, open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    void loadTree();
    void loadChanges();
    if (selectedFilePath) {
      void loadFile(selectedFilePath);
    }
  }, [refreshToken]);

  useEffect(() => {
    setSelectedFilePath(null);
    setFileData(null);
    setFileError(null);
    setChangedFiles([]);
    setViewMode('diff');
    setTreePaneHeight(260);
    setProcessManagerOpen(false);
    setProcessManagerClosing(false);
    setProcesses([]);
    setProcessError(null);
  }, [conversationId]);

  useEffect(() => {
    onChangedFilesCountChange?.(changedFiles.length);
  }, [changedFiles.length, onChangedFilesCountChange]);

  useEffect(() => {
    return () => {
      if (processManagerCloseTimerRef.current !== null) {
        window.clearTimeout(processManagerCloseTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!processManagerOpen) {
      return;
    }

    void loadProcesses();
    const timer = window.setInterval(() => {
      void loadProcesses(true);
    }, 3000);

    return () => window.clearInterval(timer);
  }, [conversationId, processManagerOpen]);

  useEffect(() => {
    if (!processManagerOpen) {
      return;
    }

    void loadProcesses(true);
  }, [refreshToken, processManagerOpen]);

  const closeProcessManager = () => {
    if (!processManagerOpen || processManagerClosing) {
      return;
    }

    setProcessManagerClosing(true);
    processManagerCloseTimerRef.current = window.setTimeout(() => {
      setProcessManagerOpen(false);
      setProcessManagerClosing(false);
    }, CLOSE_ANIMATION_MS);
  };

  useEffect(() => {
    const onMouseMove = (event: MouseEvent) => {
      if (!treeSplitDragRef.current || !treeColumnRef.current) {
        return;
      }

      const totalHeight = treeColumnRef.current.clientHeight;
      const delta = event.clientY - treeSplitDragRef.current.startY;
      const nextHeight = treeSplitDragRef.current.startHeight + delta;
      const minPaneHeight = 120;
      const splitterHeight = 10;
      const maxHeight = Math.max(minPaneHeight, totalHeight - minPaneHeight - splitterHeight);

      setTreePaneHeight(Math.max(minPaneHeight, Math.min(maxHeight, nextHeight)));
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
    };

    const onMouseUp = () => {
      if (!treeSplitDragRef.current) {
        return;
      }

      treeSplitDragRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  const highlightedWorking = useMemo(
    () => normalizeCodeLines(fileData?.workingContent ?? null, fileData?.language ?? 'plaintext'),
    [fileData?.workingContent, fileData?.language]
  );
  const highlightedBaseline = useMemo(
    () => normalizeCodeLines(fileData?.baselineContent ?? null, fileData?.language ?? 'plaintext'),
    [fileData?.baselineContent, fileData?.language]
  );
  const diffRows = useMemo(
    () => buildDiffRows(highlightedBaseline, highlightedWorking),
    [highlightedBaseline, highlightedWorking]
  );
  const changedStats = useMemo(() => {
    const stats = { added: 0, removed: 0, modified: 0 };
    changedFiles.forEach((file) => {
      stats[file.changeType] += 1;
    });
    return stats;
  }, [changedFiles]);
  const hasDiff = useMemo(() => {
    if (!fileData) {
      return false;
    }
    if (fileData.workingExists !== fileData.baselineExists) {
      return true;
    }
    return (fileData.workingContent ?? '') !== (fileData.baselineContent ?? '');
  }, [fileData]);

  useEffect(() => {
    if (!hasDiff && viewMode === 'diff') {
      setViewMode('working');
    }
  }, [hasDiff, viewMode]);

  const toggleDir = (path: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const loadFile = async (relativePath: string) => {
    setSelectedFilePath(relativePath);
    setFileLoading(true);
    setFileError(null);

    try {
      const response = await fetch(
        `/api/conversations/${conversationId}/project/file?path=${encodeURIComponent(relativePath)}`
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || t.projectPanelOpenFailed);
      }
      setFileData(data as ProjectFileSnapshot);
      setViewMode('diff');
    } catch (err) {
      setFileData(null);
      setFileError((err as Error).message);
    } finally {
      setFileLoading(false);
    }
  };

  const handleTreeSplitMouseDown = (event: React.MouseEvent) => {
    if (window.innerWidth <= 960 || !treeColumnRef.current) {
      return;
    }

    event.preventDefault();
    treeSplitDragRef.current = {
      startY: event.clientY,
      startHeight: treePaneHeight,
    };
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  };

  const handleStopProcess = async (processId: string) => {
    setProcessActionId(processId);
    setProcessError(null);

    try {
      const response = await fetch(
        `/api/conversations/${conversationId}/processes/${processId}/stop`,
        { method: 'POST' }
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || t.processManagerStopFailed);
      }
      await loadProcesses(true);
    } catch (err) {
      setProcessError((err as Error).message);
    } finally {
      setProcessActionId(null);
    }
  };

  const handleDeleteProcess = async (processId: string) => {
    setProcessActionId(processId);
    setProcessError(null);

    try {
      const response = await fetch(
        `/api/conversations/${conversationId}/processes/${processId}`,
        { method: 'DELETE' }
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || t.processManagerDeleteFailed);
      }
      await loadProcesses(true);
    } catch (err) {
      setProcessError((err as Error).message);
    } finally {
      setProcessActionId(null);
    }
  };

  return (
    <>
      <aside
        className={`project-panel ${open ? 'open' : ''}`}
        style={open ? { width: `var(--project-panel-width, ${width}px)` } : undefined}
      >
        <div className="project-panel-header">
          <div className="project-panel-copy">
            <div className="project-panel-eyebrow">{t.projectPanelTitle}</div>
            <div className="project-panel-stats">
              <div className="project-panel-stat added">
                <span className="project-panel-stat-value">{changedStats.added}</span>
                <span className="project-panel-stat-label">{t.projectChangeAdded}</span>
              </div>
              <div className="project-panel-stat modified">
                <span className="project-panel-stat-value">{changedStats.modified}</span>
                <span className="project-panel-stat-label">{t.projectChangeModified}</span>
              </div>
              <div className="project-panel-stat removed">
                <span className="project-panel-stat-value">{changedStats.removed}</span>
                <span className="project-panel-stat-label">{t.projectChangeRemoved}</span>
              </div>
            </div>
          </div>
          <div className="project-panel-actions">
            <button
              type="button"
              className={`project-panel-icon-btn ${treeVisible ? '' : 'tree-hidden'}`}
              onClick={() => setTreeVisible((visible) => !visible)}
              aria-label={treeVisible ? t.projectPanelHideTree : t.projectPanelShowTree}
              title={treeVisible ? t.projectPanelHideTree : t.projectPanelShowTree}
            >
              <PanelLeftIcon size={16} />
            </button>
            <button
              type="button"
              className="project-panel-icon-btn"
              onClick={() => {
                void loadTree();
                void loadChanges();
                if (selectedFilePath) {
                  void loadFile(selectedFilePath);
                }
              }}
              aria-label={t.projectPanelRefresh}
              title={t.projectPanelRefresh}
            >
              <RefreshIcon size={15} />
            </button>
            <button
              type="button"
              className="project-panel-action project-panel-manage-btn"
              onClick={() => {
                setProcessManagerClosing(false);
                setProcessManagerOpen(true);
              }}
              title={t.processManagerOpen}
            >
              <ListManageIcon size={15} />
              <span>{t.processManagerOpen}</span>
            </button>
            <button type="button" className="project-panel-icon-btn" onClick={onClose} aria-label={t.cancel}>
              <CloseIcon size={16} />
            </button>
          </div>
        </div>

        <div className={`project-panel-body ${treeVisible ? '' : 'tree-hidden'}`}>
          <div ref={treeColumnRef} className={`project-panel-tree ${treeVisible ? '' : 'hidden'}`}>
            <div className="project-panel-tree-pane" style={{ height: `${treePaneHeight}px` }}>
              <div className="project-panel-section-title">{t.projectPanelTreeTitle}</div>
              <div className="project-panel-scroll project-panel-tree-scroll">
                {treeLoading ? (
                  <div className="project-panel-empty">{t.projectLoading}</div>
                ) : treeError ? (
                  <div className="project-panel-error">{treeError}</div>
                ) : tree.length === 0 ? (
                  <div className="project-panel-empty">{t.projectCandidatesEmpty}</div>
                ) : (
                  tree.map((node) =>
                    renderTreeNode(node, expandedDirs, selectedFilePath, toggleDir, loadFile)
                  )
                )}
              </div>
            </div>
            <div className="project-panel-tree-resizer" onMouseDown={handleTreeSplitMouseDown} />
            <div className="project-panel-changes-pane">
              <div className="project-panel-section-title project-panel-section-title-secondary">
                {t.projectPanelChangedFiles}
              </div>
              <div className="project-panel-scroll project-panel-changes-scroll">
                {changesLoading ? (
                  <div className="project-panel-empty">{t.projectLoading}</div>
                ) : changedFiles.length === 0 ? (
                  <div className="project-panel-empty">{t.projectPanelNoChanges}</div>
                ) : (
                  <div className="project-changes-list">
                    {changedFiles.map((change) => (
                      <button
                        key={change.path}
                        type="button"
                        className={`project-change-item ${selectedFilePath === change.path ? 'is-selected' : ''}`}
                        onClick={() => {
                          void loadFile(change.path);
                        }}
                      >
                        <span className={`project-change-badge ${change.changeType}`}>
                          {change.changeType === 'added'
                            ? t.projectChangeAdded
                            : change.changeType === 'removed'
                              ? t.projectChangeRemoved
                              : t.projectChangeModified}
                        </span>
                        <span className="project-change-path">{change.path}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="project-panel-viewer">
            <div className="project-panel-section-title">{t.projectPanelViewerTitle}</div>

            {selectedFilePath && (
              <div className="project-view-tabs">
                {hasDiff && (
                  <button
                    type="button"
                    className={viewMode === 'diff' ? 'active' : ''}
                    onClick={() => setViewMode('diff')}
                  >
                    {t.projectPanelDiff}
                  </button>
                )}
                <button
                  type="button"
                  className={viewMode === 'working' ? 'active' : ''}
                  onClick={() => setViewMode('working')}
                >
                  {t.projectPanelCurrent}
                </button>
                <button
                  type="button"
                  className={viewMode === 'baseline' ? 'active' : ''}
                  onClick={() => setViewMode('baseline')}
                >
                  {t.projectPanelBaseline}
                </button>
              </div>
            )}

            <div className="project-panel-scroll">
              {!selectedFilePath ? (
                <div className="project-panel-empty">{t.projectPanelNoFileSelected}</div>
              ) : fileLoading ? (
                <div className="project-panel-empty">{t.projectPanelLoadingFile}</div>
              ) : fileError ? (
                <div className="project-panel-error">{fileError}</div>
              ) : !fileData ? (
                <div className="project-panel-empty">{t.projectPanelNoFileSelected}</div>
              ) : !fileData.isText ? (
                <div className="project-panel-empty">{t.projectPanelBinary}</div>
              ) : (
                <>
                  <div className="project-file-title">{fileData.relativePath}</div>
                  {viewMode === 'working' && (
                    <CodeView lines={highlightedWorking} emptyText={t.projectPanelCurrentMissing} />
                  )}
                  {viewMode === 'baseline' && (
                    <CodeView lines={highlightedBaseline} emptyText={t.projectPanelBaselineMissing} />
                  )}
                  {viewMode === 'diff' && <DiffView rows={diffRows} />}
                </>
              )}
            </div>
          </div>
        </div>
      </aside>

      {(processManagerOpen || processManagerClosing) && (
        <div
          className={`process-manager-overlay ${processManagerClosing ? 'is-closing' : ''}`}
          onMouseDown={closeProcessManager}
        >
          <div
            className={`process-manager-modal ${processManagerClosing ? 'is-closing' : ''}`}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="process-manager-header">
              <div>
                <div className="process-manager-eyebrow">{t.processManagerEyebrow}</div>
                <div className="process-manager-title">{t.processManagerTitle}</div>
                <div className="process-manager-subtitle">{t.processManagerHint}</div>
              </div>
              <div className="process-manager-actions">
                <button
                  type="button"
                  className="project-panel-action"
                  onClick={() => void loadProcesses()}
                >
                  {t.projectPanelRefresh}
                </button>
                <button
                  type="button"
                  className="project-panel-icon-btn"
                  onClick={closeProcessManager}
                  aria-label={t.cancel}
                >
                  <CloseIcon size={16} />
                </button>
              </div>
            </div>

            <div className="process-manager-body">
              {processesLoading ? (
                <div className="project-panel-empty">{t.projectLoading}</div>
              ) : processError ? (
                <div className="project-panel-error">{processError}</div>
              ) : processes.length === 0 ? (
                <div className="project-panel-empty">{t.processManagerEmpty}</div>
              ) : (
                <div className="process-list">
                  {processes.map((processInfo) => (
                    <section key={processInfo.id} className="process-card">
                      <div className="process-card-top">
                        <div className="process-card-copy">
                          <div className="process-card-title-row">
                            <div className="process-card-title">{processInfo.name}</div>
                            <span className={`process-status-badge ${processInfo.status}`}>
                              {processInfo.status === 'running'
                                ? t.processStatusRunning
                                : processInfo.status === 'stopped'
                                  ? t.processStatusStopped
                                  : processInfo.status === 'failed'
                                    ? t.processStatusFailed
                                    : t.processStatusExited}
                            </span>
                          </div>
                          <div className="process-card-meta">
                            <span>PID {processInfo.pid}</span>
                            <span>{formatDateTime(processInfo.startedAt)}</span>
                            {processInfo.endedAt ? <span>{formatDateTime(processInfo.endedAt)}</span> : null}
                          </div>
                        </div>
                        <div className="process-card-actions">
                          {processInfo.status === 'running' ? (
                            <button
                              type="button"
                              className="process-card-btn stop"
                              onClick={() => void handleStopProcess(processInfo.id)}
                              disabled={processActionId === processInfo.id}
                            >
                              <StopIcon size={14} />
                              <span>{t.processManagerStop}</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="process-card-btn delete"
                              onClick={() => void handleDeleteProcess(processInfo.id)}
                              disabled={processActionId === processInfo.id}
                            >
                              <TrashIcon size={14} />
                              <span>{t.processManagerDelete}</span>
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="process-card-grid">
                        <div className="process-card-field">
                          <div className="process-card-label">{t.processManagerCommand}</div>
                          <div className="process-card-value process-card-code">{processInfo.command}</div>
                        </div>
                        <div className="process-card-field">
                          <div className="process-card-label">{t.processManagerWorkingDir}</div>
                          <div className="process-card-value process-card-code">{processInfo.cwd}</div>
                        </div>
                        <div className="process-card-field">
                          <div className="process-card-label">{t.processManagerPorts}</div>
                          <div className="process-card-value">
                            {processInfo.ports.length > 0 ? processInfo.ports.join(', ') : t.processManagerNoPorts}
                          </div>
                        </div>
                        <div className="process-card-field">
                          <div className="process-card-label">{t.processManagerUrls}</div>
                          <div className="process-card-links">
                            {processInfo.urls.length > 0 ? (
                              processInfo.urls.map((url) => (
                                <button
                                  key={url}
                                  type="button"
                                  className="process-link"
                                  onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
                                >
                                  {url}
                                </button>
                              ))
                            ) : (
                              <span className="process-card-value">{t.processManagerNoUrls}</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="process-card-field process-card-output">
                        <div className="process-card-label">{t.processManagerOutput}</div>
                        <pre className="process-card-pre">
                          {processInfo.recentOutput || t.processManagerNoOutput}
                        </pre>
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
