<template>
  <div class="page">
    <div class="page-heading">
      <div>
        <h1>考勤管理</h1>
        <p>{{ auth.isEmployee ? '查看你的每日考勤明细与月度汇总。' : '按月查看员工考勤，补充或修正异常记录。' }}</p>
      </div>
      <div class="page-actions">
        <el-button plain @click="loadAll" :loading="loading || summaryLoading">刷新</el-button>
        <el-button v-if="auth.canManage" type="primary" @click="openForm()">补录考勤</el-button>
      </div>
    </div>

    <div class="content-card">
      <el-tabs v-model="tab" @tab-change="loadAll">
        <el-tab-pane label="考勤明细" name="detail">
          <div class="toolbar">
            <el-date-picker v-model="query.month" type="month" value-format="YYYY-MM" placeholder="选择月份" @change="search" />
            <el-select v-if="auth.canManage" v-model="query.departmentId" clearable placeholder="全部部门"><el-option v-for="item in departments" :key="item.id" :label="item.name" :value="item.id" /></el-select>
            <el-select v-model="query.status" clearable placeholder="全部考勤状态">
              <el-option label="正常" value="normal" /><el-option label="迟到" value="late" /><el-option label="早退" value="early_leave" /><el-option label="缺勤" value="absent" /><el-option label="请假" value="leave" /><el-option label="加班" value="overtime" />
            </el-select>
            <el-input v-model="query.keyword" class="grow" clearable placeholder="搜索员工或备注" @keyup.enter="search" />
            <el-button type="primary" @click="search">查询</el-button>
            <el-button @click="resetQuery">重置</el-button>
          </div>
          <StatePanel v-if="error" title="考勤记录加载失败" :description="error" retry @retry="load" />
          <template v-else>
            <div class="table-wrap">
              <el-table v-loading="loading" :data="rows" @sort-change="sortChange">
                <el-table-column prop="work_date" label="日期" width="120" sortable />
                <el-table-column prop="employee_name" label="员工" min-width="140" sortable><template #default="{ row }"><strong>{{ row.employee_name }}</strong><div class="muted">{{ row.employee_no }}</div></template></el-table-column>
                <el-table-column prop="department_name" label="部门" min-width="130" />
                <el-table-column prop="check_in" label="上班打卡" width="110" sortable />
                <el-table-column prop="check_out" label="下班打卡" width="110" />
                <el-table-column prop="status" label="状态" width="100" sortable><template #default="{ row }"><el-tag :type="statusTypes[row.status]">{{ statusLabels[row.status] }}</el-tag></template></el-table-column>
                <el-table-column prop="overtime_hours" label="加班时长" width="100" sortable><template #default="{ row }">{{ row.overtime_hours ? `${row.overtime_hours} h` : '-' }}</template></el-table-column>
                <el-table-column prop="remark" label="备注" min-width="150" show-overflow-tooltip />
                <el-table-column v-if="auth.canManage" label="操作" width="90" fixed="right"><template #default="{ row }"><el-button link type="primary" @click="openForm(row)">编辑</el-button></template></el-table-column>
                <template #empty><StatePanel title="暂无考勤记录" description="当前月份和筛选条件下没有记录" /></template>
              </el-table>
            </div>
            <div class="pager"><el-pagination v-model:current-page="query.page" v-model:page-size="query.pageSize" layout="total, sizes, prev, pager, next" :total="total" :page-sizes="[10, 20, 50]" @current-change="load" @size-change="search" /></div>
          </template>
        </el-tab-pane>

        <el-tab-pane label="月度汇总" name="summary">
          <div class="toolbar">
            <el-date-picker v-model="summaryQuery.month" type="month" value-format="YYYY-MM" placeholder="选择月份" @change="loadSummary" />
            <el-select v-if="auth.canManage" v-model="summaryQuery.departmentId" clearable placeholder="全部部门" @change="loadSummary"><el-option v-for="item in departments" :key="item.id" :label="item.name" :value="item.id" /></el-select>
            <span class="grow"></span>
          </div>
          <StatePanel v-if="summaryError" title="考勤汇总加载失败" :description="summaryError" retry @retry="loadSummary" />
          <template v-else>
            <div class="table-wrap">
              <el-table v-loading="summaryLoading" :data="pagedSummary" @sort-change="sortSummary">
                <el-table-column prop="employee_no" label="工号" width="110" sortable />
                <el-table-column prop="employee_name" label="员工" min-width="130" sortable />
                <el-table-column prop="department_name" label="部门" min-width="130" />
                <el-table-column prop="total_days" label="出勤记录" width="100" sortable align="center" />
                <el-table-column prop="normal_days" label="正常" width="90" sortable align="center" />
                <el-table-column prop="late_days" label="迟到" width="90" sortable align="center" />
                <el-table-column prop="absent_days" label="缺勤" width="90" sortable align="center" />
                <el-table-column prop="leave_days" label="请假" width="90" sortable align="center" />
                <el-table-column prop="overtime_hours" label="加班" width="90" sortable align="center"><template #default="{ row }">{{ row.overtime_hours || 0 }} h</template></el-table-column>
                <template #empty><StatePanel title="暂无汇总数据" description="当前月份没有可统计的考勤数据" /></template>
              </el-table>
            </div>
            <div class="pager"><el-pagination v-model:current-page="summaryPage" :page-size="10" layout="total, prev, pager, next" :total="summaryRows.length" /></div>
          </template>
        </el-tab-pane>
      </el-tabs>
    </div>

    <el-dialog v-model="formVisible" :title="form.id ? '修正考勤记录' : '补录考勤记录'" width="520px">
      <el-form :model="form" label-width="90px">
        <el-form-item label="员工"><el-select v-model="form.employee_id" filterable :disabled="Boolean(form.id)"><el-option v-for="item in employees" :key="item.id" :label="`${item.name}（${item.employee_no}）`" :value="item.id" /></el-select></el-form-item>
        <el-form-item label="日期"><el-date-picker v-model="form.work_date" type="date" value-format="YYYY-MM-DD" :disabled="Boolean(form.id)" /></el-form-item>
        <el-form-item label="状态"><el-select v-model="form.status"><el-option label="正常" value="normal" /><el-option label="迟到" value="late" /><el-option label="早退" value="early_leave" /><el-option label="缺勤" value="absent" /><el-option label="请假" value="leave" /><el-option label="加班" value="overtime" /></el-select></el-form-item>
        <el-form-item label="上班打卡"><el-input v-model="form.check_in" placeholder="09:00" /></el-form-item>
        <el-form-item label="下班打卡"><el-input v-model="form.check_out" placeholder="18:00" /></el-form-item>
        <el-form-item label="加班时长"><el-input-number v-model="form.overtime_hours" :min="0" :max="24" :step="0.5" /></el-form-item>
        <el-form-item label="备注"><el-input v-model="form.remark" type="textarea" :rows="2" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="formVisible=false">取消</el-button><el-button type="primary" :loading="saving" @click="save">保存</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { api } from '../api/http'
import { useAuthStore } from '../stores/auth'
import { statusLabels, statusTypes } from '../utils/format'
import StatePanel from '../components/StatePanel.vue'

const auth = useAuthStore()
const tab = ref('detail'); const rows = ref([]); const total = ref(0); const loading = ref(false); const error = ref('')
const summaryRows = ref([]); const summaryLoading = ref(false); const summaryError = ref('')
const departments = ref([]); const employees = ref([]); const saving = ref(false); const formVisible = ref(false)
const currentMonth = new Date().toISOString().slice(0, 7)
const query = reactive({ page: 1, pageSize: 20, month: currentMonth, status: '', departmentId: '', keyword: '', sortBy: 'work_date', sortOrder: 'desc' })
const summaryQuery = reactive({ month: currentMonth, departmentId: '' })
const sortState = reactive({ prop: 'employee_no', order: 'ascending' })
const summaryPage = ref(1)
const form = reactive({ id: null, employee_id: null, work_date: '', status: 'normal', check_in: '', check_out: '', overtime_hours: 0, remark: '' })
const pagedSummary = computed(() => {
  const list = [...summaryRows.value].sort((a, b) => {
    const dir = sortState.order === 'ascending' ? 1 : -1
    const left = a[sortState.prop] ?? ''; const right = b[sortState.prop] ?? ''
    return (typeof left === 'number' ? left - right : String(left).localeCompare(String(right), 'zh-CN')) * dir
  })
  return list.slice((summaryPage.value - 1) * 10, summaryPage.value * 10)
})
async function load() { loading.value = true; error.value = ''; try { const data = await api.get('/attendance', query, { silent: true }); rows.value = data.list; total.value = data.total } catch (err) { error.value = err.message } finally { loading.value = false } }
async function loadSummary() { summaryLoading.value = true; summaryError.value = ''; try { summaryRows.value = await api.get('/attendance/summary', summaryQuery, { silent: true }) } catch (err) { summaryError.value = err.message } finally { summaryLoading.value = false } }
async function loadAll() { tab.value === 'detail' ? await load() : await loadSummary() }
function search() { query.page = 1; load() }
function resetQuery() { Object.assign(query, { page: 1, pageSize: 20, month: currentMonth, status: '', departmentId: '', keyword: '', sortBy: 'work_date', sortOrder: 'desc' }); load() }
function sortChange({ prop, order }) { query.sortBy = prop || 'work_date'; query.sortOrder = order === 'ascending' ? 'asc' : 'desc'; search() }
function sortSummary({ prop, order }) { sortState.prop = prop || 'employee_no'; sortState.order = order || 'ascending'; summaryPage.value = 1 }
function openForm(row) { Object.assign(form, row ? { id: row.id, employee_id: row.employee_id, work_date: row.work_date, status: row.status, check_in: row.check_in || '', check_out: row.check_out || '', overtime_hours: Number(row.overtime_hours || 0), remark: row.remark || '' } : { id: null, employee_id: null, work_date: new Date().toISOString().slice(0,10), status: 'normal', check_in: '', check_out: '', overtime_hours: 0, remark: '' }); formVisible.value = true }
async function save() {
  if (!form.employee_id || !form.work_date) return ElMessage.warning('请选择员工和日期')
  try { saving.value = true; form.id ? await api.put(`/attendance/${form.id}`, form) : await api.post('/attendance', form); ElMessage.success('考勤记录已保存'); formVisible.value = false; await load() }
  catch (err) { if (err?.status) ElMessage.error(err.message) } finally { saving.value = false }
}
onMounted(async () => {
  try { departments.value = await api.get('/org', null, { silent: true }) } catch {}
  if (auth.canManage) { try { const data = await api.get('/employees', { page: 1, pageSize: 100, sortBy: 'employee_no', sortOrder: 'asc' }, { silent: true }); employees.value = data.list } catch {} }
  await Promise.all([load(), loadSummary()])
})
</script>
