<template>
  <div class="state-page">
    <div class="state-code">404</div>
    <h1>页面不存在</h1>
    <p>你访问的地址可能已失效，或该功能尚未开放。</p>
    <el-button type="primary" @click="$router.replace('/dashboard')">返回工作台</el-button>
  </div>
</template>

<style scoped>
.state-page { display: grid; place-items: center; min-height: calc(100vh - 150px); text-align: center; }
.state-code { color: rgba(31,94,255,.12); font-size: 120px; font-weight: 900; line-height: .95; letter-spacing: -.08em; }
h1 { margin: -10px 0 8px; }
p { max-width: 460px; margin: 0 0 22px; color: var(--text-secondary); line-height: 1.7; }
</style>
