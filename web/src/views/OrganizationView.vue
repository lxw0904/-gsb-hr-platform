<template>
  <div class="page">
    <div class="page-heading">
      <div>
        <h1>组织架构</h1>
        <p>维护部门层级、负责人和职位编制，删除前系统会自动校验关联数据。</p>
      </div>
      <div class="page-actions">
        <el-button plain @click="load" :loading="loading">刷新</el-button>
        <el-button type="primary" @click="openDepartment()">新建部门</el-button>
      </div>
    </div>

    <div class="content-card">
      <el-tabs v-model="activeTab">
        <el-tab-pane label="部门树" name="departments">
          <StatePanel v-if="error" title="组织数据加载失败" :description="error" retry @retry="load" />
          <div v-else class="table-wrap">
            <el-table v-loading="loading" :data="departmentTree" row-key="id" default-expand-all>
              <el-table-column prop="name" label="部门名称" min-width="220">
                <template #default="{ row }"><strong>{{ row.name }}</strong><span class="code-tag">{{ row.code }}</span></template>
              </el-table-column>
              <el-table-column prop="manager_name" label="负责人" min-width="120" />
              <el-table-column prop="employee_count" label="在职人数" width="100" sortable />
              <el-table-column prop="sort_order" label="排序" width="80" sortable />
              <el-table-column label="操作" width="170" fixed="right">
                <template #default="{ row }">
                  <el-button link type="primary" @click="openDepartment(row)">编辑</el-button>
                  <el-button link type="danger" @click="removeDepartment(row)">删除</el-button>
                </template>
              </el-table-column>
              <template #empty><StatePanel title="暂无部门" description="点击右上角新建第一个部门" /></template>
            </el-table>
          </div>
        </el-tab-pane>

        <el-tab-pane label="职位管理" name="positions">
          <div class="toolbar">
            <el-input v-model="positionQuery.keyword" class="grow" clearable placeholder="搜索职位名称或编码" @keyup.enter="loadPositions" />
            <el-select v-model="positionQuery.departmentId" clearable placeholder="全部部门" @change="loadPositions">
              <el-option v-for="item in departments" :key="item.id" :label="item.name" :value="item.id" />
            </el-select>
            <el-button type="primary" @click="loadPositions">查询</el-button>
            <el-button @click="resetPositionQuery">重置</el-button>
            <el-button type="primary" plain @click="openPosition()">新建职位</el-button>
          </div>
          <StatePanel v-if="positionError" title="职位数据加载失败" :description="positionError" retry @retry="loadPositions" />
          <template v-else>
            <div class="table-wrap">
              <el-table v-loading="positionLoading" :data="pagedPositions" @sort-change="sortPositions">
                <el-table-column prop="name" label="职位名称" min-width="170">
                  <template #default="{ row }"><strong>{{ row.name }}</strong><div class="muted">{{ row.code }}</div></template>
                </el-table-column>
                <el-table-column prop="department_name" label="所属部门" min-width="140" />
                <el-table-column prop="level" label="职级" width="90" />
                <el-table-column prop="headcount" label="编制" width="90" sortable />
                <el-table-column prop="employee_count" label="在岗" width="90" sortable />
                <el-table-column label="操作" width="150" fixed="right">
                  <template #default="{ row }">
                    <el-button link type="primary" @click="openPosition(row)">编辑</el-button>
                    <el-button link type="danger" @click="removePosition(row)">删除</el-button>
                  </template>
                </el-table-column>
                <template #empty><StatePanel title="暂无职位" description="当前部门或关键字下没有职位" /></template>
              </el-table>
            </div>
            <div class="pager">
              <el-pagination v-model:current-page="positionPage" v-model:page-size="positionPageSize" layout="total, sizes, prev, pager, next" :total="positions.length" :page-sizes="[5, 10, 20]" />
            </div>
          </template>
        </el-tab-pane>
      </el-tabs>
    </div>

    <el-dialog v-model="departmentDialog" :title="departmentForm.id ? '编辑部门' : '新建部门'" width="520px">
      <el-form ref="departmentFormRef" :model="departmentForm" :rules="departmentRules" label-width="90px">
        <el-form-item label="上级部门"><el-select v-model="departmentForm.parent_id" clearable placeholder="无（顶级部门）" style="width:100%"><el-option v-for="item in departments.filter((d) => d.id !== departmentForm.id)" :key="item.id" :label="item.name" :value="item.id" /></el-select></el-form-item>
        <el-form-item label="部门名称" prop="name"><el-input v-model="departmentForm.name" /></el-form-item>
        <el-form-item label="部门编码" prop="code"><el-input v-model="departmentForm.code" placeholder="如 TECH" /></el-form-item>
        <el-form-item label="负责人"><el-input v-model="departmentForm.manager_name" /></el-form-item>
        <el-form-item label="显示排序"><el-input-number v-model="departmentForm.sort_order" :min="0" :max="999" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="departmentDialog=false">取消</el-button><el-button type="primary" :loading="saving" @click="saveDepartment">保存</el-button></template>
    </el-dialog>

    <el-dialog v-model="positionDialog" :title="positionForm.id ? '编辑职位' : '新建职位'" width="540px">
      <el-form ref="positionFormRef" :model="positionForm" :rules="positionRules" label-width="90px">
        <el-form-item label="所属部门" prop="department_id"><el-select v-model="positionForm.department_id" style="width:100%"><el-option v-for="item in departments" :key="item.id" :label="item.name" :value="item.id" /></el-select></el-form-item>
        <el-form-item label="职位名称" prop="name"><el-input v-model="positionForm.name" /></el-form-item>
        <el-form-item label="职位编码" prop="code"><el-input v-model="positionForm.code" placeholder="如 FE" /></el-form-item>
        <el-form-item label="职级"><el-input v-model="positionForm.level" placeholder="如 P6" /></el-form-item>
        <el-form-item label="编制人数"><el-input-number v-model="positionForm.headcount" :min="0" :max="999" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="positionDialog=false">取消</el-button><el-button type="primary" :loading="saving" @click="savePosition">保存</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api } from '../api/http'
import StatePanel from '../components/StatePanel.vue'

const activeTab = ref('departments')
const departments = ref([])
const positions = ref([])
const loading = ref(false)
const positionLoading = ref(false)
const saving = ref(false)
const error = ref('')
const positionError = ref('')
const departmentDialog = ref(false)
const positionDialog = ref(false)
const departmentFormRef = ref()
const positionFormRef = ref()
const positionQuery = reactive({ keyword: '', departmentId: '' })
const positionSort = reactive({ prop: 'id', order: 'ascending' })
const positionPage = ref(1)
const positionPageSize = ref(10)
const departmentForm = reactive({ id: null, parent_id: null, name: '', code: '', manager_name: '', sort_order: 0 })
const positionForm = reactive({ id: null, department_id: null, name: '', code: '', level: '', headcount: 0 })
const departmentRules = { name: [{ required: true, message: '请输入部门名称', trigger: 'blur' }], code: [{ required: true, message: '请输入部门编码', trigger: 'blur' }] }
const positionRules = { department_id: [{ required: true, message: '请选择部门', trigger: 'change' }], name: [{ required: true, message: '请输入职位名称', trigger: 'blur' }], code: [{ required: true, message: '请输入职位编码', trigger: 'blur' }] }

const departmentTree = computed(() => {
  const nodes = departments.value.map((item) => ({ ...item, children: [] }))
  const map = new Map(nodes.map((item) => [item.id, item]))
  const roots = []
  nodes.forEach((node) => {
    if (node.parent_id && map.has(node.parent_id)) map.get(node.parent_id).children.push(node)
    else roots.push(node)
  })
  nodes.forEach((node) => { if (!node.children.length) delete node.children })
  return roots
})
const sortedPositions = computed(() => {
  const list = [...positions.value]
  const direction = positionSort.order === 'ascending' ? 1 : -1
  return list.sort((a, b) => {
    const left = a[positionSort.prop] ?? ''
    const right = b[positionSort.prop] ?? ''
    if (typeof left === 'number' && typeof right === 'number') return (left - right) * direction
    return String(left).localeCompare(String(right), 'zh-CN') * direction
  })
})
const pagedPositions = computed(() => sortedPositions.value.slice((positionPage.value - 1) * positionPageSize.value, positionPage.value * positionPageSize.value))

function resetDepartmentForm(row) {
  Object.assign(departmentForm, row ? { ...row } : { id: null, parent_id: null, name: '', code: '', manager_name: '', sort_order: 0 })
}
function resetPositionForm(row) {
  Object.assign(positionForm, row ? { ...row } : { id: null, department_id: null, name: '', code: '', level: '', headcount: 0 })
}
function openDepartment(row) { resetDepartmentForm(row); departmentDialog.value = true }
function openPosition(row) { resetPositionForm(row); positionDialog.value = true }
async function loadDepartments() {
  loading.value = true; error.value = ''
  try { departments.value = await api.get('/org', null, { silent: true }) }
  catch (err) { error.value = err.message }
  finally { loading.value = false }
}
async function loadPositions() {
  positionLoading.value = true; positionError.value = ''
  try { positions.value = await api.get('/org/positions/list', positionQuery, { silent: true }) }
  catch (err) { positionError.value = err.message }
  finally { positionLoading.value = false }
}
async function load() { await Promise.all([loadDepartments(), loadPositions()]) }
function resetPositionQuery() { Object.assign(positionQuery, { keyword: '', departmentId: '' }); positionPage.value = 1; loadPositions() }
function sortPositions({ prop, order }) { positionSort.prop = prop || 'id'; positionSort.order = order || 'ascending' }
async function saveDepartment() {
  try {
    await departmentFormRef.value.validate(); saving.value = true
    const path = departmentForm.id ? `/org/${departmentForm.id}` : '/org'
    const method = departmentForm.id ? api.put : api.post
    await method(path, departmentForm)
    ElMessage.success(departmentForm.id ? '部门已更新' : '部门已创建'); departmentDialog.value = false; await load()
  } catch (err) { if (err?.status) ElMessage.error(err.message) } finally { saving.value = false }
}
async function savePosition() {
  try {
    await positionFormRef.value.validate(); saving.value = true
    const path = positionForm.id ? `/org/positions/${positionForm.id}` : '/org/positions'
    const method = positionForm.id ? api.put : api.post
    await method(path, positionForm)
    ElMessage.success(positionForm.id ? '职位已更新' : '职位已创建'); positionDialog.value = false; await loadPositions()
  } catch (err) { if (err?.status) ElMessage.error(err.message) } finally { saving.value = false }
}
async function removeDepartment(row) {
  try {
    await ElMessageBox.confirm(`确认删除部门“${row.name}”吗？系统会校验下级部门、职位和在职员工。`, '删除部门', { type: 'warning', confirmButtonText: '确认删除', cancelButtonText: '取消' })
    await api.delete(`/org/${row.id}`, { confirm: true }); ElMessage.success('部门已删除'); await load()
  } catch (err) { if (err?.status) ElMessage.error(err.message) }
}
async function removePosition(row) {
  try {
    await ElMessageBox.confirm(`确认删除职位“${row.name}”吗？`, '删除职位', { type: 'warning', confirmButtonText: '确认删除', cancelButtonText: '取消' })
    await api.delete(`/org/positions/${row.id}`, { confirm: true }); ElMessage.success('职位已删除'); await loadPositions()
  } catch (err) { if (err?.status) ElMessage.error(err.message) }
}
watch(() => [positionQuery.keyword, positionQuery.departmentId], () => { positionPage.value = 1 })
onMounted(load)
</script>

<style scoped>
.code-tag { margin-left: 8px; padding: 2px 6px; border-radius: 5px; background: #f0f3f8; color: #7b8799; font-size: 10px; }
</style>
