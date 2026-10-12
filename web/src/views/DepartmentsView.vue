<template>
  <div>
    <PageHeader title="部门组织" description="维护组织层级、部门负责人和启用状态；存在下级或关联员工时无法删除。">
      <template #actions><el-button type="primary" @click="openCreate">新增部门</el-button></template>
    </PageHeader>
    <div class="card filter-card">
      <el-form inline @submit.prevent="load">
        <el-form-item label="关键字"><el-input v-model="filters.q" clearable placeholder="部门名称 / 描述" style="width:220px" @keyup.enter="load" /></el-form-item>
        <el-form-item label="状态">
          <el-select v-model="filters.status" clearable placeholder="全部" style="width:120px" @change="load">
            <el-option label="启用" value="ACTIVE" /><el-option label="停用" value="INACTIVE" />
          </el-select>
        </el-form-item>
        <el-form-item><el-button type="primary" @click="load">查询</el-button><el-button @click="reset">重置</el-button></el-form-item>
      </el-form>
    </div>
    <PageState :loading="loading" :error="error" @retry="load">
      <div class="card table-card">
        <div class="table-toolbar"><div><strong>组织架构</strong><span style="margin-left:10px">共 {{ rows.length }} 个部门</span></div><span>树形层级视图</span></div>
        <el-table :data="treeRows" row-key="id" :tree-props="{ children: 'children' }" empty-text="暂无部门数据">
          <el-table-column prop="name" label="部门名称" min-width="240">
            <template #default="{ row }"><div class="dept-name"><span class="dept-dot"></span><strong>{{ row.name }}</strong></div></template>
          </el-table-column>
          <el-table-column prop="parent_name" label="上级部门" min-width="150"><template #default="{ row }">{{ row.parent_name || '—' }}</template></el-table-column>
          <el-table-column prop="manager_name" label="负责人" min-width="120"><template #default="{ row }">{{ row.manager_name || '未设置' }}</template></el-table-column>
          <el-table-column prop="employee_count" label="在职人数" width="110" sortable />
          <el-table-column prop="position_count" label="职位数" width="100" />
          <el-table-column prop="status" label="状态" width="100"><template #default="{ row }"><StatusTag :status="row.status" kind="org" /></template></el-table-column>
          <el-table-column prop="description" label="说明" min-width="210" show-overflow-tooltip />
          <el-table-column label="操作" width="140" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
              <el-button link type="danger" @click="remove(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </PageState>
    <el-dialog v-model="dialogVisible" :title="editing ? '编辑部门' : '新增部门'" width="560px" destroy-on-close>
      <el-form ref="formRef" :model="form" :rules="rules" label-width="90px">
        <el-form-item label="部门名称" prop="name"><el-input v-model="form.name" maxlength="40" /></el-form-item>
        <el-form-item label="上级部门">
          <el-select v-model="form.parentId" clearable filterable placeholder="无上级部门" style="width:100%">
            <el-option v-for="item in parentOptions" :key="item.id" :label="item.name" :value="item.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="负责人">
          <el-select v-model="form.managerId" clearable filterable placeholder="未设置" style="width:100%">
            <el-option v-for="item in employees" :key="item.id" :label="`${item.name} · ${item.employeeNo}`" :value="item.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态"><el-radio-group v-model="form.status"><el-radio value="ACTIVE">启用</el-radio><el-radio value="INACTIVE">停用</el-radio></el-radio-group></el-form-item>
        <el-form-item label="部门说明"><el-input v-model="form.description" type="textarea" :rows="3" maxlength="200" show-word-limit /></el-form-item>
      </el-form>
      <template #footer><el-button @click="dialogVisible=false">取消</el-button><el-button type="primary" :loading="saving" @click="save">保存</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { api } from '../api/client.js';
import PageHeader from '../components/PageHeader.vue';
import PageState from '../components/PageState.vue';
import StatusTag from '../components/StatusTag.vue';

const rows = ref([]); const employees = ref([]); const loading = ref(true); const error = ref(''); const saving = ref(false);
const dialogVisible = ref(false); const editing = ref(null); const formRef = ref(null);
const filters = reactive({ q: '', status: '' });
const form = reactive({ name: '', parentId: null, managerId: null, status: 'ACTIVE', description: '' });
const rules = { name: [{ required: true, message: '请输入部门名称', trigger: 'blur' }] };
const parentOptions = computed(() => rows.value.filter((item) => item.id !== editing.value?.id));
const treeRows = computed(() => {
  const map = new Map(rows.value.map((item) => [item.id, { ...item, children: [] }]));
  const roots = [];
  map.forEach((item) => {
    if (item.parent_id && map.has(item.parent_id) && !filters.q) map.get(item.parent_id).children.push(item);
    else roots.push(item);
  });
  map.forEach((item) => { if (!item.children.length) delete item.children; });
  return roots;
});

async function load() {
  loading.value = true; error.value = '';
  try {
    const [departments, employeeData] = await Promise.all([
      api.get('/departments', filters),
      api.get('/employees', { page: 1, pageSize: 100, status: 'ACTIVE', sortBy: 'name' }),
    ]);
    rows.value = departments; employees.value = employeeData;
  } catch (err) { error.value = err.message; }
  finally { loading.value = false; }
}
function reset() { filters.q = ''; filters.status = ''; load(); }
function openCreate() { editing.value = null; Object.assign(form, { name: '', parentId: null, managerId: null, status: 'ACTIVE', description: '' }); dialogVisible.value = true; }
function openEdit(row) { editing.value = row; Object.assign(form, { name: row.name, parentId: row.parent_id, managerId: row.manager_id, status: row.status, description: row.description }); dialogVisible.value = true; }
async function save() {
  const valid = await formRef.value?.validate().catch(() => false); if (!valid) return;
  saving.value = true;
  try {
    if (editing.value) await api.put(`/departments/${editing.value.id}`, form);
    else await api.post('/departments', form);
    ElMessage.success(editing.value ? '部门已更新' : '部门已创建'); dialogVisible.value = false; await load();
  } catch (err) { ElMessage.error(err.message); }
  finally { saving.value = false; }
}
async function remove(row) {
  try {
    await ElMessageBox.confirm(`删除部门“${row.name}”后不可恢复。系统会先检查下级部门和关联员工。`, '确认删除', { type: 'warning', confirmButtonText: '确认删除' });
    await api.delete(`/departments/${row.id}`); ElMessage.success('部门已删除'); await load();
  } catch (err) { if (err !== 'cancel' && err !== 'close') ElMessage.error(err.message || '删除失败'); }
}
onMounted(load);
</script>

<style scoped>
.dept-name { display: flex; align-items: center; gap: 9px; }
.dept-dot { width: 8px; height: 8px; border-radius: 3px; background: var(--hr-primary); box-shadow: 0 0 0 4px #eaf1ff; }
</style>
