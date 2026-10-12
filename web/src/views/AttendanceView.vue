<template>
  <div>
    <PageHeader :title="canManage ? '考勤管理' : '我的考勤'" :description="canManage ? '按月维护全员考勤汇总，异常记录可筛选追踪。' : '查看个人月度出勤、迟到、缺勤与加班汇总。'">
      <template #actions><el-button @click="exportCsv">CSV 导出</el-button><el-button v-if="canManage" type="primary" @click="openCreate">新增记录</el-button></template>
    </PageHeader>
    <div class="card filter-card">
      <el-form inline @submit.prevent="search">
        <el-form-item v-if="canManage" label="关键字"><el-input v-model="filters.q" clearable placeholder="姓名 / 工号" style="width:180px" @keyup.enter="search" /></el-form-item>
        <el-form-item v-if="canManage" label="部门"><el-select v-model="filters.departmentId" clearable filterable placeholder="全部" style="width:160px"><el-option v-for="d in departments" :key="d.id" :label="d.name" :value="d.id" /></el-select></el-form-item>
        <el-form-item label="月份"><el-date-picker v-model="filters.month" type="month" value-format="YYYY-MM" clearable placeholder="全部月份" style="width:150px" /></el-form-item>
        <el-form-item label="状态"><el-select v-model="filters.status" clearable placeholder="全部" style="width:120px"><el-option label="正常" value="NORMAL" /><el-option label="需关注" value="ATTENTION" /></el-select></el-form-item>
        <el-form-item><el-button type="primary" @click="search">查询</el-button><el-button @click="reset">重置</el-button></el-form-item>
      </el-form>
    </div>
    <PageState :loading="loading" :error="error" @retry="load">
      <div class="card table-card">
        <div class="table-toolbar"><div><strong>月度考勤汇总</strong><span style="margin-left:10px">共 {{ meta.total }} 条</span></div><span>应出勤按月度标准工作日记录</span></div>
        <el-table :data="rows" empty-text="暂无考勤记录" @sort-change="sortChange">
          <el-table-column v-if="canManage" prop="employee_name" label="员工" min-width="120" sortable="custom"><template #default="{row}"><strong>{{ row.employee_name }}</strong><div class="muted">{{ row.employee_no }}</div></template></el-table-column>
          <el-table-column v-if="canManage" prop="department_name" label="部门" min-width="140" sortable="custom" />
          <el-table-column prop="month" label="月份" width="110" sortable="custom" />
          <el-table-column prop="work_days" label="应出勤" width="90" /><el-table-column prop="actual_days" label="实出勤" width="90" />
          <el-table-column prop="late_count" label="迟到次数" width="100" sortable="custom" /><el-table-column prop="absent_days" label="缺勤天数" width="100" />
          <el-table-column prop="overtime_hours" label="加班小时" width="100" /><el-table-column prop="status" label="状态" width="100" sortable="custom"><template #default="{row}"><StatusTag :status="row.status" kind="attendance" /></template></el-table-column>
          <el-table-column prop="remark" label="备注" min-width="180" show-overflow-tooltip />
          <el-table-column v-if="canManage" label="操作" width="130" fixed="right"><template #default="{row}"><el-button link type="primary" @click="openEdit(row)">编辑</el-button><el-button link type="danger" @click="remove(row)">删除</el-button></template></el-table-column>
        </el-table>
        <div class="table-footer"><el-pagination v-model:current-page="pagination.page" v-model:page-size="pagination.pageSize" :total="meta.total" :page-sizes="[10,20,50]" layout="total, sizes, prev, pager, next" @current-change="load" @size-change="search" /></div>
      </div>
    </PageState>
    <el-dialog v-model="dialogVisible" :title="editing ? '编辑考勤记录' : '新增考勤记录'" width="620px" destroy-on-close>
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="员工" prop="employeeId"><el-select v-model="form.employeeId" filterable style="width:100%"><el-option v-for="e in employees" :key="e.id" :label="`${e.name} · ${e.employeeNo}`" :value="e.id" /></el-select></el-form-item>
        <el-form-item label="月份" prop="month"><el-date-picker v-model="form.month" type="month" value-format="YYYY-MM" style="width:100%" /></el-form-item>
        <div class="number-grid">
          <el-form-item label="应出勤"><el-input-number v-model="form.workDays" :min="0" :max="31" :step="0.5" style="width:100%" /></el-form-item>
          <el-form-item label="实出勤"><el-input-number v-model="form.actualDays" :min="0" :max="31" :step="0.5" style="width:100%" /></el-form-item>
          <el-form-item label="迟到次数"><el-input-number v-model="form.lateCount" :min="0" :max="31" style="width:100%" /></el-form-item>
          <el-form-item label="缺勤天数"><el-input-number v-model="form.absentDays" :min="0" :max="31" :step="0.5" style="width:100%" /></el-form-item>
          <el-form-item label="加班小时"><el-input-number v-model="form.overtimeHours" :min="0" :max="300" :step="0.5" style="width:100%" /></el-form-item>
          <el-form-item label="状态"><el-select v-model="form.status" style="width:100%"><el-option label="正常" value="NORMAL" /><el-option label="需关注" value="ATTENTION" /></el-select></el-form-item>
        </div>
        <el-form-item label="备注"><el-input v-model="form.remark" type="textarea" :rows="3" maxlength="200" show-word-limit /></el-form-item>
      </el-form>
      <template #footer><el-button @click="dialogVisible=false">取消</el-button><el-button type="primary" :loading="saving" @click="save">保存</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { api } from '../api/client.js';
import { authStore } from '../stores/auth.js';
import PageHeader from '../components/PageHeader.vue'; import PageState from '../components/PageState.vue'; import StatusTag from '../components/StatusTag.vue';
const canManage=computed(()=>authStore.canManage.value); const rows=ref([]); const departments=ref([]); const employees=ref([]); const loading=ref(true); const error=ref(''); const saving=ref(false); const dialogVisible=ref(false); const editing=ref(null); const formRef=ref(null);
const filters=reactive({q:'',departmentId:'',month:'',status:'',sortBy:'month',sortOrder:'DESC'}); const pagination=reactive({page:1,pageSize:10}); const meta=reactive({total:0,totalPages:1});
const emptyForm=()=>({employeeId:null,month:new Date().toISOString().slice(0,7),workDays:21.75,actualDays:21.75,lateCount:0,absentDays:0,overtimeHours:0,status:'NORMAL',remark:''}); const form=reactive(emptyForm());
const rules={employeeId:[{required:true,message:'请选择员工',trigger:'change'}],month:[{required:true,message:'请选择月份',trigger:'change'}]};
async function load(){loading.value=true;error.value='';try{const requests=[api.get('/attendance',{...filters,page:pagination.page,pageSize:pagination.pageSize})];if(canManage.value)requests.push(api.get('/departments',{sortBy:'name'}),api.get('/employees',{page:1,pageSize:100,sortBy:'name'}));const [result,deptData,employeeData]=await Promise.all(requests);rows.value=result;Object.assign(meta,result.meta||{});if(deptData)departments.value=deptData;if(employeeData)employees.value=employeeData;}catch(err){error.value=err.message;}finally{loading.value=false;}}
function search(){pagination.page=1;load();} function reset(){Object.assign(filters,{q:'',departmentId:'',month:'',status:'',sortBy:'month',sortOrder:'DESC'});search();} function sortChange({prop,order}){filters.sortBy=prop;filters.sortOrder=order==='ascending'?'ASC':'DESC';search();}
function openCreate(){editing.value=null;Object.assign(form,emptyForm());dialogVisible.value=true;} function openEdit(row){editing.value=row;Object.assign(form,{employeeId:row.employee_id,month:row.month,workDays:row.work_days,actualDays:row.actual_days,lateCount:row.late_count,absentDays:row.absent_days,overtimeHours:row.overtime_hours,status:row.status,remark:row.remark});dialogVisible.value=true;}
async function save(){const valid=await formRef.value?.validate().catch(()=>false);if(!valid)return;saving.value=true;try{if(editing.value)await api.put(`/attendance/${editing.value.id}`,form);else await api.post('/attendance',form);ElMessage.success(editing.value?'考勤记录已更新':'考勤记录已创建');dialogVisible.value=false;await load();}catch(err){ElMessage.error(err.message);}finally{saving.value=false;}}
async function remove(row){try{await ElMessageBox.confirm(`确认删除 ${row.employee_name} ${row.month} 的考勤记录吗？`,'确认删除',{type:'warning'});await api.delete(`/attendance/${row.id}`);ElMessage.success('记录已删除');await load();}catch(err){if(err!=='cancel'&&err!=='close')ElMessage.error(err.message||'删除失败');}}
async function exportCsv(){try{await api.download('/attendance/export',filters,'考勤记录.csv');ElMessage.success('导出已开始');}catch(err){ElMessage.error(err.message);}}
onMounted(load);
</script>
<style scoped>.number-grid{display:grid;grid-template-columns:1fr 1fr;gap:0 18px}@media(max-width:650px){.number-grid{grid-template-columns:1fr}}</style>
