<template>
  <div class="page">
    <div class="page-heading">
      <div><h1>个人中心</h1><p>维护联系方式与紧急联系人，查看个人考勤和工资记录。</p></div>
      <div class="page-actions"><el-button plain @click="load" :loading="loading">刷新</el-button><el-button type="primary" @click="editVisible=true">编辑联系资料</el-button></div>
    </div>

    <StatePanel v-if="error" title="个人资料加载失败" :description="error" retry @retry="load" />
    <template v-else>
      <div class="profile-grid">
        <section class="content-card profile-card">
          <div class="profile-banner">
            <el-avatar :size="68">{{ profile.name?.slice(0,1) || 'U' }}</el-avatar>
            <div><h2>{{ profile.name || auth.user?.username }}</h2><p>{{ profile.position_name || '未设置职位' }} · {{ profile.department_name || '未设置部门' }}</p></div>
          </div>
          <div class="info-list">
            <div><span>工号</span><strong>{{ profile.employee_no || '-' }}</strong></div>
            <div><span>在职状态</span><el-tag :type="statusTypes[profile.employment_status]">{{ statusLabels[profile.employment_status] || '-' }}</el-tag></div>
            <div><span>手机号</span><strong>{{ profile.phone || '-' }}</strong></div>
            <div><span>邮箱</span><strong>{{ profile.email || '-' }}</strong></div>
            <div><span>身份证号</span><strong class="sensitive">{{ profile.id_card || '-' }}</strong></div>
            <div><span>入职日期</span><strong>{{ profile.hire_date || '-' }}</strong></div>
            <div><span>紧急联系人</span><strong>{{ profile.emergency_contact || '-' }} {{ profile.emergency_phone || '' }}</strong></div>
            <div><span>联系地址</span><strong>{{ profile.address || '-' }}</strong></div>
          </div>
        </section>

        <section class="personal-stack">
          <div class="mini-card">
            <div><span>本月出勤</span><strong>{{ attendance.total || 0 }} 天</strong><small>正常 {{ attendance.normal || 0 }} 天 · 迟到 {{ attendance.late || 0 }} 次</small></div>
            <el-button link type="primary" @click="$router.push('/attendance')">查看明细</el-button>
          </div>
          <div class="mini-card">
            <div><span>待审批请假</span><strong>{{ leave.pending || 0 }} 条</strong><small>累计通过 {{ leave.approved || 0 }} 条</small></div>
            <el-button link type="primary" @click="$router.push('/leave')">查看申请</el-button>
          </div>
          <div class="mini-card salary">
            <div><span>最近实发工资</span><strong>{{ formatMoney(latestPayroll?.net_salary || 0) }}</strong><small>{{ latestPayroll?.month || '暂无工资单' }}</small></div>
            <el-button link type="primary" @click="$router.push('/payroll')">查看工资条</el-button>
          </div>
          <div class="mini-card">
            <div><span>账号安全</span><strong>密码保护已启用</strong><small>建议定期更换登录密码</small></div>
            <el-button link type="primary" @click="passwordVisible=true">修改密码</el-button>
          </div>
        </section>
      </div>
    </template>

    <el-dialog v-model="editVisible" title="编辑联系资料" width="560px">
      <el-form :model="editForm" label-width="100px">
        <el-form-item label="手机号"><el-input v-model="editForm.phone" /></el-form-item>
        <el-form-item label="邮箱"><el-input v-model="editForm.email" /></el-form-item>
        <el-form-item label="联系地址"><el-input v-model="editForm.address" /></el-form-item>
        <el-form-item label="紧急联系人"><el-input v-model="editForm.emergency_contact" /></el-form-item>
        <el-form-item label="紧急联系电话"><el-input v-model="editForm.emergency_phone" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="editVisible=false">取消</el-button><el-button type="primary" :loading="saving" @click="saveProfile">保存资料</el-button></template>
    </el-dialog>

    <el-dialog v-model="passwordVisible" title="修改登录密码" width="460px">
      <el-form :model="passwordForm" label-width="90px">
        <el-form-item label="原密码"><el-input v-model="passwordForm.oldPassword" type="password" show-password /></el-form-item>
        <el-form-item label="新密码"><el-input v-model="passwordForm.newPassword" type="password" show-password placeholder="至少 8 位" /></el-form-item>
        <el-form-item label="确认密码"><el-input v-model="passwordForm.confirmPassword" type="password" show-password /></el-form-item>
      </el-form>
      <template #footer><el-button @click="passwordVisible=false">取消</el-button><el-button type="primary" :loading="saving" @click="changePassword">确认修改</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { api } from '../api/http'
import { useAuthStore } from '../stores/auth'
import { formatMoney, statusLabels, statusTypes } from '../utils/format'
import StatePanel from '../components/StatePanel.vue'

const auth = useAuthStore(); const loading = ref(false); const saving = ref(false); const error = ref('')
const dashboard = ref({}); const editVisible = ref(false); const passwordVisible = ref(false)
const editForm = reactive({ phone: '', email: '', address: '', emergency_contact: '', emergency_phone: '' })
const passwordForm = reactive({ oldPassword: '', newPassword: '', confirmPassword: '' })
const profile = computed(() => auth.employee || {})
const attendance = computed(() => dashboard.value.attendance || {})
const leave = computed(() => dashboard.value.leave || {})
const latestPayroll = computed(() => dashboard.value.payroll || null)
async function load() {
  loading.value = true; error.value = ''
  try { await auth.fetchMe(); dashboard.value = await api.get('/dashboard', null, { silent: true }); Object.assign(editForm, { phone: profile.value.phone || '', email: profile.value.email || '', address: profile.value.address || '', emergency_contact: profile.value.emergency_contact || '', emergency_phone: profile.value.emergency_phone || '' }) }
  catch (err) { error.value = err.message } finally { loading.value = false }
}
async function saveProfile() { try { saving.value = true; await api.put('/auth/profile', editForm); ElMessage.success('个人资料已更新'); editVisible.value = false; await load() } catch (err) { if (err?.status) ElMessage.error(err.message) } finally { saving.value = false } }
async function changePassword() {
  if (passwordForm.newPassword.length < 8) return ElMessage.warning('新密码至少需要 8 位')
  if (passwordForm.newPassword !== passwordForm.confirmPassword) return ElMessage.warning('两次输入的新密码不一致')
  try { saving.value = true; await api.put('/auth/password', passwordForm); ElMessage.success('密码已修改，请重新登录'); passwordVisible.value = false; setTimeout(() => { auth.logout(); window.location.href = '/login' }, 600) } catch (err) { if (err?.status) ElMessage.error(err.message) } finally { saving.value = false } }
onMounted(load)
</script>

<style scoped>
.profile-grid { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(300px, .7fr); gap: 18px; }
.profile-card { padding: 0; overflow: hidden; }
.profile-banner { display: flex; align-items: center; gap: 18px; padding: 28px; background: linear-gradient(120deg, #172846, #2452a0); color: #fff; }
.profile-banner h2 { margin: 0 0 5px; font-size: 24px; }
.profile-banner p { margin: 0; color: #b9cbea; }
.info-list { display: grid; grid-template-columns: 1fr 1fr; gap: 0; padding: 8px 24px 20px; }
.info-list > div { display: flex; align-items: center; justify-content: space-between; gap: 18px; min-height: 58px; border-bottom: 1px solid #f0f2f6; }
.info-list > div:nth-last-child(-n+2) { border-bottom: 0; }
.info-list span { color: #738096; font-size: 13px; }
.info-list strong { max-width: 65%; text-align: right; }
.personal-stack { display: grid; gap: 12px; }
.mini-card { display: flex; align-items: center; justify-content: space-between; min-height: 112px; padding: 20px; border: 1px solid var(--border); border-radius: 14px; background: #fff; box-shadow: var(--shadow-soft); }
.mini-card > div { display: flex; flex-direction: column; }
.mini-card span { color: var(--text-secondary); font-size: 12px; }
.mini-card strong { margin-top: 7px; font-size: 22px; }
.mini-card small { margin-top: 4px; color: #8a96a8; }
.mini-card.salary strong { color: var(--brand); }
@media (max-width: 980px) { .profile-grid { grid-template-columns: 1fr; } }
@media (max-width: 600px) { .info-list { grid-template-columns: 1fr; } .info-list > div:nth-last-child(-n+2) { border-bottom: 1px solid #f0f2f6; } .info-list > div:last-child { border-bottom: 0; } }
</style>
