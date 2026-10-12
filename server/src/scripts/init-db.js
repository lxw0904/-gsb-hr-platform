import { seedDemoData } from '../seed.js';
import { closeDatabase } from '../db.js';

const force = process.argv.includes('--force');
const seeded = seedDemoData({ force });
console.log(seeded ? '数据库已初始化并写入演示数据。' : '数据库已有数据，如需重置请执行 npm run reset-db。');
closeDatabase();
