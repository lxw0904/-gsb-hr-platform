import { db } from './db.js';
import { jsonStringify } from './utils.js';

export function writeAudit(req, action, targetType, targetId, detail = {}) {
  const actor = req.user;
  const ip = req.ip || req.socket?.remoteAddress || '';
  db.prepare(`
    INSERT INTO audit_logs (user_id, username, role, action, target_type, target_id, detail, ip)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    actor?.id || null,
    actor?.username || 'system',
    actor?.role || 'SYSTEM',
    action,
    targetType,
    targetId == null ? null : String(targetId),
    jsonStringify(detail),
    ip,
  );
}
