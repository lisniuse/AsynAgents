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
  onRollbackToMessage?: (message: Message) => void;
  isRollingBack?: boolean;
  rollbackDisabled?: boolean;
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
const CLOSE_ANIMATION_MS = 180;

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

function getImageFallbackMarkup(): string {
  return `
    <svg class="image-fallback-face" viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="26" class="image-fallback-face-bg"></circle>
      <path d="M22 23l6 6M28 23l-6 6" class="image-fallback-face-x"></path>
      <path d="M36 23l6 6M42 23l-6 6" class="image-fallback-face-x"></path>
      <path d="M22 44c3-4 7-6 10-6s7 2 10 6" class="image-fallback-face-mouth"></path>
    </svg>
    <div class="image-fallback-text">图片加载失败</div>
  `;
}

function getSvgImageFallbackMarkup(): string {
  return `
    <svg class="image-fallback-face" viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="26" class="image-fallback-face-bg"></circle>
      <path d="M22 23l6 6M28 23l-6 6" class="image-fallback-face-x"></path>
      <path d="M36 23l6 6M42 23l-6 6" class="image-fallback-face-x"></path>
      <path d="M22 44c3-4 7-6 10-6s7 2 10 6" class="image-fallback-face-mouth"></path>
    </svg>
    <div class="image-fallback-text">图片加载失败</div>
  `;
}

function SvgImageFallbackCard({ className }: { className?: string }): React.ReactNode {
  return (
    <div className={className ? `image-fallback ${className}` : 'image-fallback'}>
      <svg
        className="image-fallback-face"
        viewBox="0 0 64 64"
        aria-hidden="true"
      >
        <circle cx="32" cy="32" r="26" className="image-fallback-face-bg" />
        <path d="M22 23l6 6M28 23l-6 6" className="image-fallback-face-x" />
        <path d="M36 23l6 6M42 23l-6 6" className="image-fallback-face-x" />
        <path d="M22 44c3-4 7-6 10-6s7 2 10 6" className="image-fallback-face-mouth" />
      </svg>
      <div className="image-fallback-text">图片加载失败</div>
    </div>
  );
}

function ImageFallbackCard({ className }: { className?: string }): React.ReactNode {
  return (
    <div className={className ? `image-fallback ${className}` : 'image-fallback'}>
      <div className="image-fallback-face">X X</div>
      <div className="image-fallback-text">图片加载失败</div>
    </div>
  );
}

void getImageFallbackMarkup;
void getSvgImageFallbackMarkup;
void SvgImageFallbackCard;
void ImageFallbackCard;

function buildLocalizedImageFallbackMarkup(message: string): string {
  return `
    <svg class="image-fallback-face" viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="26" class="image-fallback-face-bg"></circle>
      <path d="M22 23l6 6M28 23l-6 6" class="image-fallback-face-x"></path>
      <path d="M36 23l6 6M42 23l-6 6" class="image-fallback-face-x"></path>
      <path d="M22 44c3-4 7-6 10-6s7 2 10 6" class="image-fallback-face-mouth"></path>
    </svg>
    <div class="image-fallback-text">${message}</div>
  `;
}

function upsertMarkdownImageFallback(image: HTMLImageElement, message: string): void {
  image.style.display = 'none';
  const existingFallback = image.nextElementSibling?.classList.contains('md-image-fallback')
    ? image.nextElementSibling as HTMLElement
    : null;

  if (existingFallback) {
    existingFallback.innerHTML = buildLocalizedImageFallbackMarkup(message);
    return;
  }

  const fallback = document.createElement('div');
  fallback.className = 'image-fallback md-image-fallback';
  fallback.innerHTML = buildLocalizedImageFallbackMarkup(message);
  image.insertAdjacentElement('afterend', fallback);
}

function LocalizedImageFallbackCard({
  className,
  message,
}: {
  className?: string;
  message: string;
}): React.ReactNode {
  return (
    <div className={className ? `image-fallback ${className}` : 'image-fallback'}>
      <svg
        className="image-fallback-face"
        viewBox="0 0 64 64"
        aria-hidden="true"
      >
        <circle cx="32" cy="32" r="26" className="image-fallback-face-bg" />
        <path d="M22 23l6 6M28 23l-6 6" className="image-fallback-face-x" />
        <path d="M36 23l6 6M42 23l-6 6" className="image-fallback-face-x" />
        <path d="M22 44c3-4 7-6 10-6s7 2 10 6" className="image-fallback-face-mouth" />
      </svg>
      <div className="image-fallback-text">{message}</div>
    </div>
  );
}

function MessageImage({
  src,
  onOpenImage,
}: {
  src: string;
  onOpenImage: (src: string) => void;
}): React.ReactNode {
  const t = useT();
  const [failed, setFailed] = useState(false);

  if (failed) {
    return <LocalizedImageFallbackCard className="message-image-fallback" message={t.imageLoadFailed} />;
  }

  return (
    <button
      type="button"
      className="message-image-button"
      onClick={() => onOpenImage(src)}
    >
      <img
        src={src}
        alt=""
        className="message-image"
        onError={() => setFailed(true)}
      />
    </button>
  );
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
        <MessageImage
          key={`${src}-${index}`}
          src={src}
          onOpenImage={onOpenImage}
        />
      ))}
    </div>
  );
}

function MessageAvatar({
  role,
  avatar,
  fallback,
}: {
  role: 'user' | 'assistant';
  avatar?: string;
  fallback: React.ReactNode;
}): React.ReactNode {
  return (
    <div className={`message-avatar ${role === 'user' ? 'user' : 'assistant'}`}>
      {avatar ? <img src={avatar} alt="" className="message-avatar-image" /> : fallback}
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
  const t = useT();
  const [loadFailed, setLoadFailed] = useState(false);
  const [closing, setClosing] = useState(false);
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
  const closeTimerRef = useRef<number | null>(null);

  const requestClose = () => {
    if (closing) {
      return;
    }

    setClosing(true);
    closeTimerRef.current = window.setTimeout(() => {
      onClose();
    }, CLOSE_ANIMATION_MS);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        requestClose();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [requestClose]);

  useEffect(() => {
    setLoadFailed(false);
    setClosing(false);
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
    return () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

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
    <div className={`image-lightbox ${closing ? 'is-closing' : ''}`} onClick={requestClose}>
      <button
        type="button"
        className={`image-lightbox-close ${closing ? 'is-closing' : ''}`}
        onClick={(event) => {
          event.stopPropagation();
          requestClose();
        }}
      >
        ×
      </button>
      <div
        className={`image-lightbox-toolbar ${closing ? 'is-closing' : ''}`}
        onClick={(event) => event.stopPropagation()}
      >
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
          {t.imageFit}
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
        {loadFailed ? (
          <LocalizedImageFallbackCard
            className={`image-lightbox-fallback ${closing ? 'is-closing' : ''}`}
            message={t.imageLoadFailed}
          />
        ) : (
          <img
            src={src}
            alt=""
            className={`image-lightbox-image ${closing ? 'is-closing' : ''}`}
            draggable={false}
            onError={() => setLoadFailed(true)}
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
        )}
      </div>
    </div>,
    document.body
  );
}

export const MessageItem: React.FC<MessageItemProps> = ({
  message,
  onStop,
  isStopping = false,
  onRollbackToMessage,
  isRollingBack = false,
  rollbackDisabled = false,
}) => {
  const t = useT();
  const contentRef = useRef<HTMLDivElement>(null);
  const settings = useAppStore((state) => state.settings);
  const defaultExpanded = settings?.ui?.showToolCalls ?? true;
  const autoCollapseOnDone = settings?.ui?.autoCollapseToolCalls ?? false;
  const assistantName = settings?.persona?.aiName?.trim() || t.assistant;
  const userName = settings?.persona?.userName?.trim() || t.user;
  const assistantAvatar = settings?.persona?.aiAvatar?.trim();
  const userAvatar = settings?.persona?.userAvatar?.trim();
  const [manualExpanded, setManualExpanded] = useState<boolean | null>(null);
  const [activeImage, setActiveImage] = useState<string | null>(null);
  const autoCollapsedRef = useRef(false);
  const isToolCallsExpanded = manualExpanded !== null ? manualExpanded : defaultExpanded;
  const standaloneAssistantImages = getStandaloneAssistantImages(message.content, message.images);

  const handleToggle = () => {
    setManualExpanded(!isToolCallsExpanded);
  };

  useEffect(() => {
    autoCollapsedRef.current = false;
    setManualExpanded(null);
  }, [message.id]);

  useEffect(() => {
    const hasRunningTool = message.toolCalls?.some((toolCall) => toolCall.status === 'running') ?? false;
    if (hasRunningTool || message.isStreaming) {
      autoCollapsedRef.current = false;
      return;
    }

    if (
      autoCollapseOnDone &&
      defaultExpanded &&
      !autoCollapsedRef.current &&
      message.toolCalls &&
      message.toolCalls.length > 0 &&
      manualExpanded === null
    ) {
      autoCollapsedRef.current = true;
      setManualExpanded(false);
    }
  }, [
    autoCollapseOnDone,
    defaultExpanded,
    manualExpanded,
    message.isStreaming,
    message.toolCalls,
  ]);

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
      const showFallback = () => upsertMarkdownImageFallback(image, t.imageLoadFailed);

      if (!image.complete) {
        image.addEventListener('error', showFallback);
      } else if (image.naturalWidth === 0) {
        upsertMarkdownImageFallback(image, t.imageLoadFailed);
      } else if (image.nextElementSibling?.classList.contains('md-image-fallback')) {
        (image.nextElementSibling as HTMLElement).innerHTML = buildLocalizedImageFallbackMarkup(t.imageLoadFailed);
      }

      image.addEventListener('click', openPreview);
      image.addEventListener('error', showFallback);
      cleanups.push(() => image.removeEventListener('click', openPreview));
      cleanups.push(() => image.removeEventListener('error', showFallback));
    });

    return () => {
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [message.content, t.imageLoadFailed]);

  const lightbox = activeImage ? (
    <InteractiveImageLightbox src={activeImage} onClose={() => setActiveImage(null)} />
  ) : null;

  if (message.role === 'user') {
    return (
      <div className="message-wrapper msg-user">
        <div className="msg-user-header">
          {message.checkpointId && onRollbackToMessage && (
            <button
              type="button"
              className="msg-user-checkpoint-btn"
              onClick={() => onRollbackToMessage(message)}
              disabled={isRollingBack || rollbackDisabled}
            >
              {isRollingBack ? t.projectRollbacking : t.projectRollback}
            </button>
          )}
          <div className="msg-user-label">{userName}</div>
          <MessageAvatar
            role="user"
            avatar={userAvatar}
            fallback={<span className="message-avatar-fallback-text">{userName.slice(0, 1)}</span>}
          />
        </div>
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
        <MessageAvatar
          role="assistant"
          avatar={assistantAvatar}
          fallback={<BoltIcon size={16} />}
        />
        <div className="msg-label">{assistantName}</div>
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
