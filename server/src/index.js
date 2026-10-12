import { createApp } from './app.js';
import { config } from './config.js';
import { closeDatabase } from './db.js';
import { seedDemoData } from './seed.js';

seedDemoData();
const app = createApp();
const server = app.listen(config.port, '127.0.0.1', () => {
  console.log(`HR API 已启动：http://127.0.0.1:${config.port}`);
  console.log(`SQLite 数据文件：${config.dbFile}`);
});

function shutdown(signal) {
  console.log(`\n收到 ${signal}，正在关闭服务...`);
  server.close(() => {
    closeDatabase();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
