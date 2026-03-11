import React, { useEffect, useMemo, useState } from 'react';
import hljs from 'highlight.js';
import {
  ChevronDownIcon,
  ChevronIcon,
  CloseIcon,
  FileReadIcon,
  FolderIcon,
} from '@/components/icons';
import { useT } from '@/i18n';
import './ProjectPanel.less';

type ProjectViewMode = 'working' | 'baseline' | 'diff';

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

interface ProjectPanelProps {
  conversationId: string;
  projectName: string;
  projectPath: string;
  open: boolean;
  refreshToken: number;
  width: number;
  onClose: () => void;
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
  projectName,
  projectPath,
  open,
  refreshToken,
  width,
  onClose,
}) => {
  const t = useT();
  const [tree, setTree] = useState<ProjectTreeNode[]>([]);
  const [treeLoading, setTreeLoading] = useState(false);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [fileData, setFileData] = useState<ProjectFileSnapshot | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ProjectViewMode>('diff');

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

  useEffect(() => {
    if (!open) {
      return;
    }

    void loadTree();
  }, [conversationId, open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    void loadTree();
    if (selectedFilePath) {
      void loadFile(selectedFilePath);
    }
  }, [refreshToken]);

  useEffect(() => {
    setSelectedFilePath(null);
    setFileData(null);
    setFileError(null);
    setViewMode('diff');
  }, [conversationId]);

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

  return (
    <aside
      className={`project-panel ${open ? 'open' : ''}`}
      style={open ? { width: `var(--project-panel-width, ${width}px)` } : undefined}
    >
      <div className="project-panel-header">
        <div className="project-panel-copy">
          <div className="project-panel-eyebrow">{t.projectPanelTitle}</div>
          <div className="project-panel-name">{projectName}</div>
          <div className="project-panel-path">{projectPath}</div>
        </div>
        <div className="project-panel-actions">
          <button
            type="button"
            className="project-panel-action"
            onClick={() => {
              void loadTree();
              if (selectedFilePath) {
                void loadFile(selectedFilePath);
              }
            }}
            title={t.projectPanelRefresh}
          >
            {t.projectPanelRefresh}
          </button>
          <button type="button" className="project-panel-icon-btn" onClick={onClose} aria-label={t.cancel}>
            <CloseIcon size={16} />
          </button>
        </div>
      </div>

      <div className="project-panel-body">
        <div className="project-panel-tree">
          <div className="project-panel-section-title">{t.projectPanelTreeTitle}</div>
          <div className="project-panel-scroll">
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

        <div className="project-panel-viewer">
          <div className="project-panel-section-title">{t.projectPanelViewerTitle}</div>

          {selectedFilePath && (
            <div className="project-view-tabs">
              <button
                type="button"
                className={viewMode === 'diff' ? 'active' : ''}
                onClick={() => setViewMode('diff')}
              >
                {t.projectPanelDiff}
              </button>
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
  );
};
