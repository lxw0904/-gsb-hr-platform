<template>
  <div class="empty-panel">
    <div class="empty-icon">{{ icon }}</div>
    <div class="empty-title">{{ title }}</div>
    <div>{{ description }}</div>
    <el-button v-if="retry" type="primary" plain @click="$emit('retry')">重新加载</el-button>
  </div>
</template>

<script setup>
defineProps({
  title: { type: String, default: '暂无数据' },
  description: { type: String, default: '当前筛选条件下没有符合条件的记录' },
  icon: { type: String, default: '⌑' },
  retry: { type: Boolean, default: false }
})
defineEmits(['retry'])
</script>
