import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, '..');

export const config = {
  port: Number(process.env.PORT || 3000),
  dbFile: process.env.DB_FILE || path.join(serverRoot, 'data', 'hr.sqlite'),
  jwtSecret: process.env.JWT_SECRET || 'gsb-hr-local-demo-secret-change-in-production',
  tokenExpiresIn: process.env.TOKEN_EXPIRES_IN || '8h',
  appSecret: process.env.APP_SECRET || 'gsb-hr-local-sensitive-field-key',
  isProduction: process.env.NODE_ENV === 'production',
};
