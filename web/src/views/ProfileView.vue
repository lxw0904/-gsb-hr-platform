<template>
  <div>
    <PageHeader title="我的档案" description="查看个人任职信息，并维护手机号、地址与紧急联系人等自助资料。" />
    <PageState :loading="loading" :error="error" @retry="load">
      <div class="profile-grid">
        <section class="card profile-hero">
          <div class="profile-avatar">{{ employee?.name?.slice(0,1) }}</div>
          <h3>{{ employee?.name }}</h3><p>{{ employee?.employeeNo }} · {{ employee?.positionName }}</p>
          <StatusTag :status="employee?.status" kind="employee" />
          <div class="profile-meta">
            <div><span>所属部门</span><strong>{{ employee?.departmentName || '—' }}</strong></div>
            <div><span>入职日期</span><strong>{{ formatDate(employee?.hireDate) }}</strong></div>
            <div><span>职级</span><strong>{{ employee?.positionLevel || '—' }}</strong></div>
          </div>
        </section>
        <section class="card profile-detail">
          <div class="section-title"><h3>基本与联系信息</h3><el-button type="primary" :disabled="editing" @click="editing=true">编辑联系信息</el-button></div>
          <el-form :model="form" label-width="105px" :disabled="!editing">
            <div class="detail-grid">
              <el-form-item label="工号"><el-input :model-value="employee?.employeeNo" disabled /></el-form-item>
              <el-form-item label="姓名"><el-input :model-value="employee?.name" disabled /></el-form-item>
              <el-form-item label="性别"><el-input :model-value="labelOf(GENDER_LABELS,employee?.gender)" disabled /></el-form-item>
              <el-form-item label="出生日期"><el-input :model-value="formatDate(employee?.birthDate)" disabled /></el-form-item>
              <el-form-item label="身份证号"><el-input :model-value="employee?.idCard" disabled /></el-form-item>
              <el-form-item label="入职日期"><el-input :model-value="formatDate(employee?.hireDate)" disabled /></el-form-item>
              <el-form-item label="手机号"><el-input v-model="form.phone" maxlength="20" /></el-form-item>
              <el-form-item label="邮箱"><el-input v-model="form.email" maxlength="80" /></el-form-item>
              <el-form-item label="紧急联系人"><el-input v-model="form.emergencyContact" maxlength="30" /></el-form-item>
              <el-form-item label="紧急电话"><el-input v-model="form.emergencyPhone" maxlength="20" /></el-form-item>
              <el-form-item label="联系地址" class="wide"><el-input v-model="form.address" maxlength="120" /></el-form-item>
            </div>
          </el-form>
          <div v-if="editing" class="edit-actions"><el-button @click="cancelEdit">取消</el-button><el-button type="primary" :loading="saving" @click="save">保存修改</el-button></div>
        </section>
      </div>
    </PageState>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { api } from '../api/client.js';
import { formatDate, GENDER_LABELS, labelOf } from '../utils/format.js';
import PageHeader from '../components/PageHeader.vue';
import PageState from '../components/PageState.vue';
import StatusTag from '../components/StatusTag.vue';

const employee=ref(null); const loading=ref(true); const error=ref(''); const editing=ref(false); const saving=ref(false);
const form=reactive({phone:'',email:'',address:'',emergencyContact:'',emergencyPhone:''});
function syncForm(){Object.assign(form,{phone:employee.value?.phone||'',email:employee.value?.email||'',address:employee.value?.address||'',emergencyContact:employee.value?.emergencyContact||'',emergencyPhone:employee.value?.emergencyPhone||''});}
async function load(){loading.value=true;error.value='';try{employee.value=await api.get('/employees/me');syncForm();}catch(err){error.value=err.message;}finally{loading.value=false;}}
function cancelEdit(){syncForm();editing.value=false;}
async function save(){saving.value=true;try{employee.value=await api.put('/employees/me',form);syncForm();editing.value=false;ElMessage.success('联系信息已更新');}catch(err){ElMessage.error(err.message);}finally{saving.value=false;}}
onMounted(load);
</script>

<style scoped>
.profile-grid{display:grid;grid-template-columns:300px 1fr;gap:18px}
.profile-hero{padding:30px;text-align:center}
.profile-avatar{width:82px;height:82px;margin:0 auto 18px;display:grid;place-items:center;border-radius:25px;color:#fff;background:linear-gradient(145deg,#1459d9,#5d91ee);font-size:30px;font-weight:750;box-shadow:0 14px 30px rgba(20,89,217,.23)}
.profile-hero h3{margin:0;font-size:21px}.profile-hero p{margin:7px 0 12px;color:var(--hr-text-secondary);font-size:12px}
.profile-meta{margin-top:26px;padding-top:20px;border-top:1px solid var(--hr-border);text-align:left}
.profile-meta div{display:flex;justify-content:space-between;padding:8px 0}.profile-meta span{color:var(--hr-text-secondary);font-size:12px}.profile-meta strong{font-size:13px}
.profile-detail{padding:24px}.detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:0 18px}.wide{grid-column:1/-1}.edit-actions{display:flex;justify-content:flex-end;gap:8px;padding-top:15px;border-top:1px solid var(--hr-border)}
@media(max-width:900px){.profile-grid{grid-template-columns:1fr}.detail-grid{grid-template-columns:1fr}.wide{grid-column:auto}}
</style>
