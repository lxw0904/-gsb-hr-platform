<template>
  <div class="page">
    <div class="page-heading">
      <div><h1>用户与角色</h1><p>管理登录账号、角色权限和员工档案绑定关系。系统始终保留至少一名管理员。</p></div>
      <div class="page-actions"><el-button plain @click="load" :loading="loading">刷新</el-button><el-button type="primary" @click="openForm()">新建账号</el-button></div>
    </div>
    <div class="content-card">
      <div class="toolbar">
        <el-input v-model="query.keyword" class="grow" clearable placeholder="搜索用户名、姓名或工号" @keyup.enter="search" />
        <el-select v-model="query.role" clearable placeholder="全部角色"><el-option label="管理员" value="admin" /><el-option label="HR" value="hr" /><el-option label="普通员工" value="employee" /></el-select>
        <el-select v-model="query.status" clearable placeholder="全部状态"><el-option label="启用" value="active" /><el-option label="停用" value="disabled" /></el-select>
        <el-button type="primary" @click="search">查询</el-button><el-button @click="reset">重置</el-button>
      </div>
      <StatePanel v-if="error" title="账号列表加载失败" :description="error" retry @retry="load" />
      <template v-else>
        <div class="table-wrap">
          <el-table v-loading="loading" :data="rows" @sort-change="sortChange">
            <el-table-column prop="username" label="用户名" min-width="130" sortable><template #default="{ row }"><strong>{{ row.username }}</strong></template></el-table-column>
            <el-table-column prop="employee_name" label="绑定员工" min-width="150"><template #default="{ row }">{{ row.employee_name || '未绑定' }}<div class="muted">{{ row.employee_no || '' }}</div></template></el-table-column>
            <el-table-column prop="role" label="角色" width="110" sortable><template #default="{ row }"><el-tag :type="row.role === 'admin' ? 'danger' : row.role === 'hr' ? 'warning' : 'primary'">{{ roleLabels[row.role] }}</el-tag></template></el-table-column>
            <el-table-column prop="status" label="状态" width="100" sortable><template #default="{ row }"><el-tag :type="statusTypes[row.status]">{{ statusLabels[row.status] }}</el-tag></template></el-table-column>
            <el-table-column prop="last_login_at" label="最近登录" min-width="160" sortable><template #default="{ row }">{{ formatDate(row.last_login_at, true) }}</template></el-table-column>
            <el-table-column prop="created_at" label="创建时间" min-width="160" sortable><template #default="{ row }">{{ formatDate(row.created_at, true) }}</template></el-table-column>
            <el-table-column label="操作" width="210" fixed="right"><template #default="{ row }"><el-button link type="primary" @click="openForm(row)">编辑权限</el-button><el-button link type="warning" @click="openReset(row)">重置密码</el-button><el-button link type="danger" @click="removeUser(row)">删除</el-button></template></el-table-column>
            <template #empty><StatePanel title="暂无用户账号" description="当前筛选条件下没有账号" /></template>
          </el-table>
        </div>
        <div class="pager"><el-pagination v-model:current-page="query.page" v-model:page-size="query.pageSize" layout="total, sizes, prev, pager, next" :total="total" :page-sizes="[10,20,50]" @current-change="load" @size-change="search" /></div>
      </template>
    </div>

    <el-dialog v-model="formVisible" :title="form.id ? '编辑账号权限' : '新建登录账号'" width="560px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="用户名" prop="username"><el-input v-model="form.username" :disabled="Boolean(form.id)" /></el-form-item>
        <el-form-item v-if="!form.id" label="初始密码" prop="password"><el-input v-model="form.password" type="password" show-password placeholder="至少 8 位" /></el-form-item>
        <el-form-item label="角色" prop="role"><el-select v-model="form.role"><el-option label="管理员" value="admin" /><el-option label="HR" value="hr" /><el-option label="普通员工" value="employee" /></el-select></el-form-item>
        <el-form-item label="绑定员工"><el-select v-model="form.employee_id" filterable clearable placeholder="可不绑定"><el-option v-for="item in employees" :key="item.id" :label="`${item.name}（${item.employee_no}）`" :value="item.id" /></el-select></el-form-item>
        <el-form-item v-if="form.id" label="账号状态"><el-radio-group v-model="form.status"><el-radio value="active">启用</el-radio><el-radio value="disabled">停用</el-radio></el-radio-group></el-form-item>
      </el-form>
      <el-alert title="权限变更属于关键操作，系统会记录变更前后角色和绑定关系。" type="warning" :closable="false" />
      <template #footer><el-button @click="formVisible=false">取消</el-button><el-button type="primary" :loading="saving" @click="save">保存账号</el-button></template>
    </el-dialog>

    <el-dialog v-model="resetVisible" title="重置登录密码" width="460px">
      <el-alert :title="`正在为账号“${resetForm.username}”重置密码`" type="warning" :closable="false" />
      <el-form label-width="90px" style="margin-top:18px"><el-form-item label="新密码"><el-input v-model="resetForm.password" type="password" show-password placeholder="至少 8 位" /></el-form-item></el-form>
      <template #footer><el-button @click="resetVisible=false">取消</el-button><el-button type="primary" :loading="saving" @click="resetPassword">确认重置</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api } from '../api/http'
import { formatDate, roleLabels, statusLabels, statusTypes } from '../utils/format'
import StatePanel from '../components/StatePanel.vue'

const rows = ref([]); const total = ref(0); const loading = ref(false); const saving = ref(false); const error = ref(''); const employees = ref([])
const formVisible = ref(false); const resetVisible = ref(false); const formRef = ref()
const query = reactive({ page: 1, pageSize: 10, keyword: '', role: '', status: '', sortBy: 'created_at', sortOrder: 'desc' })
const form = reactive({ id: null, username: '', password: '', role: 'employee', employee_id: null, status: 'active' })
const resetForm = reactive({ id: null, username: '', password: '' })
const rules = { username: [{ required: true, message: '请输入用户名', trigger: 'blur' }], password: [{ required: true, min: 8, message: '密码至少 8 位', trigger: 'blur' }], role: [{ required: true, message: '请选择角色', trigger: 'change' }] }
async function load() { loading.value = true; error.value = ''; try { const data = await api.get('/system/users', query, { silent: true }); rows.value = data.list; total.value = data.total } catch (err) { error.value = err.message } finally { loading.value = false } }
function search() { query.page = 1; load() }
function reset() { Object.assign(query, { page: 1, pageSize: 10, keyword: '', role: '', status: '', sortBy: 'created_at', sortOrder: 'desc' }); load() }
function sortChange({ prop, order }) { query.sortBy = prop || 'created_at'; query.sortOrder = order === 'ascending' ? 'asc' : 'desc'; search() }
function openForm(row) { Object.assign(form, row ? { id: row.id, username: row.username, password: '', role: row.role, employee_id: row.employee_id, status: row.status } : { id: null, username: '', password: '', role: 'employee', employee_id: null, status: 'active' }); formVisible.value = true }
async function save() {
  try {
    await formRef.value.validate(); saving.value = true
    if (form.id) await api.put(`/system/users/${form.id}`, { role: form.role, employee_id: form.employee_id, status: form.status })
    else await api.post('/system/users', form)
    ElMessage.success(form.id ? '账号权限已更新' : '登录账号已创建'); formVisible.value = false; await load()
  } catch (err) { if (err?.status) ElMessage.error(err.message) } finally { saving.value = false }
}
function openReset(row) { Object.assign(resetForm, { id: row.id, username: row.username, password: '' }); resetVisible.value = true }
async function resetPassword() { if (resetForm.password.length < 8) return ElMessage.warning('密码至少 8 位'); try { saving.value = true; await api.post(`/system/users/${resetForm.id}/reset-password`, { password: resetForm.password }); ElMessage.success('密码已重置'); resetVisible.value = false } catch (err) { if (err?.status) ElMessage.error(err.message) } finally { saving.value = false } }
async function removeUser(row) { try { await ElMessageBox.confirm(`确认删除账号“${row.username}”吗？此操作不可恢复。`, '删除账号', { type: 'warning', confirmButtonText: '确认删除' }); await api.delete(`/system/users/${row.id}`, { confirm: true }); ElMessage.success('账号已删除'); await load() } catch (err) { if (err?.status) ElMessage.error(err.message) } }
onMounted(async () => { try { const data = await api.get('/employees', { page: 1, pageSize: 100, sortBy: 'employee_no', sortOrder: 'asc' }, { silent: true }); employees.value = data.list } catch {}; await load() })
</script>
