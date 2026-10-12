<template>
  <div ref="root" class="chart-box"></div>
</template>

<script setup>
import * as echarts from 'echarts';
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';

const props = defineProps({ option: { type: Object, required: true } });
const root = ref(null);
let chart;
let observer;

function render() {
  if (!chart || !props.option) return;
  chart.setOption(props.option, true);
}

onMounted(() => {
  chart = echarts.init(root.value);
  render();
  observer = new ResizeObserver(() => chart?.resize());
  observer.observe(root.value);
});
watch(() => props.option, render, { deep: true });
onBeforeUnmount(() => {
  observer?.disconnect();
  chart?.dispose();
});
</script>
