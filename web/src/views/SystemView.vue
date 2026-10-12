<template>
  <div class="page">
    <div class="page-heading"><div><h1>系统设置</h1><p>查看本地运行信息，或恢复出厂演示数据。</p></div></div>
    <div class="settings-grid">
      <section class="content-card setting-card">
        <div class="setting-icon">◉</div>
        <div><h3>前后端服务</h3><p>前端 Vite 开发服务器默认运行于 5173，后端 API 默认运行于 3000，请求通过开发代理转发。</p></div>
        <el-tag type="success">本地独立部署</el-tag>
      </section>
      <section class="content-card setting-card">
        <div class="setting-icon">▣</div>
        <div><h3>数据持久化</h3><p>业务数据写入 server/data/hr.sqlite 单文件，重启后端不会丢失。该文件已从版本管理中排除。</p></div>
        <el-tag type="success">SQLite 文件</el-tag>
      </section>
      <section class="content-card setting-card">
        <div class="setting-icon">✓</div>
        <div><h3>安全策略</h3><p>密码使用 bcrypt 加盐哈希；接口统一鉴权；管理端普通员工返回 403；敏感字段按角色过滤。</p></div>
        <el-tag type="success">已启用</el-tag>
      </section>
    </div>

    <section class="content-card danger-zone">
      <div><h3>重置演示数据</h3><p>此操作会清空当前 SQLite 中的全部业务数据，并恢复三个演示账号、组织、员工、考勤、工资单和待审批申请。所有当前登录会话将失效。</p></div>
      <el-button type="danger" size="large" @click="confirmReset">重置演示数据</el-button>
    </section>
  </div>
</template>

<script setup>
import { ElMessage, ElMessageBox } from 'element-plus'
import { api } from '../api/http'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
// 使用 prompt 作为不可逆操作的二次确认，要求输入固定口令。
async function confirmReset() {
  try {
    const result = await ElMessageBox.prompt('请输入 RESET 确认重置全部演示数据', '危险操作二次确认', {
      confirmButtonText: '确认重置', cancelButtonText: '取消', inputPattern: /^RESET$/, inputErrorMessage: '请输入大写 RESET', type: 'error'
    })
    await api.post('/system/reset-demo', { confirm: result.value })
    ElMessage.success('演示数据已重置，请重新登录')
    auth.logout()
    setTimeout(() => { window.location.href = '/login' }, 700)
  } catch (err) { if (err?.status) ElMessage.error(err.message) }
}
</script>

<style scoped>
.settings-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
.setting-card { display: flex; flex-direction: column; align-items: flex-start; gap: 14px; }
.setting-icon { display: grid; place-items: center; width: 42px; height: 42px; border-radius: 12px; background: var(--brand-soft); color: var(--brand); font-size: 20px; }
.setting-card h3, .danger-zone h3 { margin: 0 0 7px; }
.setting-card p, .danger-zone p { margin: 0; color: var(--text-secondary); line-height: 1.7; font-size: 13px; }
.danger-zone { display: flex; align-items: center; justify-content: space-between; gap: 28px; border-color: #f3d4d4; background: linear-gradient(110deg, #fff, #fff8f8); }
@media (max-width: 900px) { .settings-grid { grid-template-columns: 1fr; } .danger-zone { align-items: flex-start; flex-direction: column; } }
</style>
