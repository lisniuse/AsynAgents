import winston from 'winston';

// 创建 logger 实例
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ level, message, timestamp, stack }) => {
      return `${timestamp} [${level.toUpperCase()}]: ${stack || message}`;
    })
  ),
  transports: [
    // 控制台输出
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    // 文件输出
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' })
  ]
});

// 测试不同级别的日志
console.log('=== 测试日志功能 ===\n');

logger.info('这是一条 INFO 级别的日志');
logger.warn('这是一条 WARN 级别的日志');
logger.error('这是一条 ERROR 级别的日志');
logger.debug('这是一条 DEBUG 级别的日志（可能不会显示，因为 level 设置为 info）');

// 测试带额外信息的日志
logger.info('用户登录', { userId: 12345, username: 'testuser', ip: '192.168.1.1' });

// 测试错误堆栈
try {
  throw new Error('测试错误');
} catch (error) {
  logger.error('捕获到异常', { error });
}

console.log('\n=== 日志测试完成 ===');
console.log('请检查 logs/ 目录下的日志文件');
