<template>
  <div class="page">
    <div class="page-heading">
      <div>
        <h1>员工档案</h1>
        <p>集中维护员工基本信息、组织归属、在职状态与薪资基数。</p>
      </div>
      <div class="page-actions">
        <el-button plain @click="load" :loading="loading">刷新</el-button>
        <el-button plain @click="openImport">CSV 导入</el-button>
        <el-button plain :loading="exporting" @click="exportCsv">CSV 导出</el-button>
        <el-button type="primary" @click="openForm()">新增员工</el-button>
      </div>
    </div>

    <div class="content-card">
      <div class="toolbar">
        <el-input v-model="query.keyword" class="grow" clearable placeholder="搜索姓名、工号、手机号或邮箱" @keyup.enter="search" />
        <el-select v-model="query.departmentId" clearable placeholder="全部部门"><el-option v-for="item in departments" :key="item.id" :label="item.name" :value="item.id" /></el-select>
        <el-select v-model="query.status" clearable placeholder="全部状态">
          <el-option label="在职" value="active" /><el-option label="试用期" value="probation" /><el-option label="休假中" value="leave" /><el-option label="已离职" value="terminated" />
        </el-select>
        <el-button type="primary" @click="search">查询</el-button>
        <el-button @click="reset">重置</el-button>
      </div>

      <StatePanel v-if="error" title="员工数据加载失败" :description="error" retry @retry="load" />
      <template v-else>
        <div class="table-wrap">
          <el-table v-loading="loading" :data="rows" @sort-change="sortChange">
            <el-table-column prop="employee_no" label="工号" width="110" sortable />
            <el-table-column prop="name" label="员工" min-width="150" sortable>
              <template #default="{ row }"><div class="employee-cell"><el-avatar :size="34">{{ row.name.slice(0,1) }}</el-avatar><div><strong>{{ row.name }}</strong><span>{{ genderLabel(row.gender) }} · {{ row.phone || '未填手机' }}</span></div></div></template>
            </el-table-column>
            <el-table-column prop="department_name" label="部门" min-width="130" sortable />
            <el-table-column prop="position_name" label="职位" min-width="140" />
            <el-table-column prop="hire_date" label="入职日期" width="120" sortable />
            <el-table-column prop="employment_status" label="状态" width="100" sortable><template #default="{ row }"><el-tag :type="statusTypes[row.employment_status]">{{ statusLabels[row.employment_status] }}</el-tag></template></el-table-column>
            <el-table-column prop="base_salary" label="基本工资" width="130" sortable align="right"><template #default="{ row }"><span class="money">{{ formatMoney(row.base_salary) }}</span></template></el-table-column>
            <el-table-column label="操作" width="205" fixed="right">
              <template #default="{ row }">
                <el-button link type="primary" @click="openForm(row)">编辑</el-button>
                <el-button v-if="row.employment_status !== 'terminated'" link type="warning" @click="openTerminate(row)">离职</el-button>
                <el-button v-if="row.employment_status !== 'terminated'" link type="primary" @click="openFlow(row)">调岗</el-button>
              </template>
            </el-table-column>
            <template #empty><StatePanel title="暂无员工档案" description="调整筛选条件或新增员工" /></template>
          </el-table>
        </div>
        <div class="pager"><el-pagination v-model:current-page="query.page" v-model:page-size="query.pageSize" layout="total, sizes, prev, pager, next" :total="total" :page-sizes="[10, 20, 50]" @current-change="load" @size-change="search" /></div>
      </template>
    </div>

    <el-dialog v-model="formVisible" :title="form.id ? '编辑员工档案' : '新增员工档案'" width="760px" top="5vh" destroy-on-close>
      <el-form ref="formRef" :model="form" :rules="rules" label-width="96px">
        <div class="form-grid">
          <el-form-item label="工号" prop="employee_no"><el-input v-model="form.employee_no" /></el-form-item>
          <el-form-item label="姓名" prop="name"><el-input v-model="form.name" /></el-form-item>
          <el-form-item label="性别"><el-select v-model="form.gender"><el-option label="男" value="male" /><el-option label="女" value="female" /><el-option label="未设置" value="unknown" /></el-select></el-form-item>
          <el-form-item label="手机号"><el-input v-model="form.phone" /></el-form-item>
          <el-form-item label="邮箱"><el-input v-model="form.email" /></el-form-item>
          <el-form-item label="身份证号"><el-input v-model="form.id_card" /></el-form-item>
          <el-form-item label="所属部门" prop="department_id"><el-select v-model="form.department_id" @change="form.position_id = null"><el-option v-for="item in departments" :key="item.id" :label="item.name" :value="item.id" /></el-select></el-form-item>
          <el-form-item label="职位" prop="position_id"><el-select v-model="form.position_id"><el-option v-for="item in availablePositions" :key="item.id" :label="item.name" :value="item.id" /></el-select></el-form-item>
          <el-form-item label="入职日期" prop="hire_date"><el-date-picker v-model="form.hire_date" type="date" value-format="YYYY-MM-DD" style="width:100%" /></el-form-item>
          <el-form-item label="试用期止"><el-date-picker v-model="form.probation_end_date" type="date" value-format="YYYY-MM-DD" style="width:100%" /></el-form-item>
          <el-form-item label="在职状态" prop="employment_status"><el-select v-model="form.employment_status"><el-option label="在职" value="active" /><el-option label="试用期" value="probation" /><el-option label="休假中" value="leave" /></el-select></el-form-item>
          <el-form-item label="基本工资"><el-input-number v-model="form.base_salary" :min="0" :step="500" :disabled="Boolean(form.id)" style="width:100%" /></el-form-item>
          <el-form-item label="银行卡号"><el-input v-model="form.bank_account" /></el-form-item>
          <el-form-item label="出生日期"><el-date-picker v-model="form.birth_date" type="date" value-format="YYYY-MM-DD" style="width:100%" /></el-form-item>
          <el-form-item label="紧急联系人"><el-input v-model="form.emergency_contact" /></el-form-item>
          <el-form-item label="紧急联系电话"><el-input v-model="form.emergency_phone" /></el-form-item>
        </div>
        <el-form-item label="住址"><el-input v-model="form.address" /></el-form-item>
        <el-alert v-if="form.id" title="基本工资调整必须通过“审批中心 → 调薪审批”发起，员工档案中不可直接修改。" type="warning" :closable="false" />
      </el-form>
      <template #footer><el-button @click="formVisible=false">取消</el-button><el-button type="primary" :loading="saving" @click="save">保存档案</el-button></template>
    </el-dialog>

    <el-dialog v-model="terminateVisible" title="办理离职" width="480px">
      <el-alert title="离职会停用绑定账号，并记录审计日志。" type="warning" :closable="false" show-icon />
      <el-form :model="terminateForm" label-width="90px" style="margin-top:18px">
        <el-form-item label="离职日期"><el-date-picker v-model="terminateForm.termination_date" type="date" value-format="YYYY-MM-DD" style="width:100%" /></el-form-item>
        <el-form-item label="离职原因"><el-input v-model="terminateForm.reason" type="textarea" :rows="3" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="terminateVisible=false">取消</el-button><el-button type="danger" :loading="saving" @click="terminate">确认办理离职</el-button></template>
    </el-dialog>

    <el-dialog v-model="importVisible" title="批量导入员工" width="620px">
      <el-alert type="info" :closable="false">
        <template #title>CSV 表头：employee_no, name, gender, phone, email, department, position, hire_date, base_salary</template>
        <span>gender 可填 male/female/unknown，日期格式 YYYY-MM-DD。系统会指出具体行和错误原因，校验全部通过后才会入库。</span>
      </el-alert>
      <div class="upload-zone">
        <input type="file" accept=".csv,text/csv" @change="onFileChange" />
        <p>{{ importFile?.name || '请选择 UTF-8 编码的 CSV 文件' }}</p>
      </div>
      <el-alert v-if="importErrors.length" title="导入校验失败" type="error" :closable="false">
        <div v-for="item in importErrors" :key="item.line" class="import-error">第 {{ item.line }} 行：{{ item.messages.join('；') }}</div>
      </el-alert>
      <template #footer><el-button @click="importVisible=false">取消</el-button><el-button type="primary" :loading="saving" :disabled="!importFile" @click="submitImport">校验并导入</el-button></template>
    </el-dialog>

    <el-dialog v-model="flowVisible" title="发起调岗审批" width="520px">
      <el-form :model="flowForm" label-width="90px">
        <el-form-item label="员工"><el-input :model-value="flowForm.employee_name" disabled /></el-form-item>
        <el-form-item label="目标部门"><el-select v-model="flowForm.to_department_id" @change="flowForm.to_position_id=null"><el-option v-for="item in departments" :key="item.id" :label="item.name" :value="item.id" /></el-select></el-form-item>
        <el-form-item label="目标职位"><el-select v-model="flowForm.to_position_id"><el-option v-for="item in flowPositions" :key="item.id" :label="item.name" :value="item.id" /></el-select></el-form-item>
        <el-form-item label="生效日期"><el-date-picker v-model="flowForm.effective_date" type="date" value-format="YYYY-MM-DD" /></el-form-item>
        <el-form-item label="调岗原因"><el-input v-model="flowForm.reason" type="textarea" :rows="3" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="flowVisible=false">取消</el-button><el-button type="primary" :loading="saving" @click="submitFlow">提交审批</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api } from '../api/http'
import { formatMoney, genderLabel, statusLabels, statusTypes } from '../utils/format'
import StatePanel from '../components/StatePanel.vue'

const rows = ref([]); const total = ref(0); const loading = ref(false); const saving = ref(false); const exporting = ref(false); const error = ref('')
const departments = ref([]); const positions = ref([])
const query = reactive({ page: 1, pageSize: 10, keyword: '', departmentId: '', status: '', sortBy: 'employee_no', sortOrder: 'asc' })
const formVisible = ref(false); const terminateVisible = ref(false); const importVisible = ref(false); const flowVisible = ref(false)
const formRef = ref(); const importFile = ref(null); const importErrors = ref([])
const emptyForm = () => ({ id: null, employee_no: '', name: '', gender: 'unknown', phone: '', email: '', id_card: '', address: '', emergency_contact: '', emergency_phone: '', department_id: null, position_id: null, hire_date: '', probation_end_date: '', employment_status: 'probation', base_salary: 0, bank_account: '', birth_date: '' })
const form = reactive(emptyForm())
const terminateForm = reactive({ id: null, termination_date: '', reason: '' })
const flowForm = reactive({ employee_id: null, employee_name: '', to_department_id: null, to_position_id: null, effective_date: '', reason: '' })
const rules = { employee_no: [{ required: true, message: '请输入工号', trigger: 'blur' }], name: [{ required: true, message: '请输入姓名', trigger: 'blur' }], department_id: [{ required: true, message: '请选择部门', trigger: 'change' }], position_id: [{ required: true, message: '请选择职位', trigger: 'change' }], hire_date: [{ required: true, message: '请选择入职日期', trigger: 'change' }], employment_status: [{ required: true, message: '请选择状态', trigger: 'change' }] }
const availablePositions = computed(() => positions.value.filter((item) => Number(item.department_id) === Number(form.department_id)))
const flowPositions = computed(() => positions.value.filter((item) => Number(item.department_id) === Number(flowForm.to_department_id)))

async function loadOptions() { const [deptData, positionData] = await Promise.all([api.get('/org', null, { silent: true }), api.get('/org/positions/list', null, { silent: true })]); departments.value = deptData; positions.value = positionData }
async function load() {
  loading.value = true; error.value = ''
  try { const data = await api.get('/employees', query, { silent: true }); rows.value = data.list; total.value = data.total }
  catch (err) { error.value = err.message } finally { loading.value = false }
}
function search() { query.page = 1; load() }
function reset() { Object.assign(query, { page: 1, pageSize: 10, keyword: '', departmentId: '', status: '', sortBy: 'employee_no', sortOrder: 'asc' }); load() }
function sortChange({ prop, order }) { query.sortBy = prop || 'employee_no'; query.sortOrder = order === 'ascending' ? 'asc' : 'desc'; query.page = 1; load() }
function openForm(row) {
  Object.assign(form, row ? { ...emptyForm(), ...row } : emptyForm())
  formVisible.value = true
}
async function save() {
  try {
    await formRef.value.validate(); saving.value = true
    const payload = { ...form }
    delete payload.department_name; delete payload.position_name; delete payload.manager_name; delete payload.created_at; delete payload.updated_at; delete payload.termination_date
    if (form.id) await api.put(`/employees/${form.id}`, payload); else await api.post('/employees', payload)
    ElMessage.success(form.id ? '员工档案已更新' : '员工档案已创建'); formVisible.value = false; await load()
  } catch (err) { if (err?.status) ElMessage.error(err.message) } finally { saving.value = false }
}
function openTerminate(row) { Object.assign(terminateForm, { id: row.id, termination_date: new Date().toISOString().slice(0,10), reason: '' }); terminateVisible.value = true }
async function terminate() {
  if (!terminateForm.termination_date || !terminateForm.reason) return ElMessage.warning('请填写离职日期和原因')
  try {
    await ElMessageBox.confirm('确认办理离职吗？该操作会停用员工账号并写入审计日志。', '二次确认', { type: 'warning', confirmButtonText: '确认离职', cancelButtonText: '取消' })
    saving.value = true; await api.post(`/employees/${terminateForm.id}/terminate`, { ...terminateForm, confirm: true }); ElMessage.success('离职手续已办理'); terminateVisible.value = false; await load()
  } catch (err) { if (err?.status) ElMessage.error(err.message) } finally { saving.value = false }
}
function openImport() { importFile.value = null; importErrors.value = []; importVisible.value = true }
function onFileChange(event) { importFile.value = event.target.files?.[0] || null; importErrors.value = [] }
async function submitImport() {
  if (!importFile.value) return
  const data = new FormData(); data.append('file', importFile.value); saving.value = true; importErrors.value = []
  try { const result = await api.post('/employees/import', data); ElMessage.success(result.message || `成功导入 ${result.imported} 人`); importVisible.value = false; await load() }
  catch (err) { if (err.details?.rows) importErrors.value = err.details.rows; if (err?.status && !err.details?.rows) ElMessage.error(err.message) }
  finally { saving.value = false }
}
function openFlow(row) { Object.assign(flowForm, { employee_id: row.id, employee_name: row.name, to_department_id: row.department_id, to_position_id: null, effective_date: new Date().toISOString().slice(0,10), reason: '' }); flowVisible.value = true }
async function submitFlow() {
  if (!flowForm.to_department_id || !flowForm.to_position_id || !flowForm.effective_date || !flowForm.reason) return ElMessage.warning('请完整填写调岗信息')
  try { saving.value = true; await api.post('/approvals/flows', { ...flowForm, type: 'transfer' }); ElMessage.success('调岗申请已提交'); flowVisible.value = false }
  catch (err) { if (err?.status) ElMessage.error(err.message) } finally { saving.value = false }
}
async function exportCsv() {
  exporting.value = true
  try { await api.download('/employees/export', query); ElMessage.success('导出文件已生成') }
  catch (err) { ElMessage.error(err.message) } finally { exporting.value = false }
}
onMounted(async () => { try { await loadOptions() } catch (err) { error.value = err.message }; await load() })
</script>

<style scoped>
.employee-cell { display: flex; align-items: center; gap: 10px; }
.employee-cell > div { display: flex; flex-direction: column; }
.employee-cell span { margin-top: 2px; color: var(--text-secondary); font-size: 11px; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; column-gap: 18px; }
.form-grid .el-select, .form-grid .el-input, .form-grid .el-input-number { width: 100%; }
.upload-zone { margin: 18px 0; padding: 24px; border: 1px dashed #b9c7df; border-radius: 12px; background: #f8faff; text-align: center; }
.upload-zone p { margin: 10px 0 0; color: var(--text-secondary); }
.import-error { margin-top: 6px; }
@media (max-width: 700px) { .form-grid { grid-template-columns: 1fr; } }
</style>
