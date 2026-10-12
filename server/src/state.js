import { AppError } from './errors.js';

export const LEAVE_TRANSITIONS = Object.freeze({
  DRAFT: ['PENDING', 'CANCELLED'],
  PENDING: ['APPROVED', 'REJECTED', 'CANCELLED'],
  APPROVED: [],
  REJECTED: [],
  CANCELLED: [],
});

export const PAYROLL_TRANSITIONS = Object.freeze({
  DRAFT: ['CONFIRMED'],
  CONFIRMED: ['PAID'],
  PAID: [],
});

export const EMPLOYEE_TRANSITIONS = Object.freeze({
  ACTIVE: ['LEFT'],
  LEFT: [],
});

export function assertTransition(machine, current, target, label) {
  if (current === target) return;
  const allowed = machine[current] || [];
  if (!allowed.includes(target)) {
    throw new AppError(409, 'INVALID_STATE_TRANSITION', `${label}不能从“${current}”直接变为“${target}”`, {
      current,
      target,
      allowed,
    });
  }
}
