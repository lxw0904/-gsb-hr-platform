<template>
  <div>
    <PageHeader title="职位管理" description="维护部门下的职位、职级和使用状态；存在关联员工时禁止删除。">
      <template #actions><el-button type="primary" @click="openCreate">新增职位</el-button></template>
    </PageHeader>
    <div class="card filter-card">
      <el-form inline @submit.prevent="search">
        <el-form-item label="关键字"><el-input v-model="filters.q" clearable placeholder="职位名称 / 说明" style="width:200px" @keyup.enter="search" /></el-form-item>
        <el-form-item label="部门"><el-select v-model="filters.departmentId" clearable filterable placeholder="全部部门" style="width:180px"><el-option v-for="d in departments" :key="d.id" :label="d.name" :value="d.id" /></el-select></el-form-item>
        <el-form-item label="状态"><el-select v-model="filters.status" clearable placeholder="全部" style="width:120px"><el-option label="启用" value="ACTIVE" /><el-option label="停用" value="INACTIVE" /></el-select></el-form-item>
        <el-form-item><el-button type="primary" @click="search">查询</el-button><el-button @click="reset">重置</el-button></el-form-item>
      </el-form>
    </div>
    <PageState :loading="loading" :error="error" @retry="load">
      <div class="card table-card">
        <div class="table-toolbar"><div><strong>职位列表</strong><span style="margin-left:10px">共 {{ meta.total }} 条</span></div><span>支持点击表头排序</span></div>
        <el-table :data="rows" empty-text="暂无职位数据" @sort-change="sortChange">
          <el-table-column prop="name" label="职位名称" min-width="170" sortable="custom" />
          <el-table-column prop="department_name" label="所属部门" min-width="160" sortable="custom" />
          <el-table-column prop="level" label="职级" width="100" sortable="custom" />
          <el-table-column prop="employee_count" label="在职人数" width="110" sortable="custom" />
          <el-table-column prop="status" label="状态" width="100" sortable="custom"><template #default="{ row }"><StatusTag :status="row.status" kind="org" /></template></el-table-column>
          <el-table-column prop="description" label="职位说明" min-width="220" show-overflow-tooltip />
          <el-table-column label="操作" width="140" fixed="right"><template #default="{ row }"><el-button link type="primary" @click="openEdit(row)">编辑</el-button><el-button link type="danger" @click="remove(row)">删除</el-button></template></el-table-column>
        </el-table>
        <div class="table-footer"><el-pagination v-model:current-page="pagination.page" v-model:page-size="pagination.pageSize" :total="meta.total" :page-sizes="[10,20,50]" layout="total, sizes, prev, pager, next" @current-change="load" @size-change="search" /></div>
      </div>
    </PageState>
    <el-dialog v-model="dialogVisible" :title="editing ? '编辑职位' : '新增职位'" width="540px" destroy-on-close>
      <el-form ref="formRef" :model="form" :rules="rules" label-width="90px">
        <el-form-item label="职位名称" prop="name"><el-input v-model="form.name" maxlength="40" /></el-form-item>
        <el-form-item label="所属部门" prop="departmentId"><el-select v-model="form.departmentId" filterable style="width:100%"><el-option v-for="d in departments" :key="d.id" :label="d.name" :value="d.id" /></el-select></el-form-item>
        <el-form-item label="职级" prop="level"><el-input v-model="form.level" placeholder="如 P3 / M2" maxlength="10" /></el-form-item>
        <el-form-item label="状态"><el-radio-group v-model="form.status"><el-radio value="ACTIVE">启用</el-radio><el-radio value="INACTIVE">停用</el-radio></el-radio-group></el-form-item>
        <el-form-item label="职位说明"><el-input v-model="form.description" type="textarea" :rows="3" maxlength="200" show-word-limit /></el-form-item>
      </el-form>
      <template #footer><el-button @click="dialogVisible=false">取消</el-button><el-button type="primary" :loading="saving" @click="save">保存</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { api } from '../api/client.js';
import PageHeader from '../components/PageHeader.vue';
import PageState from '../components/PageState.vue';
import StatusTag from '../components/StatusTag.vue';

const rows = ref([]); const departments = ref([]); const loading = ref(true); const error = ref(''); const saving = ref(false);
const dialogVisible = ref(false); const editing = ref(null); const formRef = ref(null);
const filters = reactive({ q: '', departmentId: '', status: '', sortBy: 'name', sortOrder: 'ASC' });
const pagination = reactive({ page: 1, pageSize: 10 }); const meta = reactive({ total: 0, totalPages: 1 });
const form = reactive({ name: '', departmentId: null, level: 'P3', status: 'ACTIVE', description: '' });
const rules = { name: [{ required: true, message: '请输入职位名称', trigger: 'blur' }], departmentId: [{ required: true, message: '请选择部门', trigger: 'change' }] };

async function load() {
  loading.value = true; error.value = '';
  try {
    const [result, deptData] = await Promise.all([
      api.get('/positions', { ...filters, page: pagination.page, pageSize: pagination.pageSize }),
      departments.value.length ? Promise.resolve(departments.value) : api.get('/departments', { status: 'ACTIVE', sortBy: 'name' }),
    ]);
    rows.value = result; Object.assign(meta, result.meta || {}); departments.value = deptData;
  } catch (err) { error.value = err.message; }
  finally { loading.value = false; }
}
function search() { pagination.page = 1; load(); }
function reset() { Object.assign(filters, { q: '', departmentId: '', status: '', sortBy: 'name', sortOrder: 'ASC' }); search(); }
function sortChange({ prop, order }) { filters.sortBy = prop; filters.sortOrder = order === 'ascending' ? 'ASC' : order === 'descending' ? 'DESC' : 'ASC'; search(); }
function openCreate() { editing.value = null; Object.assign(form, { name: '', departmentId: null, level: 'P3', status: 'ACTIVE', description: '' }); dialogVisible.value = true; }
function openEdit(row) { editing.value = row; Object.assign(form, { name: row.name, departmentId: row.department_id, level: row.level, status: row.status, description: row.description }); dialogVisible.value = true; }
async function save() {
  const valid = await formRef.value?.validate().catch(() => false); if (!valid) return; saving.value = true;
  try { if (editing.value) await api.put(`/positions/${editing.value.id}`, form); else await api.post('/positions', form); ElMessage.success(editing.value ? '职位已更新' : '职位已创建'); dialogVisible.value = false; await load(); }
  catch (err) { ElMessage.error(err.message); } finally { saving.value = false; }
}
async function remove(row) {
  try { await ElMessageBox.confirm(`确认删除职位“${row.name}”吗？系统会检查关联员工。`, '确认删除', { type: 'warning', confirmButtonText: '确认删除' }); await api.delete(`/positions/${row.id}`); ElMessage.success('职位已删除'); await load(); }
  catch (err) { if (err !== 'cancel' && err !== 'close') ElMessage.error(err.message || '删除失败'); }
}
onMounted(load);
</script>
