<template>
  <div class="login-page">
    <div class="aurora aurora-one"></div>
    <div class="aurora aurora-two"></div>
    <div class="login-layout">
      <section class="intro">
        <div class="intro-badge">GSB PEOPLE OPERATIONS</div>
        <h1>让组织与人才管理<br />回归清晰、高效。</h1>
        <p>本地运行的人力资源工作台，覆盖组织、员工、考勤、请假与薪酬全流程。</p>
        <div class="intro-points">
          <div><span>✓</span> 角色与字段级权限</div>
          <div><span>✓</span> 流程状态与操作留痕</div>
          <div><span>✓</span> SQLite 本地持久化</div>
        </div>
      </section>

      <section class="login-card">
        <div class="logo">GSB</div>
        <h2>欢迎回来</h2>
        <p class="subtitle">登录你的人力资源工作台</p>
        <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @keyup.enter="submit">
          <el-form-item label="用户名" prop="username">
            <el-input v-model="form.username" size="large" placeholder="请输入用户名" autocomplete="username" />
          </el-form-item>
          <el-form-item label="密码" prop="password">
            <el-input v-model="form.password" size="large" type="password" show-password placeholder="请输入密码" autocomplete="current-password" />
          </el-form-item>
          <el-button class="submit-button" type="primary" size="large" :loading="loading" @click="submit">进入工作台</el-button>
        </el-form>

        <div class="demo-title"><span>演示账号</span></div>
        <div class="demo-grid">
          <button v-for="item in demos" :key="item.username" @click="fillDemo(item)">
            <strong>{{ item.label }}</strong>
            <span>{{ item.username }}</span>
          </button>
        </div>
        <p class="demo-tip">点击账号即可自动填入，密码统一在 README 中列明。</p>
      </section>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()
const formRef = ref()
const loading = ref(false)
const form = reactive({ username: 'admin', password: 'Admin@123' })
const rules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }]
}
const demos = [
  { label: '管理员', username: 'admin', password: 'Admin@123' },
  { label: 'HR', username: 'hr', password: 'Hr@123' },
  { label: '普通员工', username: 'employee', password: 'Employee@123' }
]

function fillDemo(item) {
  form.username = item.username
  form.password = item.password
}

async function submit() {
  try {
    await formRef.value.validate()
    loading.value = true
    await auth.login(form)
    ElMessage.success('登录成功')
    router.replace(route.query.redirect || '/dashboard')
  } catch (error) {
    if (error?.fields) return
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-page { position: relative; display: grid; place-items: center; min-height: 100vh; overflow: hidden; padding: 34px; background: linear-gradient(145deg, #eef4ff 0%, #f8fbff 48%, #eef6f3 100%); }
.aurora { position: absolute; border-radius: 50%; filter: blur(4px); opacity: .72; }
.aurora-one { top: -180px; left: -90px; width: 520px; height: 520px; background: radial-gradient(circle at 40% 40%, rgba(31,94,255,.34), rgba(31,94,255,0) 68%); }
.aurora-two { right: -170px; bottom: -200px; width: 580px; height: 580px; background: radial-gradient(circle at 50% 50%, rgba(22,163,106,.24), rgba(22,163,106,0) 69%); }
.login-layout { position: relative; z-index: 1; display: grid; grid-template-columns: minmax(0, 1.1fr) 440px; gap: 72px; width: min(1120px, 100%); align-items: center; }
.intro { padding-left: 20px; }
.intro-badge { display: inline-block; margin-bottom: 22px; padding: 7px 11px; border: 1px solid rgba(31,94,255,.16); border-radius: 999px; background: rgba(255,255,255,.65); color: var(--brand); font-size: 11px; font-weight: 700; letter-spacing: .13em; }
.intro h1 { margin: 0; color: #13213a; font-size: clamp(36px, 4.6vw, 58px); line-height: 1.12; letter-spacing: -.055em; }
.intro p { max-width: 530px; margin: 24px 0; color: #60708a; font-size: 16px; line-height: 1.8; }
.intro-points { display: flex; flex-wrap: wrap; gap: 12px; }
.intro-points div { padding: 10px 14px; border: 1px solid rgba(255,255,255,.85); border-radius: 11px; background: rgba(255,255,255,.68); color: #3d4b61; font-size: 13px; box-shadow: 0 7px 20px rgba(35,56,90,.05); }
.intro-points span { margin-right: 5px; color: var(--success); font-weight: 800; }
.login-card { padding: 38px; border: 1px solid rgba(255,255,255,.86); border-radius: 24px; background: rgba(255,255,255,.9); box-shadow: 0 28px 70px rgba(34,55,95,.15); backdrop-filter: blur(18px); }
.logo { display: grid; place-items: center; width: 48px; height: 48px; margin-bottom: 22px; border-radius: 14px; background: linear-gradient(135deg, #3f7bff, #1f5eff); color: #fff; font-weight: 800; box-shadow: 0 10px 22px rgba(31,94,255,.28); }
.login-card h2 { margin: 0 0 6px; font-size: 26px; letter-spacing: -.03em; }
.subtitle { margin: 0 0 26px; color: var(--text-secondary); font-size: 14px; }
.submit-button { width: 100%; margin-top: 5px; }
.demo-title { display: flex; align-items: center; gap: 10px; margin: 26px 0 12px; color: #8a96a8; font-size: 11px; }
.demo-title::before, .demo-title::after { flex: 1; height: 1px; background: #edf0f5; content: ''; }
.demo-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.demo-grid button { display: flex; flex-direction: column; align-items: flex-start; padding: 10px; border: 1px solid var(--border); border-radius: 10px; background: #fff; cursor: pointer; transition: .2s; }
.demo-grid button:hover { border-color: rgba(31,94,255,.45); background: #f7f9ff; transform: translateY(-1px); }
.demo-grid strong { color: #354258; font-size: 12px; }
.demo-grid span { margin-top: 3px; color: #8290a5; font-size: 10px; }
.demo-tip { margin: 11px 0 0; color: #9aa5b6; font-size: 10px; text-align: center; }
@media (max-width: 900px) { .login-layout { grid-template-columns: 1fr; max-width: 480px; gap: 28px; } .intro { display: none; } }
@media (max-width: 520px) { .login-page { padding: 16px; } .login-card { padding: 26px 20px; } }
</style>
