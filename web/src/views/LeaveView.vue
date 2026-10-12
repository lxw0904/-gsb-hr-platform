<template>
  <div class="page">
    <div class="page-heading">
      <div>
        <h1>请假申请</h1>
        <p>{{ auth.isEmployee ? '提交、跟踪和撤销你的请假申请。' : '查看全员请假记录，待审批申请也可在审批中心统一处理。' }}</p>
      </div>
      <div class="page-actions"><el-button plain @click="load" :loading="loading">刷新</el-button><el-button type="primary" @click="openForm()">发起请假</el-button></div>
    </div>

    <div class="content-card">
      <div class="toolbar">
        <el-input v-model="query.keyword" class="grow" clearable placeholder="搜索员工、工号或事由" @keyup.enter="search" />
        <el-select v-if="auth.canManage" v-model="query.departmentId" clearable placeholder="全部部门"><el-option v-for="item in departments" :key="item.id" :label="item.name" :value="item.id" /></el-select>
        <el-select v-model="query.status" clearable placeholder="全部状态"><el-option label="草稿" value="draft" /><el-option label="待审批" value="pending" /><el-option label="已通过" value="approved" /><el-option label="已驳回" value="rejected" /><el-option label="已撤销" value="cancelled" /></el-select>
        <el-select v-model="query.type" clearable placeholder="全部类型"><el-option v-for="(label, value) in leaveTypeLabels" :key="value" :label="label" :value="value" /></el-select>
        <el-date-picker v-model="query.month" type="month" value-format="YYYY-MM" clearable placeholder="申请月份" />
        <el-button type="primary" @click="search">查询</el-button><el-button @click="reset">重置</el-button>
      </div>
      <StatePanel v-if="error" title="请假记录加载失败" :description="error" retry @retry="load" />
      <template v-else>
        <div class="table-wrap">
          <el-table v-loading="loading" :data="rows" @sort-change="sortChange">
            <el-table-column prop="employee_name" label="员工" min-width="130" sortable><template #default="{ row }"><strong>{{ row.employee_name }}</strong><div class="muted">{{ row.employee_no }}</div></template></el-table-column>
            <el-table-column prop="type" label="请假类型" width="100"><template #default="{ row }">{{ leaveTypeLabels[row.type] || row.type }}</template></el-table-column>
            <el-table-column prop="start_time" label="开始时间" min-width="155" sortable><template #default="{ row }">{{ formatDate(row.start_time, true) }}</template></el-table-column>
            <el-table-column prop="end_time" label="结束时间" min-width="155"><template #default="{ row }">{{ formatDate(row.end_time, true) }}</template></el-table-column>
            <el-table-column prop="reason" label="事由" min-width="180" show-overflow-tooltip />
            <el-table-column prop="status" label="状态" width="100" sortable><template #default="{ row }"><el-tag :type="statusTypes[row.status]">{{ statusLabels[row.status] }}</el-tag></template></el-table-column>
            <el-table-column label="审批信息" min-width="150"><template #default="{ row }"><span v-if="row.approver_name">{{ row.approver_name }}<div class="muted">{{ row.approval_comment || '无备注' }}</div></span><span v-else class="muted">-</span></template></el-table-column>
            <el-table-column label="操作" width="230" fixed="right">
              <template #default="{ row }">
                <template v-if="row.status === 'draft'">
                  <el-button link type="primary" @click="openForm(row)">编辑</el-button><el-button link type="success" @click="submitDraft(row)">提交</el-button><el-button link type="danger" @click="removeDraft(row)">删除</el-button>
                </template>
                <el-button v-else-if="row.status === 'pending'" link type="warning" @click="cancelLeave(row)">撤销</el-button>
                <template v-else><span class="muted">已归档</span></template>
                <template v-if="auth.canManage && row.status === 'pending'">
                  <el-button link type="success" @click="openDecision(row, 'approve')">通过</el-button><el-button link type="danger" @click="openDecision(row, 'reject')">驳回</el-button>
                </template>
              </template>
            </el-table-column>
            <template #empty><StatePanel title="暂无请假记录" description="当前筛选条件下没有申请记录" /></template>
          </el-table>
        </div>
        <div class="pager"><el-pagination v-model:current-page="query.page" v-model:page-size="query.pageSize" layout="total, sizes, prev, pager, next" :total="total" :page-sizes="[10,20,50]" @current-change="load" @size-change="search" /></div>
      </template>
    </div>

    <el-dialog v-model="formVisible" :title="form.id ? '编辑请假草稿' : '发起请假申请'" width="580px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="90px">
        <el-form-item label="请假类型" prop="type"><el-select v-model="form.type" style="width:100%"><el-option v-for="(label, value) in leaveTypeLabels" :key="value" :label="label" :value="value" /></el-select></el-form-item>
        <el-form-item label="开始时间" prop="start_time"><el-date-picker v-model="form.start_time" type="datetime" value-format="YYYY-MM-DD HH:mm:ss" style="width:100%" /></el-form-item>
        <el-form-item label="结束时间" prop="end_time"><el-date-picker v-model="form.end_time" type="datetime" value-format="YYYY-MM-DD HH:mm:ss" style="width:100%" /></el-form-item>
        <el-form-item label="请假事由" prop="reason"><el-input v-model="form.reason" type="textarea" :rows="4" maxlength="300" show-word-limit /></el-form-item>
      </el-form>
      <template #footer><el-button @click="formVisible=false">取消</el-button><el-button :loading="saving" @click="save(false)">保存草稿</el-button><el-button type="primary" :loading="saving" @click="save(true)">提交审批</el-button></template>
    </el-dialog>

    <el-dialog v-model="decisionVisible" :title="decisionForm.decision === 'approve' ? '通过请假' : '驳回请假'" width="480px">
      <el-form label-width="80px"><el-form-item label="审批意见"><el-input v-model="decisionForm.comment" type="textarea" :rows="3" placeholder="可填写审批说明" /></el-form-item></el-form>
      <template #footer><el-button @click="decisionVisible=false">取消</el-button><el-button :type="decisionForm.decision === 'approve' ? 'success' : 'danger'" :loading="saving" @click="decide">确认{{ decisionForm.decision === 'approve' ? '通过' : '驳回' }}</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api } from '../api/http'
import { useAuthStore } from '../stores/auth'
import { formatDate, leaveTypeLabels, statusLabels, statusTypes } from '../utils/format'
import StatePanel from '../components/StatePanel.vue'

const auth = useAuthStore(); const rows = ref([]); const total = ref(0); const loading = ref(false); const saving = ref(false); const error = ref(''); const departments = ref([])
const query = reactive({ page: 1, pageSize: 10, keyword: '', departmentId: '', status: '', type: '', month: '', sortBy: 'created_at', sortOrder: 'desc' })
const formVisible = ref(false); const decisionVisible = ref(false); const formRef = ref()
const form = reactive({ id: null, type: 'annual', start_time: '', end_time: '', reason: '' })
const decisionForm = reactive({ id: null, decision: 'approve', comment: '' })
const rules = { type: [{ required: true, message: '请选择请假类型', trigger: 'change' }], start_time: [{ required: true, message: '请选择开始时间', trigger: 'change' }], end_time: [{ required: true, message: '请选择结束时间', trigger: 'change' }], reason: [{ required: true, message: '请填写请假事由', trigger: 'blur' }] }
async function load() { loading.value = true; error.value = ''; try { const data = await api.get('/leaves', query, { silent: true }); rows.value = data.list; total.value = data.total } catch (err) { error.value = err.message } finally { loading.value = false } }
function search() { query.page = 1; load() }
function reset() { Object.assign(query, { page: 1, pageSize: 10, keyword: '', departmentId: '', status: '', type: '', month: '', sortBy: 'created_at', sortOrder: 'desc' }); load() }
function sortChange({ prop, order }) { query.sortBy = prop || 'created_at'; query.sortOrder = order === 'ascending' ? 'asc' : 'desc'; search() }
function openForm(row) { Object.assign(form, row ? { id: row.id, type: row.type, start_time: row.start_time, end_time: row.end_time, reason: row.reason } : { id: null, type: 'annual', start_time: '', end_time: '', reason: '' }); formVisible.value = true }
async function save(submit) {
  try { await formRef.value.validate(); saving.value = true; const payload = { ...form, submit }; form.id ? await api.put(`/leaves/${form.id}`, payload) : await api.post('/leaves', payload); if (form.id && submit) await api.post(`/leaves/${form.id}/submit`, {}); ElMessage.success(submit ? '请假申请已提交' : '草稿已保存'); formVisible.value = false; await load() }
  catch (err) { if (err?.status) ElMessage.error(err.message) } finally { saving.value = false }
}
async function submitDraft(row) { try { await api.post(`/leaves/${row.id}/submit`, {}); ElMessage.success('请假申请已提交审批'); await load() } catch (err) { if (err?.status) ElMessage.error(err.message) } }
async function cancelLeave(row) { try { await ElMessageBox.confirm('确认撤销该请假申请吗？', '撤销申请', { type: 'warning' }); await api.post(`/leaves/${row.id}/cancel`, {}); ElMessage.success('申请已撤销'); await load() } catch (err) { if (err?.status) ElMessage.error(err.message) } }
async function removeDraft(row) { try { await ElMessageBox.confirm('确认删除这条请假草稿吗？', '删除草稿', { type: 'warning', confirmButtonText: '确认删除' }); await api.delete(`/leaves/${row.id}`, { confirm: true }); ElMessage.success('草稿已删除'); await load() } catch (err) { if (err?.status) ElMessage.error(err.message) } }
function openDecision(row, decision) { Object.assign(decisionForm, { id: row.id, decision, comment: '' }); decisionVisible.value = true }
async function decide() { try { saving.value = true; await api.post(`/leaves/${decisionForm.id}/decision`, decisionForm); ElMessage.success(decisionForm.decision === 'approve' ? '已通过' : '已驳回'); decisionVisible.value = false; await load() } catch (err) { if (err?.status) ElMessage.error(err.message) } finally { saving.value = false } }
onMounted(async () => { if (auth.canManage) { try { departments.value = await api.get('/org', null, { silent: true }) } catch {} } await load() })
</script>
