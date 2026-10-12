<template>
  <div>
    <PageHeader title="用户与角色" description="管理登录账号、角色权限和员工档案关联。权限变更与密码重置全程留痕。">
      <template #actions><el-button type="danger" plain @click="resetDemo">重置演示数据</el-button><el-button type="primary" @click="openCreate">新增用户</el-button></template>
    </PageHeader>
    <div class="card filter-card">
      <el-form inline @submit.prevent="search">
        <el-form-item label="关键字"><el-input v-model="filters.q" clearable placeholder="用户名 / 员工姓名 / 工号" style="width:220px" @keyup.enter="search" /></el-form-item>
        <el-form-item label="角色"><el-select v-model="filters.role" clearable placeholder="全部" style="width:130px"><el-option label="管理员" value="ADMIN" /><el-option label="HR" value="HR" /><el-option label="普通员工" value="EMPLOYEE" /></el-select></el-form-item>
        <el-form-item label="状态"><el-select v-model="filters.status" clearable placeholder="全部" style="width:120px"><el-option label="启用" value="ACTIVE" /><el-option label="停用" value="DISABLED" /></el-select></el-form-item>
        <el-form-item><el-button type="primary" @click="search">查询</el-button><el-button @click="reset">重置</el-button></el-form-item>
      </el-form>
    </div>
    <PageState :loading="loading" :error="error" @retry="load">
      <div class="card table-card">
        <div class="table-toolbar"><div><strong>账号列表</strong><span style="margin-left:10px">共 {{ meta.total }} 个</span></div><span>系统至少保留一名启用管理员</span></div>
        <el-table :data="rows" empty-text="暂无用户数据" @sort-change="sortChange">
          <el-table-column prop="username" label="用户名" min-width="130" sortable="custom"><template #default="{row}"><strong>{{ row.username }}</strong><div v-if="row.id===authStore.state.user?.id" class="muted">当前账号</div></template></el-table-column>
          <el-table-column prop="employeeName" label="关联员工" min-width="140"><template #default="{row}">{{ row.employeeName || '未关联' }}<div v-if="row.employeeNo" class="muted">{{ row.employeeNo }}</div></template></el-table-column>
          <el-table-column prop="departmentName" label="部门" min-width="140" />
          <el-table-column prop="role" label="角色" width="110" sortable="custom"><template #default="{row}"><el-tag :type="row.role==='ADMIN'?'danger':row.role==='HR'?'primary':'info'" effect="light">{{ labelOf(ROLE_LABELS,row.role) }}</el-tag></template></el-table-column>
          <el-table-column prop="isActive" label="状态" width="100" sortable="custom"><template #default="{row}"><el-tag :type="row.isActive?'success':'info'">{{ row.isActive?'启用':'停用' }}</el-tag></template></el-table-column>
          <el-table-column prop="lastLoginAt" label="最后登录" min-width="170" sortable="custom"><template #default="{row}">{{ formatDateTime(row.lastLoginAt) }}</template></el-table-column>
          <el-table-column prop="createdAt" label="创建时间" min-width="170" sortable="custom"><template #default="{row}">{{ formatDateTime(row.createdAt) }}</template></el-table-column>
          <el-table-column label="操作" width="220" fixed="right"><template #default="{row}"><el-button link type="primary" @click="openEdit(row)">编辑权限</el-button><el-button link type="warning" @click="resetPassword(row)">重置密码</el-button><el-button link type="danger" :disabled="row.id===authStore.state.user?.id" @click="remove(row)">删除</el-button></template></el-table-column>
        </el-table>
        <div class="table-footer"><el-pagination v-model:current-page="pagination.page" v-model:page-size="pagination.pageSize" :total="meta.total" :page-sizes="[10,20,50]" layout="total, sizes, prev, pager, next" @current-change="load" @size-change="search" /></div>
      </div>
    </PageState>
    <el-dialog v-model="dialogVisible" :title="editing ? '编辑用户权限' : '新增用户'" width="570px" destroy-on-close>
      <el-alert v-if="editing" title="角色和启用状态变更会立即影响该用户的访问权限，请谨慎操作。" type="warning" :closable="false" style="margin-bottom:18px" />
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="用户名" prop="username"><el-input v-model="form.username" maxlength="32" /></el-form-item>
        <el-form-item v-if="!editing" label="初始密码" prop="password"><el-input v-model="form.password" type="password" show-password maxlength="64" /></el-form-item>
        <el-form-item label="角色" prop="role"><el-select v-model="form.role" style="width:100%"><el-option label="管理员" value="ADMIN" /><el-option label="HR" value="HR" /><el-option label="普通员工" value="EMPLOYEE" /></el-select></el-form-item>
        <el-form-item label="关联员工"><el-select v-model="form.employeeId" clearable filterable placeholder="可不关联" style="width:100%"><el-option v-for="e in employees" :key="e.id" :label="`${e.name} · ${e.employeeNo} · ${e.departmentName}`" :value="e.id" /></el-select></el-form-item>
        <el-form-item label="账号状态"><el-switch v-model="form.isActive" inline-prompt active-text="启用" inactive-text="停用" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="dialogVisible=false">取消</el-button><el-button type="primary" :loading="saving" @click="save">保存</el-button></template>
    </el-dialog>
    <el-dialog v-model="passwordDialog" title="重置用户密码" width="480px" destroy-on-close>
      <el-alert :title="`将为账号 ${passwordTarget?.username} 设置新密码。此操作会写入审计日志。`" type="warning" :closable="false" style="margin-bottom:18px" />
      <el-form ref="passwordFormRef" :model="passwordForm" :rules="passwordRules" label-width="90px"><el-form-item label="新密码" prop="password"><el-input v-model="passwordForm.password" type="password" show-password maxlength="64" /></el-form-item></el-form>
      <template #footer><el-button @click="passwordDialog=false">取消</el-button><el-button type="primary" :loading="saving" @click="savePassword">确认重置</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { api } from '../api/client.js';
import { authStore } from '../stores/auth.js';
import { formatDateTime, ROLE_LABELS, labelOf } from '../utils/format.js';
import PageHeader from '../components/PageHeader.vue'; import PageState from '../components/PageState.vue';
const rows=ref([]);const employees=ref([]);const loading=ref(true);const error=ref('');const saving=ref(false);const dialogVisible=ref(false);const passwordDialog=ref(false);const editing=ref(null);const passwordTarget=ref(null);const formRef=ref(null);const passwordFormRef=ref(null);
const filters=reactive({q:'',role:'',status:'',sortBy:'username',sortOrder:'ASC'});const pagination=reactive({page:1,pageSize:10});const meta=reactive({total:0,totalPages:1});const form=reactive({username:'',password:'',role:'EMPLOYEE',employeeId:null,isActive:true});const passwordForm=reactive({password:''});
const rules={username:[{required:true,message:'请输入用户名',trigger:'blur'}],password:[{required:true,min:6,message:'初始密码至少 6 位',trigger:'blur'}],role:[{required:true,message:'请选择角色',trigger:'change'}]};const passwordRules={password:[{required:true,min:6,message:'新密码至少 6 位',trigger:'blur'}]};
async function load(){loading.value=true;error.value='';try{const[result,employeeData]=await Promise.all([api.get('/admin/users',{...filters,page:pagination.page,pageSize:pagination.pageSize}),api.get('/employees',{page:1,pageSize:100,sortBy:'name'})]);rows.value=result;Object.assign(meta,result.meta||{});employees.value=employeeData;}catch(err){error.value=err.message;}finally{loading.value=false;}}
function search(){pagination.page=1;load();}function reset(){Object.assign(filters,{q:'',role:'',status:'',sortBy:'username',sortOrder:'ASC'});search();}function sortChange({prop,order}){filters.sortBy=prop;filters.sortOrder=order==='descending'?'DESC':'ASC';search();}
function openCreate(){editing.value=null;Object.assign(form,{username:'',password:'',role:'EMPLOYEE',employeeId:null,isActive:true});dialogVisible.value=true;}function openEdit(row){editing.value=row;Object.assign(form,{username:row.username,password:'',role:row.role,employeeId:row.employeeId,isActive:row.isActive});dialogVisible.value=true;}
async function save(){const valid=await formRef.value?.validate().catch(()=>false);if(!valid)return;try{if(editing.value)await ElMessageBox.confirm(`确认保存 ${form.username} 的权限变更吗？`,'权限变更确认',{type:'warning'});saving.value=true;if(editing.value)await api.put(`/admin/users/${editing.value.id}`,form);else await api.post('/admin/users',form);ElMessage.success(editing.value?'用户权限已更新':'用户已创建');dialogVisible.value=false;await load();}catch(err){if(err!=='cancel'&&err!=='close')ElMessage.error(err.message);}finally{saving.value=false;}}
function resetPassword(row){passwordTarget.value=row;passwordForm.password='';passwordDialog.value=true;}async function savePassword(){const valid=await passwordFormRef.value?.validate().catch(()=>false);if(!valid)return;saving.value=true;try{await api.put(`/admin/users/${passwordTarget.value.id}/password`,passwordForm);ElMessage.success('密码已重置');passwordDialog.value=false;}catch(err){ElMessage.error(err.message);}finally{saving.value=false;}}
async function remove(row){try{await ElMessageBox.confirm(`确认删除用户 ${row.username} 吗？该账号将无法再登录。`,'危险操作',{type:'error',confirmButtonText:'确认删除'});await api.delete(`/admin/users/${row.id}`);ElMessage.success('用户已删除');await load();}catch(err){if(err!=='cancel'&&err!=='close')ElMessage.error(err.message);}}
async function resetDemo(){try{const{value}=await ElMessageBox.prompt('此操作会覆盖当前所有数据并恢复演示数据。请输入 RESET 确认。','重置演示数据',{confirmButtonText:'确认重置',type:'error',inputPattern:/^RESET$/,inputErrorMessage:'必须输入大写 RESET'});await api.post('/admin/reset-demo',{confirmation:value});ElMessage.success('演示数据已重置，请重新登录');await authStore.logout(false);location.replace('/login');}catch(err){if(err!=='cancel'&&err!=='close')ElMessage.error(err.message);}}
onMounted(load);
</script>
