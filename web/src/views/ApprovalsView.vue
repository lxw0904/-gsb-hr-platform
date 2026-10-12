<template>
  <div class="page">
    <div class="page-heading">
      <div>
        <h1>审批中心</h1>
        <p>集中处理请假、转正、调岗与调薪申请；所有状态流转和批量操作均写入审计日志。</p>
      </div>
      <div class="page-actions">
        <el-button plain @click="load" :loading="loading">刷新</el-button>
        <el-button plain @click="openFlow">发起转正/调岗</el-button>
        <el-button type="primary" @click="openSalary">发起调薪</el-button>
      </div>
    </div>

    <div class="content-card">
      <el-tabs v-model="tab" @tab-change="onTabChange">
        <el-tab-pane label="请假审批" name="leave" />
        <el-tab-pane label="转正 / 调岗" name="flow" />
        <el-tab-pane label="调薪审批" name="salary" />
      </el-tabs>

      <div class="toolbar">
        <el-input v-model="query.keyword" class="grow" clearable placeholder="搜索员工、工号或申请原因" @keyup.enter="search" />
        <el-select v-model="query.departmentId" clearable placeholder="全部部门"><el-option v-for="item in departments" :key="item.id" :label="item.name" :value="item.id" /></el-select>
        <el-select v-if="tab === 'flow'" v-model="query.type" clearable placeholder="全部流程"><el-option label="转正" value="regularization" /><el-option label="调岗" value="transfer" /></el-select>
        <el-select v-model="query.status" clearable placeholder="全部状态"><el-option label="待审批" value="pending" /><el-option label="已通过" value="approved" /><el-option label="已驳回" value="rejected" /></el-select>
        <el-button type="primary" @click="search">查询</el-button><el-button @click="reset">重置</el-button>
      </div>

      <div v-if="tab === 'leave' && selectedRows.length" class="batch-bar">
        <span>已选择 {{ selectedRows.length }} 条待审批记录</span>
        <el-button size="small" type="success" @click="batchDecision('approve')">批量通过</el-button>
        <el-button size="small" type="danger" @click="batchDecision('reject')">批量驳回</el-button>
      </div>

      <StatePanel v-if="error" title="审批数据加载失败" :description="error" retry @retry="load" />
      <template v-else>
        <div class="table-wrap">
          <el-table v-loading="loading" :data="rows" @sort-change="sortChange" @selection-change="selectedRows = $event">
            <el-table-column v-if="tab === 'leave'" type="selection" width="48" :selectable="(row) => row.status === 'pending'" />
            <el-table-column label="申请人" min-width="130"><template #default="{ row }"><strong>{{ row.employee_name }}</strong><div class="muted">{{ row.employee_no }}</div></template></el-table-column>
            <el-table-column v-if="tab === 'leave'" label="类型 / 时间" min-width="230">
              <template #default="{ row }"><el-tag effect="plain">{{ leaveTypeLabels[row.type] || row.type }}</el-tag><div class="cell-detail">{{ formatDate(row.start_time, true) }}<br />至 {{ formatDate(row.end_time, true) }}</div></template>
            </el-table-column>
            <el-table-column v-if="tab === 'flow'" label="流程类型" width="110"><template #default="{ row }"><el-tag :type="row.type === 'regularization' ? 'success' : 'primary'">{{ statusLabels[row.type] }}</el-tag></template></el-table-column>
            <el-table-column v-if="tab === 'flow'" label="变更内容" min-width="230"><template #default="{ row }"><div v-if="row.type === 'transfer'">{{ row.from_department_name }} / {{ row.from_position_name }} <strong>→</strong> {{ row.to_department_name }} / {{ row.to_position_name }}</div><div v-else>试用期转正<br /><span class="muted">生效日期 {{ row.effective_date }}</span></div></template></el-table-column>
            <el-table-column v-if="tab === 'salary'" label="当前工资" width="130" align="right"><template #default="{ row }">{{ formatMoney(row.old_salary) }}</template></el-table-column>
            <el-table-column v-if="tab === 'salary'" label="调整后" width="130" align="right"><template #default="{ row }"><strong class="money">{{ formatMoney(row.new_salary) }}</strong></template></el-table-column>
            <el-table-column prop="reason" label="申请原因" min-width="180" show-overflow-tooltip />
            <el-table-column prop="effective_date" v-if="tab !== 'leave'" label="生效日期" width="120" sortable />
            <el-table-column prop="status" label="状态" width="100" sortable><template #default="{ row }"><el-tag :type="statusTypes[row.status]">{{ statusLabels[row.status] }}</el-tag></template></el-table-column>
            <el-table-column prop="created_at" label="提交时间" width="160" sortable><template #default="{ row }">{{ formatDate(row.created_at, true) }}</template></el-table-column>
            <el-table-column label="操作" width="145" fixed="right">
              <template #default="{ row }">
                <template v-if="row.status === 'pending'"><el-button link type="success" @click="openDecision(row, 'approve')">通过</el-button><el-button link type="danger" @click="openDecision(row, 'reject')">驳回</el-button></template>
                <span v-else class="muted">{{ row.approver_name || '-' }}</span>
              </template>
            </el-table-column>
            <template #empty><StatePanel title="暂无审批记录" description="当前模块没有符合筛选条件的申请" /></template>
          </el-table>
        </div>
        <div class="pager"><el-pagination v-model:current-page="query.page" v-model:page-size="query.pageSize" layout="total, sizes, prev, pager, next" :total="total" :page-sizes="[10,20,50]" @current-change="load" @size-change="search" /></div>
      </template>
    </div>

    <el-dialog v-model="decisionVisible" :title="decisionTitle" width="500px">
      <el-alert v-if="tab === 'salary' && decisionForm.decision === 'approve'" title="审批通过会立即修改员工基本工资，请在确认前核对金额。" type="warning" :closable="false" show-icon />
      <el-form label-width="90px" style="margin-top:16px">
        <el-form-item label="审批意见"><el-input v-model="decisionForm.comment" type="textarea" :rows="3" :placeholder="decisionForm.decision === 'reject' ? '请说明驳回原因' : '可填写审批说明'" /></el-form-item>
        <el-form-item v-if="tab === 'salary' && decisionForm.decision === 'approve'" label="二次确认"><el-checkbox v-model="decisionForm.confirm">我已核对调薪金额及生效日期</el-checkbox></el-form-item>
      </el-form>
      <template #footer><el-button @click="decisionVisible=false">取消</el-button><el-button :type="decisionForm.decision === 'approve' ? 'success' : 'danger'" :disabled="tab === 'salary' && decisionForm.decision === 'approve' && !decisionForm.confirm" :loading="saving" @click="decide">确认{{ decisionForm.decision === 'approve' ? '通过' : '驳回' }}</el-button></template>
    </el-dialog>

    <el-dialog v-model="flowVisible" title="发起转正 / 调岗流程" width="580px">
      <el-form :model="flowForm" label-width="100px">
        <el-form-item label="流程类型"><el-radio-group v-model="flowForm.type"><el-radio-button value="regularization">转正</el-radio-button><el-radio-button value="transfer">调岗</el-radio-button></el-radio-group></el-form-item>
        <el-form-item label="员工"><el-select v-model="flowForm.employee_id" filterable><el-option v-for="item in employees" :key="item.id" :label="`${item.name}（${item.employee_no}）`" :value="item.id" /></el-select></el-form-item>
        <template v-if="flowForm.type === 'transfer'">
          <el-form-item label="目标部门"><el-select v-model="flowForm.to_department_id" @change="flowForm.to_position_id=null"><el-option v-for="item in departments" :key="item.id" :label="item.name" :value="item.id" /></el-select></el-form-item>
          <el-form-item label="目标职位"><el-select v-model="flowForm.to_position_id"><el-option v-for="item in targetPositions" :key="item.id" :label="item.name" :value="item.id" /></el-select></el-form-item>
        </template>
        <el-form-item label="生效日期"><el-date-picker v-model="flowForm.effective_date" type="date" value-format="YYYY-MM-DD" /></el-form-item>
        <el-form-item label="申请原因"><el-input v-model="flowForm.reason" type="textarea" :rows="3" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="flowVisible=false">取消</el-button><el-button type="primary" :loading="saving" @click="submitFlow">提交审批</el-button></template>
    </el-dialog>

    <el-dialog v-model="salaryVisible" title="发起调薪申请" width="560px">
      <el-form :model="salaryForm" label-width="100px">
        <el-form-item label="员工"><el-select v-model="salaryForm.employee_id" filterable @change="syncCurrentSalary"><el-option v-for="item in employees" :key="item.id" :label="`${item.name}（${item.employee_no}）`" :value="item.id" /></el-select></el-form-item>
        <el-form-item label="当前基本工资"><el-input :model-value="formatMoney(currentEmployee?.base_salary || 0)" disabled /></el-form-item>
        <el-form-item label="调整后工资"><el-input-number v-model="salaryForm.new_salary" :min="0" :step="500" /></el-form-item>
        <el-form-item label="生效日期"><el-date-picker v-model="salaryForm.effective_date" type="date" value-format="YYYY-MM-DD" /></el-form-item>
        <el-form-item label="调薪原因"><el-input v-model="salaryForm.reason" type="textarea" :rows="3" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="salaryVisible=false">取消</el-button><el-button type="primary" :loading="saving" @click="submitSalary">提交审批</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api } from '../api/http'
import { formatDate, formatMoney, leaveTypeLabels, statusLabels, statusTypes } from '../utils/format'
import StatePanel from '../components/StatePanel.vue'

const tab = ref('leave'); const rows = ref([]); const total = ref(0); const loading = ref(false); const saving = ref(false); const error = ref('')
const departments = ref([]); const positions = ref([]); const employees = ref([]); const selectedRows = ref([])
const decisionVisible = ref(false); const flowVisible = ref(false); const salaryVisible = ref(false)
const query = reactive({ page: 1, pageSize: 10, keyword: '', departmentId: '', status: 'pending', type: '', sortBy: 'created_at', sortOrder: 'desc' })
const decisionForm = reactive({ id: null, decision: 'approve', comment: '', confirm: false })
const flowForm = reactive({ type: 'regularization', employee_id: null, to_department_id: null, to_position_id: null, effective_date: '', reason: '' })
const salaryForm = reactive({ employee_id: null, new_salary: 0, effective_date: '', reason: '' })
const endpoint = computed(() => tab.value === 'leave' ? '/leaves' : tab.value === 'flow' ? '/approvals/flows' : '/approvals/salary-adjustments')
const targetPositions = computed(() => positions.value.filter((item) => Number(item.department_id) === Number(flowForm.to_department_id)))
const currentEmployee = computed(() => employees.value.find((item) => item.id === salaryForm.employee_id))
const decisionTitle = computed(() => `${decisionForm.decision === 'approve' ? '通过' : '驳回'}${tab.value === 'leave' ? '请假' : tab.value === 'flow' ? '人事流程' : '调薪'}申请`)
async function load() {
  loading.value = true; error.value = ''; selectedRows.value = []
  try { const data = await api.get(endpoint.value, query, { silent: true }); rows.value = data.list; total.value = data.total } catch (err) { error.value = err.message } finally { loading.value = false }
}
function search() { query.page = 1; load() }
function reset() { Object.assign(query, { page: 1, pageSize: 10, keyword: '', departmentId: '', status: 'pending', type: '', sortBy: 'created_at', sortOrder: 'desc' }); load() }
function onTabChange() { Object.assign(query, { page: 1, status: 'pending', type: '' }); load() }
function sortChange({ prop, order }) { query.sortBy = prop || 'created_at'; query.sortOrder = order === 'ascending' ? 'asc' : 'desc'; search() }
function openDecision(row, decision) { Object.assign(decisionForm, { id: row.id, decision, comment: '', confirm: false }); decisionVisible.value = true }
async function decide() {
  if (decisionForm.decision === 'reject' && !decisionForm.comment.trim()) return ElMessage.warning('驳回时请填写原因')
  try {
    saving.value = true
    if (tab.value === 'leave') await api.post(`/leaves/${decisionForm.id}/decision`, decisionForm)
    else if (tab.value === 'flow') await api.post(`/approvals/flows/${decisionForm.id}/decision`, decisionForm)
    else await api.post(`/approvals/salary-adjustments/${decisionForm.id}/decision`, decisionForm)
    ElMessage.success(decisionForm.decision === 'approve' ? '审批已通过' : '审批已驳回'); decisionVisible.value = false; await load()
  } catch (err) { if (err?.status) ElMessage.error(err.message) } finally { saving.value = false }
}
async function batchDecision(decision) {
  if (decision === 'reject') {
    const result = await ElMessageBox.prompt('请输入批量驳回原因', '批量驳回', { inputValidator: (value) => Boolean(value?.trim()) || '请填写原因', type: 'warning' }).catch(() => null)
    if (!result) return; return runBatch(decision, result.value)
  }
  try { await ElMessageBox.confirm(`确认通过选中的 ${selectedRows.value.length} 条请假申请吗？`, '批量审批', { type: 'warning' }); await runBatch(decision, '') } catch {}
}
async function runBatch(decision, comment) { try { saving.value = true; await api.post('/leaves/batch-decision', { ids: selectedRows.value.map((item) => item.id), decision, comment }); ElMessage.success('批量审批已完成'); await load() } catch (err) { if (err?.status) ElMessage.error(err.message) } finally { saving.value = false } }
function openFlow() { Object.assign(flowForm, { type: 'regularization', employee_id: null, to_department_id: null, to_position_id: null, effective_date: new Date().toISOString().slice(0,10), reason: '' }); flowVisible.value = true }
async function submitFlow() {
  if (!flowForm.employee_id || !flowForm.effective_date || !flowForm.reason) return ElMessage.warning('请完整填写流程信息')
  if (flowForm.type === 'transfer' && (!flowForm.to_department_id || !flowForm.to_position_id)) return ElMessage.warning('请选择目标部门和职位')
  try { saving.value = true; await api.post('/approvals/flows', flowForm); ElMessage.success('流程已提交审批'); flowVisible.value = false; tab.value = 'flow'; await load() } catch (err) { if (err?.status) ElMessage.error(err.message) } finally { saving.value = false }
}
function openSalary() { Object.assign(salaryForm, { employee_id: null, new_salary: 0, effective_date: new Date().toISOString().slice(0,10), reason: '' }); salaryVisible.value = true }
function syncCurrentSalary() { salaryForm.new_salary = Number(currentEmployee.value?.base_salary || 0) }
async function submitSalary() {
  if (!salaryForm.employee_id || !salaryForm.effective_date || !salaryForm.reason || !salaryForm.new_salary) return ElMessage.warning('请完整填写调薪信息')
  try { saving.value = true; await api.post('/approvals/salary-adjustments', salaryForm); ElMessage.success('调薪申请已提交审批'); salaryVisible.value = false; tab.value = 'salary'; await load() } catch (err) { if (err?.status) ElMessage.error(err.message) } finally { saving.value = false }
}
onMounted(async () => {
  try {
    const [deptData, posData, empData] = await Promise.all([api.get('/org', null, { silent: true }), api.get('/org/positions/list', null, { silent: true }), api.get('/employees', { page: 1, pageSize: 100, sortBy: 'employee_no', sortOrder: 'asc' }, { silent: true })])
    departments.value = deptData; positions.value = posData; employees.value = empData.list
  } catch {}
  await load()
})
</script>

<style scoped>
.batch-bar { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; padding: 10px 14px; border: 1px solid #dbe7ff; border-radius: 10px; background: #f3f7ff; color: #35517d; }
.batch-bar span { margin-right: auto; font-size: 13px; }
.cell-detail { margin-top: 5px; color: #718096; font-size: 11px; line-height: 1.55; }
</style>
