<template>
  <el-skeleton v-if="loading" class="card skeleton-card" :rows="7" animated />
  <el-result v-else-if="error" class="card" icon="error" title="数据加载失败" :sub-title="error">
    <template #extra><el-button type="primary" @click="$emit('retry')">重新加载</el-button></template>
  </el-result>
  <slot v-else />
</template>

<script setup>
defineProps({
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' },
});
defineEmits(['retry']);
</script>
