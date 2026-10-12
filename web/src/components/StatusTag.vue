<template>
  <el-tag :type="meta.type" effect="light" round size="small">{{ meta.label }}</el-tag>
</template>

<script setup>
import { computed } from 'vue';
import {
  ATTENDANCE_STATUS_LABELS, EMPLOYEE_STATUS_LABELS, LEAVE_STATUS_LABELS,
  ORG_STATUS_LABELS, PAYROLL_STATUS_LABELS, USER_STATUS_LABELS, labelOf,
} from '../utils/format.js';

const props = defineProps({ status: { type: String, default: '' }, kind: { type: String, default: 'employee' } });
const maps = {
  employee: EMPLOYEE_STATUS_LABELS,
  org: ORG_STATUS_LABELS,
  leave: LEAVE_STATUS_LABELS,
  payroll: PAYROLL_STATUS_LABELS,
  attendance: ATTENDANCE_STATUS_LABELS,
  user: USER_STATUS_LABELS,
};
const tagTypes = {
  ACTIVE: 'success', INACTIVE: 'info', LEFT: 'info', DRAFT: 'info',
  PENDING: 'warning', APPROVED: 'success', REJECTED: 'danger', CANCELLED: 'info',
  CONFIRMED: 'primary', PAID: 'success', NORMAL: 'success', ATTENTION: 'warning', DISABLED: 'info',
};
const meta = computed(() => ({ label: labelOf(maps[props.kind] || {}, props.status), type: tagTypes[props.status] || 'info' }));
</script>
