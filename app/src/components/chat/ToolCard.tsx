import React, { useMemo, useState } from 'react';
import hljs from 'highlight.js';
import {
  CheckIcon,
  ChevronIcon,
  CopyIcon,
  ToolIcon,
  TerminalIcon,
  FileEditIcon,
  FileReadIcon,
  FolderIcon,
} from '@/components/icons';
import type { ToolCallState } from '@/types';
import { useT } from '@/i18n';
import './ToolCard.less';

const toolIconMap: Record<string, React.ReactNode> = {
  bash: <TerminalIcon size={16} />,
  python: <TerminalIcon size={16} />,
  write_file: <FileEditIcon size={16} />,
  read_file: <FileReadIcon size={16} />,
  list_directory: <FolderIcon size={16} />,
};

const CODE_FILE_EXTENSIONS = new Set([
  'c', 'cc', 'cpp', 'cs', 'css', 'go', 'h', 'hpp', 'html', 'java', 'js', 'json',
  'jsx', 'less', 'lua', 'md', 'php', 'py', 'rb', 'rs', 'scss', 'sh', 'sql', 'svg',
  'ts', 'tsx', 'txt', 'vue', 'xml', 'yaml', 'yml',
]);

interface ToolCardProps {
  toolCall: ToolCallState;
}

function getFileExtension(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  const fileName = normalized.split('/').pop() || normalized;
  const parts = fileName.split('.');
  return parts.length > 1 ? parts.pop()!.toLowerCase() : '';
}

function getCodePreview(toolCall: ToolCallState): { code: string; language: string } | null {
  if (toolCall.name === 'python') {
    const code = typeof toolCall.input.code === 'string' ? toolCall.input.code : '';
    return code ? { code, language: 'python' } : null;
  }

  if (toolCall.name === 'write_file') {
    const filePath = typeof toolCall.input.path === 'string' ? toolCall.input.path : '';
    const content = typeof toolCall.input.content === 'string' ? toolCall.input.content : '';
    const extension = getFileExtension(filePath);
    if (!content || !extension || !CODE_FILE_EXTENSIONS.has(extension)) {
      return null;
    }

    return {
      code: content,
      language: extension === 'md' ? 'markdown' : extension,
    };
  }

  return null;
}

function highlightLines(code: string, language: string): string[] {
  const normalized = code.replace(/\r\n/g, '\n');
  return normalized.split('\n').map((line) => {
    if (!line) {
      return '&nbsp;';
    }

    if (language && hljs.getLanguage(language)) {
      return hljs.highlight(line, { language }).value || '&nbsp;';
    }

    return hljs.highlightAuto(line).value || '&nbsp;';
  });
}

export const ToolCard: React.FC<ToolCardProps> = ({ toolCall }) => {
  const t = useT();
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const codePreview = useMemo(() => getCodePreview(toolCall), [toolCall]);
  const highlightedLines = useMemo(
    () => (codePreview ? highlightLines(codePreview.code, codePreview.language) : []),
    [codePreview]
  );

  const statusClass = toolCall.status;
  const statusText = {
    running: t.toolStatusRunning,
    done: t.toolStatusDone,
    error: t.toolStatusError,
  }[toolCall.status];

  const handleCopyCode = async (): Promise<void> => {
    if (!codePreview) {
      return;
    }

    try {
      await navigator.clipboard.writeText(codePreview.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className={`tool-card ${isOpen ? 'open' : ''}`}>
      <div className="tool-header" onClick={() => setIsOpen(!isOpen)}>
        <span className="tool-icon">{toolIconMap[toolCall.name] ?? <ToolIcon size={16} />}</span>
        <span className="tool-name">{toolCall.name}</span>
        <div className={`tool-status ${statusClass}`}>
          {toolCall.status === 'running' && <div className="spinner" />}
          <span>{statusText}</span>
        </div>
        <ChevronIcon size={12} className="tool-chevron" />
      </div>

      {isOpen && (
        <div className="tool-body">
          {codePreview && (
            <>
              <div className="tool-section-header">
                <div className="tool-section-label">{t.toolCode}</div>
                <button
                  type="button"
                  className={`tool-copy-btn ${copied ? 'copied' : ''}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    void handleCopyCode();
                  }}
                  title={copied ? t.toolCopied : t.toolCopyCode}
                >
                  {copied ? <CheckIcon size={12} /> : <CopyIcon size={12} />}
                  <span>{copied ? t.toolCopied : t.toolCopy}</span>
                </button>
              </div>
              <div className="tool-source-code">
                {highlightedLines.map((lineHtml, index) => (
                  <div key={`${toolCall.id}-code-${index + 1}`} className="tool-source-line">
                    <span className="tool-source-line-no">{index + 1}</span>
                    <code
                      className="tool-source-line-code"
                      dangerouslySetInnerHTML={{ __html: lineHtml }}
                    />
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="tool-section-label">{t.toolParams}</div>
          <div className="tool-code">
            {JSON.stringify(toolCall.input, null, 2)}
          </div>

          {toolCall.result !== undefined && (
            <>
              <div className="tool-section-label">{t.toolResult}</div>
              <div className={`tool-result-code ${toolCall.isError ? 'error' : 'success'}`}>
                {toolCall.result}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
