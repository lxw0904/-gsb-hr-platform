<template>
  <div ref="chartEl" class="chart" :style="{ height }"></div>
</template>

<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as echarts from 'echarts'

const props = defineProps({
  option: { type: Object, required: true },
  height: { type: String, default: '300px' }
})
const chartEl = ref(null)
let chart

function render() {
  if (!chartEl.value) return
  if (!chart) chart = echarts.init(chartEl.value)
  chart.setOption(props.option, true)
  chart.resize()
}
function resize() { chart?.resize() }
onMounted(async () => {
  await nextTick()
  render()
  window.addEventListener('resize', resize)
})
watch(() => props.option, () => nextTick(render), { deep: true })
onBeforeUnmount(() => {
  window.removeEventListener('resize', resize)
  chart?.dispose()
})
</script>

<style scoped>
.chart { width: 100%; min-height: 220px; }
</style>
