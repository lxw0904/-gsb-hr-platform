const path = require('path');

module.exports = {
  port: Number(process.env.PORT || 3000),
  jwtSecret: process.env.JWT_SECRET || 'gsb-hr-local-development-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
  dbPath: process.env.DB_PATH || path.join(__dirname, '..', 'data', 'hr.sqlite'),
  demoResetToken: process.env.DEMO_RESET_TOKEN || 'RESET',
  bcryptRounds: 12,
  isProduction: process.env.NODE_ENV === 'production'
};
