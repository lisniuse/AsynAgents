import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { marked } from 'marked';
import hljs from 'highlight.js';
import { ToolCard } from './ToolCard';
import type { Message } from '@/types';
import { BoltIcon, ChevronDownIcon, ChevronUpIcon, StopIcon, ToolIcon } from '@/components/icons';
import { useAppStore } from '@/stores/appStore';
import { useT } from '@/i18n';
import './MessageItem.less';

interface MessageItemProps {
  message: Message;
  onStop?: () => void;
  isStopping?: boolean;
}

interface Point {
  x: number;
  y: number;
}

interface Size {
  width: number;
  height: number;
}

interface PinchGesture {
  type: 'pinch';
  initialDistance: number;
  initialZoom: number;
  initialOffset: Point;
  initialMidpoint: Point;
}

interface PanGesture {
  type: 'pan';
  pointerId: number;
  startPointer: Point;
  startOffset: Point;
}

type GestureState = PinchGesture | PanGesture | null;

const MIN_ZOOM = 0.05;
const DEFAULT_MAX_ZOOM = 16;
const WHEEL_ZOOM_IN = 1.15;
const WHEEL_ZOOM_OUT = 0.87;

marked.setOptions({
  breaks: true,
  gfm: true,
});

const renderMarkdown = (content: string): string => {
  const tokens = marked.lexer(content) as Array<{ type: string; text?: string; lang?: string }>;

  return tokens.map((token) => {
    if (token.type === 'code') {
      const codeToken = token as { text: string; lang?: string };
      const highlighted = codeToken.lang && hljs.getLanguage(codeToken.lang)
        ? hljs.highlight(codeToken.text, { language: codeToken.lang }).value
        : hljs.highlightAuto(codeToken.text).value;
      return `<pre><div class="code-header"><span class="code-lang">${codeToken.lang || 'text'}</span></div><code>${highlighted}</code></pre>`;
    }
    if (token.type === 'table') {
      return `<div class="table-wrapper">${marked.parser([token] as never)}</div>`;
    }
    return marked.parser([token] as never);
  }).join('');
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function midpoint(a: Point, b: Point): Point {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  };
}

function getStandaloneAssistantImages(content: string, images?: string[]): string[] {
  if (!images?.length) {
    return [];
  }

  return images.filter((src) => !content.includes(src));
}

function MessageImages({
  images,
  className,
  onOpenImage,
}: {
  images: string[];
  className: string;
  onOpenImage: (src: string) => void;
}): React.ReactNode {
  return (
    <div className={className}>
      {images.map((src, index) => (
        <button
          key={`${src}-${index}`}
          type="button"
          className="message-image-button"
          onClick={() => onOpenImage(src)}
        >
          <img src={src} alt="" className="message-image" />
        </button>
      ))}
    </div>
  );
}

function InteractiveImageLightbox({
  src,
  onClose,
}: {
  src: string;
  onClose: () => void;
}): React.ReactNode {
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [naturalSize, setNaturalSize] = useState<Size>({ width: 0, height: 0 });
  const [fitScale, setFitScale] = useState(1);
  const stageRef = useRef<HTMLDivElement>(null);
  const pointersRef = useRef(new Map<number, Point>());
  const gestureRef = useRef<GestureState>(null);
  const zoomRef = useRef(1);
  const offsetRef = useRef<Point>({ x: 0, y: 0 });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  useEffect(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setIsDragging(false);
    setNaturalSize({ width: 0, height: 0 });
    setFitScale(1);
    gestureRef.current = null;
    pointersRef.current.clear();
    zoomRef.current = 1;
    offsetRef.current = { x: 0, y: 0 };
  }, [src]);

  useEffect(() => {
    zoomRef.current = zoom;
    offsetRef.current = offset;
  }, [zoom, offset]);

  useEffect(() => {
    if (!naturalSize.width || !naturalSize.height) {
      return;
    }

    const updateFitScale = () => {
      const stage = stageRef.current;
      if (!stage) {
        return;
      }

      const stageWidth = stage.clientWidth;
      const stageHeight = stage.clientHeight;
      if (!stageWidth || !stageHeight) {
        return;
      }

      const nextFitScale = Math.min(
        stageWidth / naturalSize.width,
        stageHeight / naturalSize.height,
        1
      );
      setFitScale(nextFitScale);
    };

    updateFitScale();
    window.addEventListener('resize', updateFitScale);
    return () => window.removeEventListener('resize', updateFitScale);
  }, [naturalSize]);

  const maxZoom = naturalSize.width && naturalSize.height
    ? Math.max(DEFAULT_MAX_ZOOM, 1 / Math.max(fitScale, 0.0001))
    : DEFAULT_MAX_ZOOM;
  const actualScale = fitScale * zoom;

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) {
      return;
    }

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const factor = event.deltaY < 0 ? WHEEL_ZOOM_IN : WHEEL_ZOOM_OUT;
      setZoom((current) => clamp(current * factor, MIN_ZOOM, maxZoom));
    };

    stage.addEventListener('wheel', onWheel, { passive: false });
    return () => stage.removeEventListener('wheel', onWheel);
  }, [maxZoom]);

  const startPanFromPoint = (pointerId: number, point: Point) => {
    gestureRef.current = {
      type: 'pan',
      pointerId,
      startPointer: point,
      startOffset: offsetRef.current,
    };
    setIsDragging(zoomRef.current > 1);
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    const point = { x: event.clientX, y: event.clientY };
    pointersRef.current.set(event.pointerId, point);
    event.currentTarget.setPointerCapture(event.pointerId);

    const pointers = Array.from(pointersRef.current.values());
    if (pointers.length === 1) {
      startPanFromPoint(event.pointerId, point);
      return;
    }

    if (pointers.length === 2) {
      gestureRef.current = {
        type: 'pinch',
        initialDistance: Math.max(distance(pointers[0], pointers[1]), 1),
        initialZoom: zoomRef.current,
        initialOffset: offsetRef.current,
        initialMidpoint: midpoint(pointers[0], pointers[1]),
      };
      setIsDragging(true);
    }
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(event.pointerId)) {
      return;
    }

    const point = { x: event.clientX, y: event.clientY };
    pointersRef.current.set(event.pointerId, point);
    const pointers = Array.from(pointersRef.current.values());
    const gesture = gestureRef.current;

    if (gesture?.type === 'pinch' && pointers.length >= 2) {
      event.preventDefault();
      const currentDistance = Math.max(distance(pointers[0], pointers[1]), 1);
      const currentMidpoint = midpoint(pointers[0], pointers[1]);
      const nextZoom = clamp(
        gesture.initialZoom * (currentDistance / gesture.initialDistance),
        MIN_ZOOM,
        maxZoom
      );
      setZoom(nextZoom);
      setOffset({
        x: gesture.initialOffset.x + (currentMidpoint.x - gesture.initialMidpoint.x),
        y: gesture.initialOffset.y + (currentMidpoint.y - gesture.initialMidpoint.y),
      });
      return;
    }

    if (gesture?.type === 'pan' && gesture.pointerId === event.pointerId) {
      event.preventDefault();
      setOffset({
        x: gesture.startOffset.x + (point.x - gesture.startPointer.x),
        y: gesture.startOffset.y + (point.y - gesture.startPointer.y),
      });
      setIsDragging(true);
    }
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(event.pointerId);

    const remaining = Array.from(pointersRef.current.entries());
    if (remaining.length === 1) {
      const [pointerId, point] = remaining[0];
      startPanFromPoint(pointerId, point);
      return;
    }

    if (remaining.length === 0) {
      gestureRef.current = null;
      setTimeout(() => setIsDragging(false), 0);
      return;
    }

    const points = remaining.map(([, point]) => point);
    gestureRef.current = {
      type: 'pinch',
      initialDistance: Math.max(distance(points[0], points[1]), 1),
      initialZoom: zoomRef.current,
      initialOffset: offsetRef.current,
      initialMidpoint: midpoint(points[0], points[1]),
    };
  };

  const showFit = () => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setIsDragging(false);
  };

  const showNativePixels = () => {
    setZoom(Math.max(1 / Math.max(fitScale, 0.0001), MIN_ZOOM));
    setOffset({ x: 0, y: 0 });
    setIsDragging(false);
  };

  return createPortal(
    <div className="image-lightbox" onClick={onClose}>
      <button
        type="button"
        className="image-lightbox-close"
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
      >
        ×
      </button>
      <div className="image-lightbox-toolbar" onClick={(event) => event.stopPropagation()}>
        <button
          type="button"
          className="image-lightbox-action"
          onClick={() => setZoom((current) => clamp(current * WHEEL_ZOOM_IN, MIN_ZOOM, maxZoom))}
        >
          +
        </button>
        <button
          type="button"
          className="image-lightbox-action"
          onClick={() => setZoom((current) => clamp(current * WHEEL_ZOOM_OUT, MIN_ZOOM, maxZoom))}
        >
          -
        </button>
        <button
          type="button"
          className="image-lightbox-action image-lightbox-reset"
          onClick={showNativePixels}
        >
          100%
        </button>
        <button
          type="button"
          className="image-lightbox-action image-lightbox-reset"
          onClick={showFit}
        >
          FIT
        </button>
      </div>
      <div
        ref={stageRef}
        className={`image-lightbox-stage ${isDragging ? 'is-dragging' : ''}`}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <img
          src={src}
          alt=""
          className="image-lightbox-image"
          draggable={false}
          onLoad={(event) => {
            const image = event.currentTarget;
            setNaturalSize({
              width: image.naturalWidth,
              height: image.naturalHeight,
            });
          }}
          style={{
            width: naturalSize.width ? `${naturalSize.width}px` : undefined,
            height: naturalSize.height ? `${naturalSize.height}px` : undefined,
            transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px)) scale(${actualScale})`,
          }}
        />
      </div>
    </div>,
    document.body
  );
}

export const MessageItem: React.FC<MessageItemProps> = ({
  message,
  onStop,
  isStopping = false,
}) => {
  const t = useT();
  const contentRef = useRef<HTMLDivElement>(null);
  const settings = useAppStore((state) => state.settings);
  const defaultExpanded = settings?.ui?.showToolCalls ?? true;
  const [manualExpanded, setManualExpanded] = useState<boolean | null>(null);
  const [activeImage, setActiveImage] = useState<string | null>(null);
  const isToolCallsExpanded = manualExpanded !== null ? manualExpanded : defaultExpanded;
  const standaloneAssistantImages = getStandaloneAssistantImages(message.content, message.images);

  const handleToggle = () => {
    setManualExpanded(!isToolCallsExpanded);
  };

  useEffect(() => {
    if (!contentRef.current) {
      return;
    }

    const codeBlocks = contentRef.current.querySelectorAll('pre code');
    codeBlocks.forEach((block) => {
      hljs.highlightElement(block as HTMLElement);
    });

    const markdownImages = contentRef.current.querySelectorAll('img');
    const cleanups: Array<() => void> = [];
    markdownImages.forEach((node) => {
      const image = node as HTMLImageElement;
      image.classList.add('md-image');
      image.setAttribute('loading', 'lazy');
      const openPreview = () => setActiveImage(image.currentSrc || image.src);
      image.addEventListener('click', openPreview);
      cleanups.push(() => image.removeEventListener('click', openPreview));
    });

    return () => {
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [message.content]);

  const lightbox = activeImage ? (
    <InteractiveImageLightbox src={activeImage} onClose={() => setActiveImage(null)} />
  ) : null;

  if (message.role === 'user') {
    return (
      <div className="message-wrapper msg-user">
        {message.images && message.images.length > 0 && (
          <MessageImages
            images={message.images}
            className="msg-user-images"
            onOpenImage={setActiveImage}
          />
        )}
        {message.content && <div className="msg-user-bubble">{message.content}</div>}
        {lightbox}
      </div>
    );
  }

  return (
    <div className="message-wrapper msg-assistant">
      <div className="msg-assistant-content">
        <div className="agent-avatar">
          <BoltIcon size={16} />
        </div>
        <div className="msg-label">{t.assistant}</div>
        <div className="msg-content">
          {message.toolCalls && message.toolCalls.length > 0 && (
            <div className="thinking-section">
              <button
                className="thinking-toggle"
                onClick={handleToggle}
                title={isToolCallsExpanded ? t.collapseToolCalls : t.expandToolCalls}
              >
                <ToolIcon size={14} />
                <span>{t.toolCallProcess}</span>
                {isToolCallsExpanded ? <ChevronUpIcon size={14} /> : <ChevronDownIcon size={14} />}
              </button>
              {isToolCallsExpanded && (
                <div className="tool-calls-content">
                  {message.toolCalls.map((toolCall) => (
                    <div key={toolCall.id}>
                      {toolCall.preText && (
                        <div
                          className="pre-tool-content"
                          dangerouslySetInnerHTML={{ __html: renderMarkdown(toolCall.preText) }}
                        />
                      )}
                      <ToolCard toolCall={toolCall} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div
            ref={contentRef}
            className={`md-content ${message.isStreaming && !message.toolCalls?.some((toolCall) => toolCall.status === 'running') ? 'streaming-cursor' : ''}`}
            dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }}
          />

          {standaloneAssistantImages.length > 0 && (
            <MessageImages
              images={standaloneAssistantImages}
              className="msg-assistant-images"
              onOpenImage={setActiveImage}
            />
          )}

          {message.isStreaming && onStop && (
            <button
              className="stop-btn"
              onClick={onStop}
              disabled={isStopping}
              title={t.stop}
            >
              <StopIcon size={14} />
              <span>{isStopping ? t.stopping : t.stop}</span>
            </button>
          )}
        </div>
      </div>
      {lightbox}
    </div>
  );
};
