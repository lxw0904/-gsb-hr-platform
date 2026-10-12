const db = require('../lib/db');
const { seedDemoData } = require('../lib/seed');

(async () => {
  await db.ready();
  const created = await seedDemoData(false);
  console.log(created ? '演示数据库已初始化并写入演示数据。' : '数据库已存在数据，跳过初始化。');
})().catch((error) => {
  console.error('数据库初始化失败：', error.message);
  process.exit(1);
});
