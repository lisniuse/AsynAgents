import winston from 'winston';
import { join } from 'path';
import { mkdirSync, existsSync } from 'fs';
import { config, logDir as configLogDir } from '../../../config.js';

const { combine, timestamp, printf, colorize, errors } = winston.format;

// 自定义日志格式
const logFormat = printf(({ level, message, timestamp, stack, ...metadata }) => {
  let msg = `${timestamp} [${level}]: ${message}`;
  if (Object.keys(metadata).length > 0) {
    msg += ` ${JSON.stringify(metadata)}`;
  }
  if (stack) {
    msg += `\n${stack}`;
  }
  return msg;
});

// 控制台格式（带颜色）
const consoleFormat = combine(
  colorize(),
  timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  logFormat
);

// 文件格式（无颜色）
const fileFormat = combine(
  timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  errors({ stack: true }),
  logFormat
);

// 创建日志目录
function ensureLogDirectory(): string {
  const logDir = configLogDir;
  if (!existsSync(logDir)) {
    try {
      mkdirSync(logDir, { recursive: true });
    } catch (err) {
      console.error(`Failed to create log directory: ${logDir}`, err);
      // 回退到当前目录
      return process.cwd();
    }
  }
  return logDir;
}

// 创建 winston logger 实例
function createLogger(): winston.Logger {
  if (!config.logging.enabled) {
    // 如果禁用日志，创建空 logger
    return winston.createLogger({
      transports: [],
    });
  }

  const logDir = ensureLogDirectory();
  const transports: winston.transport[] = [];

  // 控制台输出
  transports.push(
    new winston.transports.Console({
      format: consoleFormat,
    })
  );

  // 文件输出 - 所有日志
  transports.push(
    new winston.transports.File({
      filename: join(logDir, 'app.log'),
      format: fileFormat,
      maxsize: parseSize(config.logging.maxSize),
      maxFiles: config.logging.maxFiles,
      tailable: true,
    })
  );

  // 文件输出 - 错误日志
  transports.push(
    new winston.transports.File({
      filename: join(logDir, 'error.log'),
      level: 'error',
      format: fileFormat,
      maxsize: parseSize(config.logging.maxSize),
      maxFiles: config.logging.maxFiles,
      tailable: true,
    })
  );

  return winston.createLogger({
    level: config.logging.level,
    defaultMeta: { service: 'asynagent' },
    transports,
    // 未捕获的异常处理
    exceptionHandlers: [
      new winston.transports.File({
        filename: join(logDir, 'exceptions.log'),
        format: fileFormat,
      }),
    ],
    // 未处理的 Promise 拒绝处理
    rejectionHandlers: [
      new winston.transports.File({
        filename: join(logDir, 'rejections.log'),
        format: fileFormat,
      }),
    ],
  });
}

// 解析文件大小字符串 (如 '10m', '100k')
function parseSize(sizeStr: string): number {
  const match = sizeStr.match(/^(\d+)([kmg]?)$/i);
  if (!match) return 10 * 1024 * 1024; // 默认 10MB

  const num = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  switch (unit) {
    case 'k':
      return num * 1024;
    case 'm':
      return num * 1024 * 1024;
    case 'g':
      return num * 1024 * 1024 * 1024;
    default:
      return num;
  }
}

// 导出 logger 实例
export const logger = createLogger();

// 导出便捷方法
export const log = {
  error: (message: string, meta?: Record<string, unknown>) => {
    logger.error(message, meta);
  },
  warn: (message: string, meta?: Record<string, unknown>) => {
    logger.warn(message, meta);
  },
  info: (message: string, meta?: Record<string, unknown>) => {
    logger.info(message, meta);
  },
  debug: (message: string, meta?: Record<string, unknown>) => {
    logger.debug(message, meta);
  },
  // 用于流式日志
  stream: (message: string, meta?: Record<string, unknown>) => {
    logger.debug(message, meta);
  },
};

// 创建子 logger（带上下文）
export function createChildLogger(
  context: string
): {
  error: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
  info: (message: string, meta?: Record<string, unknown>) => void;
  debug: (message: string, meta?: Record<string, unknown>) => void;
} {
  return {
    error: (message: string, meta?: Record<string, unknown>) => {
      logger.error(`[${context}] ${message}`, meta);
    },
    warn: (message: string, meta?: Record<string, unknown>) => {
      logger.warn(`[${context}] ${message}`, meta);
    },
    info: (message: string, meta?: Record<string, unknown>) => {
      logger.info(`[${context}] ${message}`, meta);
    },
    debug: (message: string, meta?: Record<string, unknown>) => {
      logger.debug(`[${context}] ${message}`, meta);
    },
  };
}
