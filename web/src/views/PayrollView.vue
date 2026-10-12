<template>
  <div>
    <PageHeader title="薪酬管理" :description="canManage ? '生成并维护月度工资单，薪资修改、确认和发放均写入审计日志。' : '仅可查看自己的工资条，其他员工薪资数据不可访问。'">
      <template #actions><el-button v-if="canManage" @click="exportCsv">CSV 导出</el-button><el-button v-if="canManage" type="primary" @click="generateDialog=true">生成月度工资单</el-button></template>
    </PageHeader>
    <el-alert v-if="!canManage" title="薪资数据属于敏感信息，系统已按账号自动限定为本人数据。" type="info" :closable="false" show-icon style="margin-bottom:16px" />
    <div class="card filter-card">
      <el-form inline @submit.prevent="search">
        <el-form-item v-if="canManage" label="关键字"><el-input v-model="filters.q" clearable placeholder="姓名 / 工号" style="width:190px" @keyup.enter="search" /></el-form-item>
        <el-form-item v-if="canManage" label="部门"><el-select v-model="filters.departmentId" clearable filterable placeholder="全部" style="width:160px"><el-option v-for="d in departments" :key="d.id" :label="d.name" :value="d.id" /></el-select></el-form-item>
        <el-form-item label="月份"><el-date-picker v-model="filters.month" type="month" value-format="YYYY-MM" clearable placeholder="全部月份" style="width:150px" /></el-form-item>
        <el-form-item label="状态"><el-select v-model="filters.status" clearable placeholder="全部" style="width:125px"><el-option label="草稿" value="DRAFT" /><el-option label="已确认" value="CONFIRMED" /><el-option label="已发放" value="PAID" /></el-select></el-form-item>
        <el-form-item><el-button type="primary" @click="search">查询</el-button><el-button @click="reset">重置</el-button></el-form-item>
      </el-form>
    </div>
    <PageState :loading="loading" :error="error" @retry="load">
      <div class="card table-card">
        <div class="table-toolbar"><div><strong>{{ canManage ? '月度工资单' : '我的工资条' }}</strong><span style="margin-left:10px">共 {{ meta.total }} 条</span></div><span>金额单位：人民币元</span></div>
        <el-table :data="rows" empty-text="暂无工资单数据" @sort-change="sortChange">
          <el-table-column v-if="canManage" prop="employee_name" label="员工" min-width="120" sortable="custom"><template #default="{row}"><strong>{{ row.employee_name }}</strong><div class="muted">{{ row.employee_no }}</div></template></el-table-column>
          <el-table-column v-if="canManage" prop="department_name" label="部门" min-width="140" sortable="custom" />
          <el-table-column prop="month" label="月份" width="105" sortable="custom" />
          <el-table-column prop="base_salary" label="基本工资" min-width="120" sortable="custom"><template #default="{row}"><span class="money">{{ formatMoney(row.base_salary) }}</span></template></el-table-column>
          <el-table-column prop="performance_bonus" label="绩效奖金" min-width="120"><template #default="{row}"><span class="money">{{ formatMoney(row.performance_bonus) }}</span></template></el-table-column>
          <el-table-column prop="social_security" label="社保公积金" min-width="125"><template #default="{row}"><span class="money deduction">-{{ formatMoney(row.social_security) }}</span></template></el-table-column>
          <el-table-column prop="tax" label="个税" min-width="110"><template #default="{row}"><span class="money deduction">-{{ formatMoney(row.tax) }}</span></template></el-table-column>
          <el-table-column prop="deduction" label="其他扣款" min-width="110"><template #default="{row}"><span class="money deduction">-{{ formatMoney(row.deduction) }}</span></template></el-table-column>
          <el-table-column prop="net_salary" label="实发工资" min-width="130" sortable="custom"><template #default="{row}"><strong class="money net">{{ formatMoney(row.net_salary) }}</strong></template></el-table-column>
          <el-table-column prop="status" label="状态" width="100" sortable="custom"><template #default="{row}"><StatusTag :status="row.status" kind="payroll" /></template></el-table-column>
          <el-table-column v-if="canManage" label="操作" width="190" fixed="right"><template #default="{row}">
            <el-button v-if="row.status==='DRAFT'" link type="primary" @click="openEdit(row)">编辑</el-button>
            <el-button v-if="row.status==='DRAFT'" link type="success" @click="confirmState(row,'confirm')">确认</el-button>
            <el-button v-if="row.status==='CONFIRMED'" link type="success" @click="confirmState(row,'paid')">发放</el-button>
            <span v-if="row.status==='PAID'" class="muted">已完成</span>
          </template></el-table-column>
        </el-table>
        <div class="table-footer"><el-pagination v-model:current-page="pagination.page" v-model:page-size="pagination.pageSize" :total="meta.total" :page-sizes="[10,20,50]" layout="total, sizes, prev, pager, next" @current-change="load" @size-change="search" /></div>
      </div>
    </PageState>
    <el-dialog v-model="generateDialog" title="生成月度工资单" width="480px">
      <el-alert title="系统将为符合条件的员工创建草稿工资单；已存在工资单的员工会自动跳过。" type="info" :closable="false" style="margin-bottom:18px" />
      <el-form label-width="90px"><el-form-item label="工资月份"><el-date-picker v-model="generateMonth" type="month" value-format="YYYY-MM" style="width:100%" /></el-form-item></el-form>
      <template #footer><el-button @click="generateDialog=false">取消</el-button><el-button type="primary" :loading="saving" @click="generate">确认生成</el-button></template>
    </el-dialog>
    <el-dialog v-model="editDialog" title="编辑工资单草稿" width="620px" destroy-on-close>
      <el-alert title="薪资项修改属于高敏感操作，保存时将记录修改前后值和操作人。" type="warning" :closable="false" style="margin-bottom:18px" />
      <el-form ref="formRef" :model="form" :rules="rules" label-width="105px">
        <el-form-item label="员工"><strong>{{ editing?.employee_name || '—' }}</strong></el-form-item><el-form-item label="月份"><el-date-picker v-model="form.month" type="month" value-format="YYYY-MM" style="width:100%" /></el-form-item>
        <div class="money-grid">
          <el-form-item label="基本工资"><el-input-number v-model="form.baseSalary" :min="0" :step="500" :precision="2" style="width:100%" /></el-form-item>
          <el-form-item label="绩效奖金"><el-input-number v-model="form.performanceBonus" :min="0" :step="100" :precision="2" style="width:100%" /></el-form-item>
          <el-form-item label="社保公积金"><el-input-number v-model="form.socialSecurity" :min="0" :step="100" :precision="2" style="width:100%" /></el-form-item>
          <el-form-item label="个税"><el-input-number v-model="form.tax" :min="0" :step="50" :precision="2" style="width:100%" /></el-form-item>
          <el-form-item label="其他扣款"><el-input-number v-model="form.deduction" :min="0" :step="50" :precision="2" style="width:100%" /></el-form-item>
        </div>
        <div class="net-preview">预计实发：<strong>{{ formatMoney(netPreview) }}</strong></div>
      </el-form>
      <template #footer><el-button @click="editDialog=false">取消</el-button><el-button type="primary" :loading="saving" @click="save">保存工资单</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { api } from '../api/client.js';
import { authStore } from '../stores/auth.js';
import { formatMoney } from '../utils/format.js';
import PageHeader from '../components/PageHeader.vue'; import PageState from '../components/PageState.vue'; import StatusTag from '../components/StatusTag.vue';
const canManage=computed(()=>authStore.canManage.value);const rows=ref([]);const departments=ref([]);const loading=ref(true);const error=ref('');const saving=ref(false);const generateDialog=ref(false);const generateMonth=ref(new Date().toISOString().slice(0,7));const editDialog=ref(false);const editing=ref(null);const formRef=ref(null);
const filters=reactive({q:'',departmentId:'',month:'',status:'',sortBy:'month',sortOrder:'DESC'});const pagination=reactive({page:1,pageSize:10});const meta=reactive({total:0,totalPages:1});
const form=reactive({month:'',baseSalary:0,performanceBonus:0,socialSecurity:0,tax:0,deduction:0});const rules={month:[{required:true,message:'请选择月份',trigger:'change'}]};const netPreview=computed(()=>Number(form.baseSalary||0)+Number(form.performanceBonus||0)-Number(form.socialSecurity||0)-Number(form.tax||0)-Number(form.deduction||0));
async function load(){loading.value=true;error.value='';try{const requests=[api.get('/payrolls',{...filters,page:pagination.page,pageSize:pagination.pageSize})];if(canManage.value)requests.push(api.get('/departments',{sortBy:'name'}));const[result,deptData]=await Promise.all(requests);rows.value=result;Object.assign(meta,result.meta||{});if(deptData)departments.value=deptData;}catch(err){error.value=err.message;}finally{loading.value=false;}}
function search(){pagination.page=1;load();}function reset(){Object.assign(filters,{q:'',departmentId:'',month:'',status:'',sortBy:'month',sortOrder:'DESC'});search();}function sortChange({prop,order}){filters.sortBy=prop;filters.sortOrder=order==='ascending'?'ASC':'DESC';search();}
async function generate(){if(!generateMonth.value)return ElMessage.warning('请选择工资月份');try{await ElMessageBox.confirm(`确认生成 ${generateMonth.value} 月度工资单草稿吗？`,'确认生成',{type:'warning'});saving.value=true;const result=await api.post('/payrolls/generate',{month:generateMonth.value});ElMessage.success(`已生成 ${result.generated} 条，跳过 ${result.skipped} 条`);generateDialog.value=false;await load();}catch(err){if(err!=='cancel'&&err!=='close')ElMessage.error(err.message);}finally{saving.value=false;}}
function openEdit(row){editing.value=row;Object.assign(form,{month:row.month,baseSalary:row.base_salary,performanceBonus:row.performance_bonus,socialSecurity:row.social_security,tax:row.tax,deduction:row.deduction});editDialog.value=true;}
async function save(){const valid=await formRef.value?.validate().catch(()=>false);if(!valid)return;try{await ElMessageBox.confirm('确认保存本次薪资修改吗？修改前后金额会写入审计日志。','敏感操作确认',{type:'warning',confirmButtonText:'确认保存'});saving.value=true;await api.put(`/payrolls/${editing.value.id}`,form);ElMessage.success('工资单已保存');editDialog.value=false;await load();}catch(err){if(err!=='cancel'&&err!=='close')ElMessage.error(err.message);}finally{saving.value=false;}}
async function confirmState(row,action){try{await ElMessageBox.confirm(action==='confirm'?`确认锁定 ${row.month} 工资单？确认后不能再修改金额。`:`确认将 ${row.month} 工资单标记为已发放吗？`,'状态流转确认',{type:'warning'});await api.post(`/payrolls/${row.id}/${action}`,{});ElMessage.success(action==='confirm'?'工资单已确认':'已标记为发放');await load();}catch(err){if(err!=='cancel'&&err!=='close')ElMessage.error(err.message);}}
async function exportCsv(){try{await api.download('/payrolls/export',filters,'工资单.csv');ElMessage.success('导出已开始');}catch(err){ElMessage.error(err.message);}}
onMounted(load);
</script>
<style scoped>.money-grid{display:grid;grid-template-columns:1fr 1fr;gap:0 18px}.deduction{color:#9b5b5b}.net{color:var(--hr-success)}.net-preview{padding:14px 16px;border-radius:10px;background:#f3f8ff;text-align:right}.net-preview strong{margin-left:8px;color:var(--hr-primary);font-size:20px}@media(max-width:650px){.money-grid{grid-template-columns:1fr}}</style>
