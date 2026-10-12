<template>
  <div class="login-page">
    <div class="login-orb orb-one"></div>
    <div class="login-orb orb-two"></div>
    <div class="login-grid"></div>
    <div class="login-brand">
      <div class="login-brand-mark">澄</div>
      <div><strong>澄明 HR</strong><span>People Operations Platform</span></div>
    </div>
    <section class="login-card">
      <div class="login-copy">
        <span class="eyebrow">LOCAL HR PLATFORM</span>
        <h1>让组织与人，<br />清晰而有序。</h1>
        <p>本地运行、数据自主可控的一体化人力资源管理工作台。</p>
      </div>
      <el-form ref="formRef" :model="form" :rules="rules" class="login-form" @keyup.enter="submit">
        <div class="form-heading">
          <h2>欢迎回来</h2>
          <p>使用演示账号或企业账号登录</p>
        </div>
        <el-form-item prop="username">
          <el-input v-model="form.username" size="large" placeholder="用户名" autocomplete="username">
            <template #prefix><span class="input-symbol">@</span></template>
          </el-input>
        </el-form-item>
        <el-form-item prop="password">
          <el-input v-model="form.password" size="large" type="password" show-password placeholder="密码" autocomplete="current-password">
            <template #prefix><span class="input-symbol">•</span></template>
          </el-input>
        </el-form-item>
        <el-button class="login-button" type="primary" size="large" :loading="loading" @click="submit">进入工作台</el-button>
        <div class="demo-accounts">
          <span>演示账号</span>
          <button v-for="account in accounts" :key="account.username" type="button" @click="useAccount(account)">
            <strong>{{ account.label }}</strong>
            <small>{{ account.username }} / {{ account.password }}</small>
          </button>
        </div>
      </el-form>
    </section>
    <footer class="login-footer">仅在本机运行 · SQLite 本地存储 · 敏感数据字段级保护</footer>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { authStore } from '../stores/auth.js';

const route = useRoute();
const router = useRouter();
const formRef = ref(null);
const loading = ref(false);
const form = reactive({ username: '', password: '' });
const rules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
};
const accounts = [
  { label: '管理员', username: 'admin', password: 'admin123' },
  { label: 'HR', username: 'hr', password: 'hr123' },
  { label: '员工', username: 'employee', password: 'employee123' },
];

function useAccount(account) {
  form.username = account.username;
  form.password = account.password;
}

async function submit() {
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) return;
  loading.value = true;
  try {
    await authStore.login(form.username.trim(), form.password);
    ElMessage.success('登录成功');
    router.replace(String(route.query.redirect || '/dashboard'));
  } catch (error) {
    ElMessage.error(error.message || '登录失败');
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.login-page {
  position: relative; min-height: 100vh; overflow: hidden; display: grid; place-items: center; padding: 40px;
  background: linear-gradient(135deg, #071a38 0%, #0f356e 52%, #0e2870 100%);
}
.login-grid {
  position: absolute; inset: 0; opacity: .08;
  background-image: linear-gradient(rgba(255,255,255,.45) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.45) 1px, transparent 1px);
  background-size: 52px 52px; mask-image: linear-gradient(to bottom, black, transparent 88%);
}
.login-orb { position: absolute; border-radius: 50%; filter: blur(2px); }
.orb-one { width: 520px; height: 520px; left: -170px; bottom: -230px; background: radial-gradient(circle, rgba(64,137,255,.55), transparent 68%); }
.orb-two { width: 460px; height: 460px; top: -210px; right: -130px; background: radial-gradient(circle, rgba(50,214,187,.28), transparent 68%); }
.login-brand { position: absolute; z-index: 2; top: 38px; left: 46px; display: flex; align-items: center; gap: 12px; color: #fff; }
.login-brand-mark { width: 42px; height: 42px; display: grid; place-items: center; border-radius: 13px; background: linear-gradient(145deg,#4f91ff,#185ed7); font-weight: 800; box-shadow: 0 9px 22px rgba(28,89,209,.38); }
.login-brand > div:last-child { display: flex; flex-direction: column; }
.login-brand strong { letter-spacing: .08em; }
.login-brand span { margin-top: 3px; color: #9eb7e0; font-size: 10px; letter-spacing: .12em; }
.login-card {
  position: relative; z-index: 3; width: min(1020px, 94vw); min-height: 590px; display: grid; grid-template-columns: 1.08fr .92fr;
  overflow: hidden; border: 1px solid rgba(255,255,255,.16); border-radius: 26px;
  background: rgba(255,255,255,.98); box-shadow: 0 34px 90px rgba(0, 10, 35, .42);
}
.login-copy {
  position: relative; padding: 72px 62px; color: #fff; overflow: hidden;
  background: linear-gradient(155deg, rgba(32,101,223,.94), rgba(13,49,115,.98)), radial-gradient(circle at 80% 10%, #52a0ff, transparent 38%);
}
.login-copy::after { content: ''; position: absolute; width: 260px; height: 260px; right: -80px; bottom: -90px; border: 1px solid rgba(255,255,255,.12); border-radius: 50%; box-shadow: 0 0 0 44px rgba(255,255,255,.035), 0 0 0 90px rgba(255,255,255,.025); }
.eyebrow { display: inline-block; padding: 7px 11px; border: 1px solid rgba(255,255,255,.18); border-radius: 20px; color: #c6dafd; font-size: 10px; letter-spacing: .16em; }
.login-copy h1 { margin: 42px 0 20px; font-size: clamp(36px,4vw,52px); line-height: 1.22; letter-spacing: -.045em; }
.login-copy p { max-width: 360px; margin: 0; color: #c3d5f4; line-height: 1.8; }
.login-form { padding: 54px 50px 38px; }
.form-heading { margin-bottom: 30px; }
.form-heading h2 { margin: 0; font-size: 28px; letter-spacing: -.03em; }
.form-heading p { margin: 8px 0 0; color: #7a8598; font-size: 13px; }
.input-symbol { color: #7f8ca4; font-weight: 700; }
.login-button { width: 100%; height: 46px; margin-top: 4px; border: 0; background: linear-gradient(90deg,#1559d8,#2b78ec); font-weight: 650; box-shadow: 0 10px 22px rgba(26,91,212,.23); }
.demo-accounts { display: grid; grid-template-columns: repeat(3,1fr); gap: 7px; margin-top: 27px; padding-top: 22px; border-top: 1px solid #ecf0f6; }
.demo-accounts > span { grid-column: 1/-1; margin-bottom: 2px; color: #8792a5; font-size: 11px; }
.demo-accounts button { padding: 9px 7px; border: 1px solid #e3e8f1; border-radius: 9px; background: #f8faff; text-align: left; }
.demo-accounts button:hover { border-color: #aec8f8; background: #f1f6ff; }
.demo-accounts strong, .demo-accounts small { display: block; }
.demo-accounts strong { margin-bottom: 4px; color: #31415f; font-size: 12px; }
.demo-accounts small { color: #8a95a8; font-size: 9px; }
.login-footer { position: absolute; z-index: 2; bottom: 23px; color: #8fa9d3; font-size: 11px; letter-spacing: .04em; }
@media (max-width: 820px) {
  .login-page { padding: 88px 18px 50px; align-items: start; }
  .login-brand { top: 24px; left: 24px; }
  .login-card { display: block; min-height: auto; }
  .login-copy { padding: 34px 30px; }
  .login-copy h1 { margin: 24px 0 12px; font-size: 32px; }
  .login-copy p { display: none; }
  .login-form { padding: 34px 28px; }
  .login-footer { display: none; }
}
</style>
