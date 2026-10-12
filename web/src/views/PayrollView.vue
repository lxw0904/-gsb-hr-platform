<template>
  <div class="page">
    <div class="page-heading">
      <div>
        <h1>薪酬管理</h1>
        <p>{{ auth.isEmployee ? '查看已发放的个人工资条明细。' : '生成月度工资单、维护薪资项目并完成发放。' }}</p>
      </div>
      <div class="page-actions"><el-button plain @click="load" :loading="loading">刷新</el-button><el-button v-if="auth.canManage" type="primary" @click="generateVisible=true">生成月度工资单</el-button></div>
    </div>

    <div class="content-card">
      <div class="toolbar">
        <el-date-picker v-model="query.month" type="month" value-format="YYYY-MM" clearable placeholder="工资月份" />
        <el-select v-if="auth.canManage" v-model="query.departmentId" clearable placeholder="全部部门"><el-option v-for="item in departments" :key="item.id" :label="item.name" :value="item.id" /></el-select>
        <el-select v-if="auth.canManage" v-model="query.status" clearable placeholder="全部状态"><el-option label="草稿" value="draft" /><el-option label="已发放" value="issued" /></el-select>
        <el-input v-model="query.keyword" class="grow" clearable placeholder="搜索员工姓名或工号" @keyup.enter="search" />
        <el-button type="primary" @click="search">查询</el-button><el-button @click="reset">重置</el-button>
      </div>
      <StatePanel v-if="error" title="工资单加载失败" :description="error" retry @retry="load" />
      <template v-else>
        <div class="table-wrap">
          <el-table v-loading="loading" :data="rows" @sort-change="sortChange">
            <el-table-column prop="month" label="月份" width="100" sortable />
            <el-table-column prop="employee_name" label="员工" min-width="130" sortable><template #default="{ row }"><strong>{{ row.employee_name }}</strong><div class="muted">{{ row.employee_no }}</div></template></el-table-column>
            <el-table-column prop="department_name" label="部门" min-width="120" />
            <el-table-column prop="base_salary" label="基本工资" width="125" align="right" sortable><template #default="{ row }">{{ formatMoney(row.base_salary) }}</template></el-table-column>
            <el-table-column prop="performance_bonus" label="绩效" width="110" align="right"><template #default="{ row }">{{ formatMoney(row.performance_bonus) }}</template></el-table-column>
            <el-table-column prop="social_insurance" label="社保" width="105" align="right"><template #default="{ row }">{{ formatMoney(row.social_insurance) }}</template></el-table-column>
            <el-table-column prop="tax" label="个税" width="105" align="right"><template #default="{ row }">{{ formatMoney(row.tax) }}</template></el-table-column>
            <el-table-column prop="net_salary" label="实发工资" width="135" align="right" sortable><template #default="{ row }"><span class="money net">{{ formatMoney(row.net_salary) }}</span></template></el-table-column>
            <el-table-column prop="status" label="状态" width="95" sortable><template #default="{ row }"><el-tag :type="statusTypes[row.status]">{{ statusLabels[row.status] }}</el-tag></template></el-table-column>
            <el-table-column label="操作" :width="auth.canManage ? 190 : 90" fixed="right">
              <template #default="{ row }">
                <el-button link type="primary" @click="openDetail(row)">明细</el-button>
                <template v-if="auth.canManage && row.status === 'draft'"><el-button link type="warning" @click="openEdit(row)">编辑</el-button><el-button link type="success" @click="issue(row)">发放</el-button><el-button link type="danger" @click="remove(row)">删除</el-button></template>
              </template>
            </el-table-column>
            <template #empty><StatePanel title="暂无工资单" :description="auth.canManage ? '请先生成月度工资单' : '当前没有已发放工资单'" /></template>
          </el-table>
        </div>
        <div class="pager"><el-pagination v-model:current-page="query.page" v-model:page-size="query.pageSize" layout="total, sizes, prev, pager, next" :total="total" :page-sizes="[10,20,50]" @current-change="load" @size-change="search" /></div>
      </template>
    </div>

    <el-dialog v-model="generateVisible" title="生成月度工资单" width="480px">
      <el-alert title="系统将按员工基本工资自动计算绩效、社保、公积金、个税和实发工资。已存在月份会跳过。" type="info" :closable="false" />
      <el-form label-width="90px" style="margin-top:18px">
        <el-form-item label="工资月份"><el-date-picker v-model="generateForm.month" type="month" value-format="YYYY-MM" :clearable="false" /></el-form-item>
        <el-form-item label="指定部门"><el-select v-model="generateForm.departmentId" clearable placeholder="全部部门"><el-option v-for="item in departments" :key="item.id" :label="item.name" :value="item.id" /></el-select></el-form-item>
      </el-form>
      <template #footer><el-button @click="generateVisible=false">取消</el-button><el-button type="primary" :loading="saving" @click="generate">生成工资单</el-button></template>
    </el-dialog>

    <el-dialog v-model="editVisible" title="维护工资单" width="680px">
      <el-alert title="薪资数据属于敏感信息，保存时必须二次确认，系统会记录修改前后内容。" type="warning" :closable="false" show-icon />
      <div class="payroll-form">
        <el-form label-width="90px">
          <el-form-item label="基本工资"><el-input-number v-model="editForm.base_salary" :min="0" :step="500" /></el-form-item>
          <el-form-item label="绩效奖金"><el-input-number v-model="editForm.performance_bonus" :min="0" :step="100" /></el-form-item>
          <el-form-item label="岗位津贴"><el-input-number v-model="editForm.allowance" :min="0" :step="100" /></el-form-item>
          <el-form-item label="社保"><el-input-number v-model="editForm.social_insurance" :min="0" :step="100" /></el-form-item>
          <el-form-item label="公积金"><el-input-number v-model="editForm.housing_fund" :min="0" :step="100" /></el-form-item>
        </el-form>
        <div class="estimate"><span>个税与实发工资将在保存时自动重算</span><strong>实发预览 {{ formatMoney(previewNet) }}</strong></div>
      </div>
      <el-checkbox v-model="editForm.confirm">我已核对数据，并确认执行本次修改</el-checkbox>
      <template #footer><el-button @click="editVisible=false">取消</el-button><el-button type="primary" :disabled="!editForm.confirm" :loading="saving" @click="saveEdit">确认保存</el-button></template>
    </el-dialog>

    <el-drawer v-model="detailVisible" title="工资条明细" size="440px">
      <div v-if="detailRow" class="payslip">
        <div class="payslip-head"><div><span>工资月份</span><strong>{{ detailRow.month }}</strong></div><div><span>员工</span><strong>{{ detailRow.employee_name }}</strong></div></div>
        <div class="payslip-row"><span>基本工资</span><strong>{{ formatMoney(detailRow.base_salary) }}</strong></div>
        <div class="payslip-row"><span>绩效奖金</span><strong>{{ formatMoney(detailRow.performance_bonus) }}</strong></div>
        <div class="payslip-row"><span>岗位津贴</span><strong>{{ formatMoney(detailRow.allowance) }}</strong></div>
        <div class="payslip-sep"></div>
        <div class="payslip-row deduction"><span>社保扣款</span><strong>- {{ formatMoney(detailRow.social_insurance) }}</strong></div>
        <div class="payslip-row deduction"><span>公积金扣款</span><strong>- {{ formatMoney(detailRow.housing_fund) }}</strong></div>
        <div class="payslip-row deduction"><span>个人所得税</span><strong>- {{ formatMoney(detailRow.tax) }}</strong></div>
        <div class="payslip-total"><span>实发工资</span><strong>{{ formatMoney(detailRow.net_salary) }}</strong></div>
      </div>
    </el-drawer>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api } from '../api/http'
import { useAuthStore } from '../stores/auth'
import { formatMoney, statusLabels, statusTypes } from '../utils/format'
import StatePanel from '../components/StatePanel.vue'

const auth = useAuthStore(); const rows = ref([]); const total = ref(0); const loading = ref(false); const saving = ref(false); const error = ref(''); const departments = ref([])
const generateVisible = ref(false); const editVisible = ref(false); const detailVisible = ref(false); const detailRow = ref(null)
const query = reactive({ page: 1, pageSize: 10, month: '', departmentId: '', status: '', keyword: '', sortBy: 'month', sortOrder: 'desc' })
const generateForm = reactive({ month: new Date().toISOString().slice(0,7), departmentId: '' })
const editForm = reactive({ id: null, base_salary: 0, performance_bonus: 0, allowance: 0, social_insurance: 0, housing_fund: 0, confirm: false })
const previewNet = computed(() => {
  const taxable = Math.max(0, editForm.base_salary + editForm.performance_bonus + editForm.allowance - editForm.social_insurance - editForm.housing_fund - 5000)
  const tax = taxable * 0.08
  return editForm.base_salary + editForm.performance_bonus + editForm.allowance - editForm.social_insurance - editForm.housing_fund - tax
})
async function load() { loading.value = true; error.value = ''; try { const data = await api.get('/payrolls', query, { silent: true }); rows.value = data.list; total.value = data.total } catch (err) { error.value = err.message } finally { loading.value = false } }
function search() { query.page = 1; load() }
function reset() { Object.assign(query, { page: 1, pageSize: 10, month: '', departmentId: '', status: '', keyword: '', sortBy: 'month', sortOrder: 'desc' }); load() }
function sortChange({ prop, order }) { query.sortBy = prop || 'month'; query.sortOrder = order === 'ascending' ? 'asc' : 'desc'; search() }
function openDetail(row) { detailRow.value = row; detailVisible.value = true }
function openEdit(row) { Object.assign(editForm, { id: row.id, base_salary: Number(row.base_salary), performance_bonus: Number(row.performance_bonus), allowance: Number(row.allowance), social_insurance: Number(row.social_insurance), housing_fund: Number(row.housing_fund), confirm: false }); editVisible.value = true }
async function generate() {
  try { saving.value = true; const result = await api.post('/payrolls/generate', generateForm); ElMessage.success(result.message || `已生成 ${result.created} 条`); generateVisible.value = false; await load() }
  catch (err) { if (err?.status) ElMessage.error(err.message) } finally { saving.value = false }
}
async function saveEdit() { try { saving.value = true; await api.put(`/payrolls/${editForm.id}`, { ...editForm, confirm: true }); ElMessage.success('工资单已更新并记录审计日志'); editVisible.value = false; await load() } catch (err) { if (err?.status) ElMessage.error(err.message) } finally { saving.value = false } }
async function issue(row) { try { await ElMessageBox.confirm(`确认发放 ${row.employee_name} ${row.month} 的工资单吗？发放后不可修改。`, '发放工资单', { type: 'warning', confirmButtonText: '确认发放' }); await api.post(`/payrolls/${row.id}/issue`, {}); ElMessage.success('工资单已发放'); await load() } catch (err) { if (err?.status) ElMessage.error(err.message) } }
async function remove(row) { try { await ElMessageBox.confirm(`确认删除 ${row.employee_name} ${row.month} 的工资草稿吗？`, '删除工资单', { type: 'warning', confirmButtonText: '确认删除' }); await api.delete(`/payrolls/${row.id}`, { confirm: true }); ElMessage.success('工资草稿已删除'); await load() } catch (err) { if (err?.status) ElMessage.error(err.message) } }
onMounted(async () => { if (auth.canManage) { try { departments.value = await api.get('/org', null, { silent: true }) } catch {} }; await load() })
</script>

<style scoped>
.net { color: #0f8f5d; }
.payroll-form { display: grid; grid-template-columns: 1.25fr .75fr; gap: 20px; margin-top: 18px; }
.payroll-form .el-input-number { width: 100%; }
.estimate { display: flex; flex-direction: column; justify-content: center; gap: 12px; padding: 24px; border-radius: 14px; background: linear-gradient(145deg, #eef4ff, #f8fbff); color: #526071; }
.estimate strong { color: var(--brand); font-size: 21px; }
.payslip { overflow: hidden; border: 1px solid var(--border); border-radius: 16px; background: #fff; }
.payslip-head { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; padding: 22px; background: linear-gradient(120deg, #172846, #21488f); color: #fff; }
.payslip-head div { display: flex; flex-direction: column; gap: 5px; }
.payslip-head span { color: #b7c6e3; font-size: 11px; }
.payslip-row { display: flex; justify-content: space-between; padding: 14px 20px; border-bottom: 1px solid #f0f2f6; }
.payslip-row span { color: #66748a; }
.payslip-row.deduction strong { color: #d85555; }
.payslip-sep { height: 8px; background: #f7f9fc; }
.payslip-total { display: flex; align-items: center; justify-content: space-between; padding: 22px; color: #26354b; }
.payslip-total strong { color: var(--brand); font-size: 24px; }
@media (max-width: 650px) { .payroll-form { grid-template-columns: 1fr; } }
</style>
