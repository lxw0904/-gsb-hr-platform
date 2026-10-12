<template>
  <div>
    <PageHeader title="员工档案" description="集中维护员工基础资料、组织归属、任职状态和敏感信息权限。">
      <template #actions>
        <input ref="fileInput" type="file" accept=".csv,text/csv" hidden @change="handleFile" />
        <el-button @click="downloadTemplate">下载模板</el-button>
        <el-button @click="fileInput?.click()">CSV 导入</el-button>
        <el-button @click="exportCsv">CSV 导出</el-button>
        <el-button type="primary" @click="openCreate">新增员工</el-button>
      </template>
    </PageHeader>
    <div class="card filter-card">
      <el-form inline @submit.prevent="search">
        <el-form-item label="关键字"><el-input v-model="filters.q" clearable placeholder="姓名 / 工号 / 手机 / 邮箱" style="width:230px" @keyup.enter="search" /></el-form-item>
        <el-form-item label="部门"><el-select v-model="filters.departmentId" clearable filterable placeholder="全部部门" style="width:170px"><el-option v-for="d in departments" :key="d.id" :label="d.name" :value="d.id" /></el-select></el-form-item>
        <el-form-item label="状态"><el-select v-model="filters.status" clearable placeholder="全部" style="width:110px"><el-option label="在职" value="ACTIVE" /><el-option label="离职" value="LEFT" /></el-select></el-form-item>
        <el-form-item><el-button type="primary" @click="search">查询</el-button><el-button @click="reset">重置</el-button></el-form-item>
      </el-form>
    </div>
    <PageState :loading="loading" :error="error" @retry="load">
      <div class="card table-card">
        <div class="table-toolbar"><div><strong>员工列表</strong><span style="margin-left:10px">共 {{ meta.total }} 人</span></div><span>身份证与薪资仅 HR/管理员可见</span></div>
        <el-table :data="rows" empty-text="暂无符合条件的员工" @sort-change="sortChange">
          <el-table-column prop="employeeNo" label="工号" width="90" sortable="custom" fixed="left" />
          <el-table-column prop="name" label="姓名" width="110" sortable="custom" fixed="left"><template #default="{row}"><strong>{{ row.name }}</strong></template></el-table-column>
          <el-table-column prop="gender" label="性别" width="70"><template #default="{row}">{{ labelOf(GENDER_LABELS,row.gender) }}</template></el-table-column>
          <el-table-column prop="departmentName" label="部门" min-width="140" sortable="custom" />
          <el-table-column prop="positionName" label="职位" min-width="130" />
          <el-table-column prop="phone" label="手机号" width="130" />
          <el-table-column prop="idCard" label="身份证号" width="180"><template #default="{row}"><span class="sensitive">{{ row.idCard || '—' }}</span></template></el-table-column>
          <el-table-column prop="hireDate" label="入职日期" width="115" sortable="custom"><template #default="{row}">{{ formatDate(row.hireDate) }}</template></el-table-column>
          <el-table-column prop="status" label="状态" width="90" sortable="custom"><template #default="{row}"><StatusTag :status="row.status" kind="employee" /></template></el-table-column>
          <el-table-column label="操作" width="220" fixed="right">
            <template #default="{row}">
              <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
              <el-dropdown trigger="click" @command="(command) => rowAction(command,row)">
                <el-button link type="primary">更多⌄</el-button>
                <template #dropdown><el-dropdown-menu>
                  <el-dropdown-item :disabled="row.status !== 'ACTIVE'" command="transfer">调岗</el-dropdown-item>
                  <el-dropdown-item :disabled="row.status !== 'ACTIVE'" command="offboard">办理离职</el-dropdown-item>
                  <el-dropdown-item divided command="delete"><span class="danger-text">删除档案</span></el-dropdown-item>
                </el-dropdown-menu></template>
              </el-dropdown>
            </template>
          </el-table-column>
        </el-table>
        <div class="table-footer"><el-pagination v-model:current-page="pagination.page" v-model:page-size="pagination.pageSize" :total="meta.total" :page-sizes="[10,20,50]" layout="total, sizes, prev, pager, next" @current-change="load" @size-change="search" /></div>
      </div>
    </PageState>

    <el-dialog v-model="dialogVisible" :title="editing ? '编辑员工档案' : '新增员工'" width="880px" destroy-on-close>
      <el-form ref="formRef" :model="form" :rules="rules" label-width="96px">
        <div class="form-grid">
          <el-form-item label="工号" prop="employeeNo"><el-input v-model="form.employeeNo" maxlength="30" /></el-form-item>
          <el-form-item label="姓名" prop="name"><el-input v-model="form.name" maxlength="30" /></el-form-item>
          <el-form-item label="性别" prop="gender"><el-select v-model="form.gender" style="width:100%"><el-option label="男" value="MALE" /><el-option label="女" value="FEMALE" /><el-option label="其他" value="OTHER" /></el-select></el-form-item>
          <el-form-item label="出生日期"><el-date-picker v-model="form.birthDate" type="date" value-format="YYYY-MM-DD" placeholder="选择日期" style="width:100%" /></el-form-item>
          <el-form-item label="身份证号"><el-input v-model="form.idCard" maxlength="18" /></el-form-item>
          <el-form-item label="手机号"><el-input v-model="form.phone" maxlength="20" /></el-form-item>
          <el-form-item label="邮箱"><el-input v-model="form.email" maxlength="80" /></el-form-item>
          <el-form-item label="基本工资"><el-input-number v-model="form.baseSalary" :min="0" :step="500" :precision="2" controls-position="right" style="width:100%" /></el-form-item>
          <el-form-item label="部门" prop="departmentId"><el-select v-model="form.departmentId" filterable style="width:100%" @change="departmentChanged"><el-option v-for="d in departments" :key="d.id" :label="d.name" :value="d.id" /></el-select></el-form-item>
          <el-form-item label="职位" prop="positionId"><el-select v-model="form.positionId" filterable style="width:100%"><el-option v-for="p in availablePositions" :key="p.id" :label="`${p.name} · ${p.level}`" :value="p.id" /></el-select></el-form-item>
          <el-form-item label="入职日期" prop="hireDate"><el-date-picker v-model="form.hireDate" type="date" value-format="YYYY-MM-DD" style="width:100%" /></el-form-item>
          <el-form-item label="紧急联系人"><el-input v-model="form.emergencyContact" maxlength="30" /></el-form-item>
          <el-form-item label="紧急电话"><el-input v-model="form.emergencyPhone" maxlength="20" /></el-form-item>
          <el-form-item label="联系地址"><el-input v-model="form.address" maxlength="120" /></el-form-item>
        </div>
      </el-form>
      <template #footer><el-button @click="dialogVisible=false">取消</el-button><el-button type="primary" :loading="saving" @click="save">保存</el-button></template>
    </el-dialog>

    <el-dialog v-model="transferVisible" title="员工调岗" width="520px">
      <el-alert title="调岗会立即更新组织归属，并写入审计日志。" type="info" :closable="false" style="margin-bottom:18px" />
      <el-form :model="transferForm" label-width="90px">
        <el-form-item label="员工"><strong>{{ selected?.name }} · {{ selected?.employeeNo }}</strong></el-form-item>
        <el-form-item label="目标部门"><el-select v-model="transferForm.departmentId" filterable style="width:100%" @change="transferDepartmentChanged"><el-option v-for="d in departments" :key="d.id" :label="d.name" :value="d.id" /></el-select></el-form-item>
        <el-form-item label="目标职位"><el-select v-model="transferForm.positionId" filterable style="width:100%"><el-option v-for="p in transferPositions" :key="p.id" :label="`${p.name} · ${p.level}`" :value="p.id" /></el-select></el-form-item>
      </el-form>
      <template #footer><el-button @click="transferVisible=false">取消</el-button><el-button type="primary" :loading="saving" @click="submitTransfer">确认调岗</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { api } from '../api/client.js';
import { formatDate, GENDER_LABELS, labelOf } from '../utils/format.js';
import PageHeader from '../components/PageHeader.vue';
import PageState from '../components/PageState.vue';
import StatusTag from '../components/StatusTag.vue';

const rows = ref([]); const departments = ref([]); const positions = ref([]); const loading = ref(true); const error = ref(''); const saving = ref(false);
const dialogVisible = ref(false); const transferVisible = ref(false); const editing = ref(null); const selected = ref(null); const formRef = ref(null); const fileInput = ref(null);
const filters = reactive({ q: '', departmentId: '', status: '', sortBy: 'employeeNo', sortOrder: 'ASC' });
const pagination = reactive({ page: 1, pageSize: 10 }); const meta = reactive({ total: 0, totalPages: 1 });
const emptyForm = () => ({ employeeNo:'', name:'', gender:'MALE', birthDate:'', idCard:'', phone:'', email:'', address:'', emergencyContact:'', emergencyPhone:'', departmentId:null, positionId:null, hireDate:'', baseSalary:0 });
const form = reactive(emptyForm());
const transferForm = reactive({ departmentId: null, positionId: null });
const rules = {
  employeeNo:[{required:true,message:'请输入工号',trigger:'blur'}], name:[{required:true,message:'请输入姓名',trigger:'blur'}],
  gender:[{required:true,message:'请选择性别',trigger:'change'}], departmentId:[{required:true,message:'请选择部门',trigger:'change'}],
  positionId:[{required:true,message:'请选择职位',trigger:'change'}], hireDate:[{required:true,message:'请选择入职日期',trigger:'change'}],
};
const availablePositions = computed(() => positions.value.filter((p) => !form.departmentId || Number(p.department_id) === Number(form.departmentId)));
const transferPositions = computed(() => positions.value.filter((p) => Number(p.department_id) === Number(transferForm.departmentId)));

async function load() {
  loading.value = true; error.value = '';
  try {
    const [result, deptData, positionData] = await Promise.all([
      api.get('/employees', { ...filters, page: pagination.page, pageSize: pagination.pageSize }),
      api.get('/departments', { sortBy: 'name' }),
      api.get('/positions', { status: 'ACTIVE', page: 1, pageSize: 100, sortBy: 'name' }),
    ]);
    rows.value = result; Object.assign(meta, result.meta || {}); departments.value = deptData; positions.value = positionData;
  } catch (err) { error.value = err.message; }
  finally { loading.value = false; }
}
function search() { pagination.page = 1; load(); }
function reset() { Object.assign(filters, { q:'', departmentId:'', status:'', sortBy:'employeeNo', sortOrder:'ASC' }); search(); }
function sortChange({ prop, order }) { filters.sortBy = prop; filters.sortOrder = order === 'descending' ? 'DESC' : 'ASC'; search(); }
function openCreate() { editing.value = null; Object.assign(form, emptyForm()); form.hireDate = new Date().toISOString().slice(0,10); dialogVisible.value = true; }
function openEdit(row) { editing.value = row; Object.assign(form, { ...emptyForm(), ...row }); dialogVisible.value = true; }
function departmentChanged() { if (!availablePositions.value.some((p) => Number(p.id) === Number(form.positionId))) form.positionId = null; }
function transferDepartmentChanged() { transferForm.positionId = null; }
async function save() {
  const valid = await formRef.value?.validate().catch(() => false); if (!valid) return; saving.value = true;
  try { if (editing.value) await api.put(`/employees/${editing.value.id}`, form); else await api.post('/employees', form); ElMessage.success(editing.value ? '员工档案已更新' : '员工已创建'); dialogVisible.value = false; await load(); }
  catch (err) { ElMessage.error(err.message); } finally { saving.value = false; }
}
async function rowAction(command,row) {
  if (command === 'transfer') {
    selected.value=row; transferForm.departmentId=row.departmentId; transferForm.positionId=row.positionId; transferVisible.value=true;
  } else if (command === 'offboard') {
    await offboard(row);
  } else if (command === 'delete') {
    await remove(row);
  }
}
async function submitTransfer() {
  if (!transferForm.departmentId || !transferForm.positionId) return ElMessage.warning('请选择目标部门和职位');
  try {
    await ElMessageBox.confirm(`确认将 ${selected.value.name} 调整到新部门与职位吗？`, '确认调岗', { type: 'warning' });
    saving.value = true; await api.post(`/employees/${selected.value.id}/transfer`, transferForm); ElMessage.success('调岗成功'); transferVisible.value=false; await load();
  } catch (err) { if (err !== 'cancel' && err !== 'close') ElMessage.error(err.message); } finally { saving.value=false; }
}
async function offboard(row) {
  try {
    const { value } = await ElMessageBox.prompt(`为 ${row.name} 办理离职。该操作会停用关联登录账号并写入审计日志。`, '确认离职', {
      inputValue: new Date().toISOString().slice(0,10), inputPattern: /^\d{4}-\d{2}-\d{2}$/, inputErrorMessage: '请输入 YYYY-MM-DD 格式日期', confirmButtonText: '确认离职', type: 'warning',
    });
    await api.post(`/employees/${row.id}/offboard`, { leaveDate: value }); ElMessage.success('离职手续已办理'); await load();
  } catch (err) { if (err !== 'cancel' && err !== 'close') ElMessage.error(err.message || '操作失败'); }
}
async function remove(row) {
  try { await ElMessageBox.confirm(`确认删除 ${row.name}（${row.employeeNo}）的档案吗？系统会检查考勤、请假、工资单等关联数据。`, '危险操作', { type:'error', confirmButtonText:'确认删除' }); await api.delete(`/employees/${row.id}`); ElMessage.success('员工档案已删除'); await load(); }
  catch (err) { if (err !== 'cancel' && err !== 'close') ElMessage.error(err.message || '删除失败'); }
}
function parseCsv(text) {
  const rows=[]; let row=[]; let cell=''; let quoted=false;
  const clean=text.replace(/^\uFEFF/,'');
  for(let i=0;i<clean.length;i++){
    const ch=clean[i];
    if(ch==='"'){ if(quoted && clean[i+1]==='"'){cell+='"';i++;} else quoted=!quoted; }
    else if(ch===','&&!quoted){row.push(cell);cell='';}
    else if((ch==='\n'||ch==='\r')&&!quoted){ if(ch==='\r'&&clean[i+1]==='\n')i++; row.push(cell); if(row.some((v)=>v.trim()!==''))rows.push(row); row=[];cell=''; }
    else cell+=ch;
  }
  if(cell!==''||row.length){row.push(cell);if(row.some((v)=>v.trim()!==''))rows.push(row);}
  return rows;
}
async function handleFile(event) {
  const file=event.target.files?.[0]; event.target.value=''; if(!file)return;
  try {
    const csv=parseCsv(await file.text()); if(csv.length<2) throw new Error('CSV 文件没有数据行');
    const headers=csv[0].map((h)=>h.trim()); const items=csv.slice(1).map((cells,index)=>Object.fromEntries(headers.map((h,i)=>[h,cells[i]?.trim()||'']))).map((item,index)=>({...item,__row:index+2}));
    await ElMessageBox.confirm(`将导入 ${items.length} 条员工数据，系统会逐行校验；任一行出错时整批不会写入。`, '确认批量导入', { type:'warning', confirmButtonText:'开始导入' });
    try { const result=await api.post('/employees/import',{items}); ElMessage.success(`成功导入 ${result.imported} 条员工数据`); await load(); }
    catch(err) {
      if(Array.isArray(err.details)&&err.details.length){ const html=err.details.map((d)=>`第 ${d.row} 行${d.field?`（${d.field}）`:''}：${d.message}`).join('<br>'); await ElMessageBox.alert(html,'导入校验失败',{dangerouslyUseHTMLString:true,type:'error'}); }
      else ElMessage.error(err.message);
    }
  } catch(err) { if(err!=='cancel'&&err!=='close')ElMessage.error(err.message||'CSV 解析失败'); }
}
function downloadTemplate() {
  const content='\uFEFF工号,姓名,性别,出生日期,身份证号,手机号,邮箱,部门,职位,入职日期,基本工资,地址,紧急联系人,紧急联系电话\r\nE100,示例员工,男,1995-01-01,110101199501010011,13800000100,demo@example.local,人力资源部,HR 专员,2026-01-01,10000,北京市,示例联系人,13900000100';
  const blob=new Blob([content],{type:'text/csv;charset=utf-8'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url;a.download='员工导入模板.csv';a.click();URL.revokeObjectURL(url);
}
async function exportCsv() { try { await api.download('/employees/export',{},`员工档案-${new Date().toISOString().slice(0,10)}.csv`); ElMessage.success('导出已开始'); } catch(err){ ElMessage.error(err.message); } }
onMounted(load);
</script>

<style scoped>
.form-grid { display:grid; grid-template-columns:1fr 1fr; gap:0 18px; }
.sensitive { color:#506182; font-variant-numeric:tabular-nums; }
@media(max-width:760px){.form-grid{grid-template-columns:1fr}}
</style>
