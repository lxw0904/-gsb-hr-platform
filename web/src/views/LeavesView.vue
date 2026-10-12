<template>
  <div>
    <PageHeader title="请假与审批" description="请假申请严格遵循草稿、待审、通过或驳回状态流转，审批记录不可跳过。">
      <template #actions><el-button @click="exportCsv">CSV 导出</el-button><el-button type="primary" @click="openCreate">发起请假</el-button></template>
    </PageHeader>
    <div class="card filter-card">
      <el-form inline @submit.prevent="search">
        <el-form-item label="关键字"><el-input v-model="filters.q" clearable placeholder="姓名 / 工号 / 事由" style="width:200px" @keyup.enter="search" /></el-form-item>
        <el-form-item v-if="canManage" label="部门"><el-select v-model="filters.departmentId" clearable filterable placeholder="全部" style="width:150px"><el-option v-for="d in departments" :key="d.id" :label="d.name" :value="d.id" /></el-select></el-form-item>
        <el-form-item label="类型"><el-select v-model="filters.type" clearable placeholder="全部" style="width:120px"><el-option v-for="(label,value) in LEAVE_TYPE_LABELS" :key="value" :label="label" :value="value" /></el-select></el-form-item>
        <el-form-item label="状态"><el-select v-model="filters.status" clearable placeholder="全部" style="width:125px"><el-option v-for="(label,value) in LEAVE_STATUS_LABELS" :key="value" :label="label" :value="value" /></el-select></el-form-item>
        <el-form-item label="开始月份"><el-date-picker v-model="filters.month" type="month" value-format="YYYY-MM" clearable placeholder="全部" style="width:145px" /></el-form-item>
        <el-form-item><el-button type="primary" @click="search">查询</el-button><el-button @click="reset">重置</el-button></el-form-item>
      </el-form>
    </div>
    <PageState :loading="loading" :error="error" @retry="load">
      <div class="card table-card">
        <div class="table-toolbar"><div><strong>请假申请</strong><span style="margin-left:10px">共 {{ meta.total }} 条</span></div><span>审批人不能审批自己的申请</span></div>
        <el-table :data="rows" empty-text="暂无请假申请" @sort-change="sortChange">
          <el-table-column v-if="canManage" prop="employee_name" label="申请人" min-width="120" sortable="custom"><template #default="{row}"><strong>{{ row.employee_name }}</strong><div class="muted">{{ row.employee_no }}</div></template></el-table-column>
          <el-table-column prop="department_name" label="部门" min-width="140" sortable="custom" />
          <el-table-column prop="type" label="类型" width="90"><template #default="{row}"><el-tag effect="plain" type="info">{{ labelOf(LEAVE_TYPE_LABELS,row.type) }}</el-tag></template></el-table-column>
          <el-table-column prop="start_date" label="开始日期" width="115" sortable="custom"><template #default="{row}">{{ formatDate(row.start_date) }}</template></el-table-column>
          <el-table-column prop="end_date" label="结束日期" width="115" sortable="custom"><template #default="{row}">{{ formatDate(row.end_date) }}</template></el-table-column>
          <el-table-column prop="days" label="天数" width="80" sortable="custom" />
          <el-table-column prop="reason" label="请假事由" min-width="190" show-overflow-tooltip />
          <el-table-column prop="status" label="状态" width="100" sortable="custom"><template #default="{row}"><StatusTag :status="row.status" kind="leave" /></template></el-table-column>
          <el-table-column prop="approver_name" label="审批人" width="100"><template #default="{row}">{{ row.approver_name || '—' }}</template></el-table-column>
          <el-table-column prop="comment" label="审批意见" min-width="140" show-overflow-tooltip />
          <el-table-column label="操作" width="190" fixed="right">
            <template #default="{row}">
              <template v-if="isOwner(row) && row.status === 'DRAFT'"><el-button link type="primary" @click="openEdit(row)">编辑</el-button><el-button link type="primary" @click="submit(row)">提交</el-button></template>
              <template v-if="isOwner(row) && ['DRAFT','PENDING'].includes(row.status)"><el-button link type="warning" @click="cancel(row)">取消</el-button></template>
              <template v-if="canManage && row.status === 'PENDING' && !isOwner(row)"><el-button link type="success" @click="approve(row)">通过</el-button><el-button link type="danger" @click="reject(row)">驳回</el-button></template>
              <span v-if="!actionable(row)" class="muted">已结束</span>
            </template>
          </el-table-column>
        </el-table>
        <div class="table-footer"><el-pagination v-model:current-page="pagination.page" v-model:page-size="pagination.pageSize" :total="meta.total" :page-sizes="[10,20,50]" layout="total, sizes, prev, pager, next" @current-change="load" @size-change="search" /></div>
      </div>
    </PageState>
    <el-dialog v-model="dialogVisible" :title="editing ? '编辑请假草稿' : '发起请假申请'" width="580px" destroy-on-close>
      <el-form ref="formRef" :model="form" :rules="rules" label-width="90px">
        <el-form-item label="请假类型" prop="type"><el-select v-model="form.type" style="width:100%"><el-option v-for="(label,value) in LEAVE_TYPE_LABELS" :key="value" :label="label" :value="value" /></el-select></el-form-item>
        <el-form-item label="开始日期" prop="startDate"><el-date-picker v-model="form.startDate" type="date" value-format="YYYY-MM-DD" style="width:100%" /></el-form-item>
        <el-form-item label="结束日期" prop="endDate"><el-date-picker v-model="form.endDate" type="date" value-format="YYYY-MM-DD" style="width:100%" /></el-form-item>
        <el-form-item label="请假事由" prop="reason"><el-input v-model="form.reason" type="textarea" :rows="4" maxlength="500" show-word-limit /></el-form-item>
      </el-form>
      <template #footer><el-button @click="dialogVisible=false">取消</el-button><el-button :loading="saving" @click="save(false)">保存草稿</el-button><el-button type="primary" :loading="saving" @click="save(true)">保存并提交</el-button></template>
    </el-dialog>
    <el-dialog v-model="approvalVisible" :title="approvalMode === 'approve' ? '通过请假申请' : '驳回请假申请'" width="520px">
      <el-alert :title="approvalMode === 'approve' ? '通过后状态将变为已通过，且不可回退。' : '驳回时必须填写原因，申请人可查看审批意见。'" :type="approvalMode === 'approve' ? 'success' : 'warning'" :closable="false" style="margin-bottom:18px" />
      <el-form label-width="80px"><el-form-item label="申请人"><strong>{{ selected?.employee_name }}</strong></el-form-item><el-form-item label="审批意见"><el-input v-model="comment" type="textarea" :rows="3" maxlength="300" show-word-limit :placeholder="approvalMode === 'reject' ? '请填写驳回原因' : '可填写审批说明'" /></el-form-item></el-form>
      <template #footer><el-button @click="approvalVisible=false">取消</el-button><el-button :type="approvalMode === 'approve' ? 'success' : 'danger'" :loading="saving" @click="submitApproval">确认{{ approvalMode === 'approve' ? '通过' : '驳回' }}</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { api } from '../api/client.js';
import { authStore } from '../stores/auth.js';
import { formatDate, LEAVE_STATUS_LABELS, LEAVE_TYPE_LABELS, labelOf } from '../utils/format.js';
import PageHeader from '../components/PageHeader.vue'; import PageState from '../components/PageState.vue'; import StatusTag from '../components/StatusTag.vue';
const canManage=computed(()=>authStore.canManage.value); const rows=ref([]); const departments=ref([]); const loading=ref(true); const error=ref(''); const saving=ref(false); const dialogVisible=ref(false); const approvalVisible=ref(false); const editing=ref(null); const selected=ref(null); const approvalMode=ref('approve'); const comment=ref(''); const formRef=ref(null);
const filters=reactive({q:'',departmentId:'',type:'',status:'',month:'',sortBy:'createdAt',sortOrder:'DESC'});const pagination=reactive({page:1,pageSize:10});const meta=reactive({total:0,totalPages:1});
const emptyForm=()=>({type:'ANNUAL',startDate:'',endDate:'',reason:''});const form=reactive(emptyForm());
const rules={type:[{required:true,message:'请选择请假类型',trigger:'change'}],startDate:[{required:true,message:'请选择开始日期',trigger:'change'}],endDate:[{required:true,message:'请选择结束日期',trigger:'change'}],reason:[{required:true,message:'请填写请假事由',trigger:'blur'}]};
function isOwner(row){return Number(row.employee_id)===Number(authStore.state.user?.employeeId);} function actionable(row){return (isOwner(row)&&['DRAFT','PENDING'].includes(row.status))||(canManage.value&&row.status==='PENDING'&&!isOwner(row));}
async function load(){loading.value=true;error.value='';try{const requests=[api.get('/leaves',{...filters,page:pagination.page,pageSize:pagination.pageSize})];if(canManage.value)requests.push(api.get('/departments',{sortBy:'name'}));const [result,deptData]=await Promise.all(requests);rows.value=result;Object.assign(meta,result.meta||{});if(deptData)departments.value=deptData;}catch(err){error.value=err.message;}finally{loading.value=false;}}
function search(){pagination.page=1;load();}function reset(){Object.assign(filters,{q:'',departmentId:'',type:'',status:'',month:'',sortBy:'createdAt',sortOrder:'DESC'});search();}function sortChange({prop,order}){filters.sortBy=prop;filters.sortOrder=order==='ascending'?'ASC':'DESC';search();}
function openCreate(){editing.value=null;Object.assign(form,emptyForm());dialogVisible.value=true;}function openEdit(row){editing.value=row;Object.assign(form,{type:row.type,startDate:row.start_date,endDate:row.end_date,reason:row.reason});dialogVisible.value=true;}
async function save(submitAfter){const valid=await formRef.value?.validate().catch(()=>false);if(!valid)return;saving.value=true;try{if(editing.value)await api.put(`/leaves/${editing.value.id}`,form);else await api.post('/leaves',{...form,submit:submitAfter});if(editing.value&&submitAfter)await api.post(`/leaves/${editing.value.id}/submit`);ElMessage.success(submitAfter?'申请已提交审批':'草稿已保存');dialogVisible.value=false;await load();}catch(err){ElMessage.error(err.message);}finally{saving.value=false;}}
async function submit(row){try{await ElMessageBox.confirm('提交后申请将进入待审批状态，确认继续吗？','确认提交',{type:'warning'});await api.post(`/leaves/${row.id}/submit`);ElMessage.success('申请已提交');await load();}catch(err){if(err!=='cancel'&&err!=='close')ElMessage.error(err.message);}}
async function cancel(row){try{await ElMessageBox.confirm('确认取消该请假申请吗？状态将变为已取消。','确认取消',{type:'warning'});await api.post(`/leaves/${row.id}/cancel`,{});ElMessage.success('申请已取消');await load();}catch(err){if(err!=='cancel'&&err!=='close')ElMessage.error(err.message);}}
function approve(row){selected.value=row;approvalMode.value='approve';comment.value='同意';approvalVisible.value=true;}function reject(row){selected.value=row;approvalMode.value='reject';comment.value='';approvalVisible.value=true;}
async function submitApproval(){if(approvalMode.value==='reject'&&!comment.value.trim())return ElMessage.warning('驳回时必须填写审批意见');saving.value=true;try{await api.post(`/leaves/${selected.value.id}/${approvalMode.value}`,{comment:comment.value});ElMessage.success(approvalMode.value==='approve'?'申请已通过':'申请已驳回');approvalVisible.value=false;await load();}catch(err){ElMessage.error(err.message);}finally{saving.value=false;}}
async function exportCsv(){try{await api.download('/leaves/export',filters,'请假申请.csv');ElMessage.success('导出已开始');}catch(err){ElMessage.error(err.message);}}
onMounted(load);
</script>
