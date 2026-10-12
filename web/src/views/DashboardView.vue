<template>
  <div class="page">
    <div class="page-heading">
      <div>
        <h1>{{ greeting }}，{{ displayName }}</h1>
        <p>{{ auth.isEmployee ? '这里汇总了你的考勤、请假和最近工资信息。' : '组织运行状态与待处理事项一目了然。' }}</p>
      </div>
      <div class="page-actions">
        <el-button plain @click="load" :loading="loading">刷新数据</el-button>
      </div>
    </div>

    <template v-if="loading && !data">
      <el-skeleton :rows="6" animated />
    </template>
    <StatePanel v-else-if="error" title="工作台加载失败" :description="error" retry @retry="load" />
    <template v-else-if="data && auth.isEmployee">
      <div class="stat-grid">
        <div class="stat-card">
          <div class="stat-label">本月出勤</div>
          <div class="stat-value">{{ data.attendance?.total || 0 }}<small> 天</small></div>
          <div class="stat-foot">正常 {{ data.attendance?.normal || 0 }} 天 · 迟到 {{ data.attendance?.late || 0 }} 次</div>
        </div>
        <div class="stat-card warning">
          <div class="stat-label">待审批请假</div>
          <div class="stat-value">{{ data.leave?.pending || 0 }}<small> 条</small></div>
          <div class="stat-foot">累计通过 {{ data.leave?.approved || 0 }} 条</div>
        </div>
        <div class="stat-card success">
          <div class="stat-label">最近实发工资</div>
          <div class="stat-value money">{{ formatMoney(data.payroll?.net_salary || 0) }}</div>
          <div class="stat-foot">{{ data.payroll?.month || '暂无工资单' }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">当前岗位</div>
          <div class="stat-value employee-position">{{ data.employee?.position_name || '-' }}</div>
          <div class="stat-foot">{{ data.employee?.department_name || '-' }}</div>
        </div>
      </div>
      <div class="content-card chart-card">
        <h3 class="chart-title">个人出勤趋势</h3>
        <p class="chart-subtitle">近 6 个月出勤天数与正常出勤情况</p>
        <ChartPanel :option="attendanceOption" height="320px" />
      </div>
    </template>
    <template v-else-if="data">
      <div class="stat-grid">
        <div class="stat-card">
          <div class="stat-label">组织总人数</div>
          <div class="stat-value">{{ data.cards?.totalEmployees || 0 }}<small> 人</small></div>
          <div class="stat-foot">含在职、试用期和休假员工</div>
        </div>
        <div class="stat-card warning">
          <div class="stat-label">待办审批</div>
          <div class="stat-value">{{ data.cards?.pendingApprovals || 0 }}<small> 项</small></div>
          <div class="stat-foot">请假 {{ data.pending?.leave || 0 }} · 人事流程 {{ data.pending?.flows || 0 }} · 调薪 {{ data.pending?.salary || 0 }}</div>
        </div>
        <div class="stat-card success">
          <div class="stat-label">试用期员工</div>
          <div class="stat-value">{{ data.cards?.probationCount || 0 }}<small> 人</small></div>
          <div class="stat-foot">请关注转正节点</div>
        </div>
        <div class="stat-card danger">
          <div class="stat-label">本月入职</div>
          <div class="stat-value">{{ data.cards?.currentMonthHires || 0 }}<small> 人</small></div>
          <div class="stat-foot">数据来自员工入职档案</div>
        </div>
      </div>
      <div class="dashboard-grid">
        <div class="content-card chart-card">
          <h3 class="chart-title">部门人数分布</h3>
          <p class="chart-subtitle">当前在岗人员的部门结构</p>
          <ChartPanel :option="departmentOption" height="330px" />
        </div>
        <div class="content-card chart-card">
          <h3 class="chart-title">入职与离职趋势</h3>
          <p class="chart-subtitle">最近 6 个月人员流动情况</p>
          <ChartPanel :option="turnoverOption" height="330px" />
        </div>
      </div>
      <div class="quick-panel content-card">
        <div>
          <strong>待办已为你集中整理</strong>
          <span>进入审批中心即可查看请假、转正、调岗和调薪申请。</span>
        </div>
        <el-button type="primary" @click="$router.push('/approvals')">前往审批中心</el-button>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { api } from '../api/http'
import { useAuthStore } from '../stores/auth'
import { formatMoney } from '../utils/format'
import ChartPanel from '../components/ChartPanel.vue'
import StatePanel from '../components/StatePanel.vue'

const auth = useAuthStore()
const data = ref(null)
const loading = ref(false)
const error = ref('')
const greeting = computed(() => {
  const hour = new Date().getHours()
  return hour < 12 ? '上午好' : hour < 18 ? '下午好' : '晚上好'
})
const displayName = computed(() => auth.user?.employeeName || auth.user?.username || '')

const palette = ['#1f5eff', '#16a36a', '#e99b16', '#7c6cf2', '#36a2c9', '#e66b8a', '#8fa1bd', '#43b581']
const departmentOption = computed(() => ({
  color: palette,
  tooltip: { trigger: 'item', formatter: '{b}<br/>{c} 人 · {d}%' },
  legend: { bottom: 0, icon: 'circle', textStyle: { color: '#64748b' } },
  series: [{
    type: 'pie',
    radius: ['42%', '68%'],
    center: ['50%', '45%'],
    padAngle: 3,
    itemStyle: { borderRadius: 8 },
    label: { color: '#526071', formatter: '{b}\n{c} 人' },
    data: data.value?.departmentDistribution || []
  }]
}))
const turnoverOption = computed(() => ({
  color: ['#1f5eff', '#e99b16'],
  tooltip: { trigger: 'axis' },
  legend: { top: 0, right: 0, icon: 'roundRect', textStyle: { color: '#64748b' } },
  grid: { left: 34, right: 18, top: 48, bottom: 28 },
  xAxis: { type: 'category', data: (data.value?.turnover || []).map((item) => item.month.slice(5) + '月'), axisLine: { lineStyle: { color: '#dfe5ee' } }, axisLabel: { color: '#718096' } },
  yAxis: { type: 'value', minInterval: 1, splitLine: { lineStyle: { color: '#edf0f5' } }, axisLabel: { color: '#718096' } },
  series: [
    { name: '入职', type: 'bar', barWidth: 18, itemStyle: { borderRadius: [6, 6, 0, 0] }, data: (data.value?.turnover || []).map((item) => item.hires) },
    { name: '离职', type: 'line', smooth: true, symbolSize: 8, lineStyle: { width: 3 }, areaStyle: { opacity: .08 }, data: (data.value?.turnover || []).map((item) => item.departures) }
  ]
}))
const attendanceOption = computed(() => ({
  color: ['#1f5eff', '#16a36a'],
  tooltip: { trigger: 'axis' },
  legend: { top: 0, right: 0, icon: 'roundRect', textStyle: { color: '#64748b' } },
  grid: { left: 34, right: 18, top: 48, bottom: 28 },
  xAxis: { type: 'category', data: (data.value?.attendanceTrend || []).map((item) => item.month.slice(5) + '月'), axisLine: { lineStyle: { color: '#dfe5ee' } }, axisLabel: { color: '#718096' } },
  yAxis: { type: 'value', minInterval: 1, splitLine: { lineStyle: { color: '#edf0f5' } }, axisLabel: { color: '#718096' } },
  series: [
    { name: '出勤天数', type: 'bar', barWidth: 22, itemStyle: { borderRadius: [6, 6, 0, 0] }, data: (data.value?.attendanceTrend || []).map((item) => item.days) },
    { name: '正常天数', type: 'line', smooth: true, symbolSize: 7, lineStyle: { width: 3 }, data: (data.value?.attendanceTrend || []).map((item) => item.normal) }
  ]
}))

async function load() {
  loading.value = true
  error.value = ''
  try {
    data.value = await api.get('/dashboard', null, { silent: true })
  } catch (err) {
    error.value = err.message || '无法加载工作台数据'
  } finally {
    loading.value = false
  }
}
onMounted(load)
</script>

<style scoped>
.stat-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; }
.stat-value small { margin-left: 3px; color: var(--text-secondary); font-size: 14px; font-weight: 500; }
.employee-position { overflow: hidden; font-size: 22px; text-overflow: ellipsis; white-space: nowrap; }
.dashboard-grid { display: grid; grid-template-columns: minmax(0, .95fr) minmax(0, 1.35fr); gap: 16px; }
.quick-panel { display: flex; align-items: center; justify-content: space-between; gap: 20px; background: linear-gradient(115deg, #162744, #203f7e); color: #fff; }
.quick-panel div { display: flex; flex-direction: column; }
.quick-panel span { margin-top: 4px; color: #b6c7e9; font-size: 13px; }
.quick-panel .el-button { border-color: #fff; background: #fff; color: #1f5eff; }
@media (max-width: 1100px) { .stat-grid { grid-template-columns: repeat(2, 1fr); } .dashboard-grid { grid-template-columns: 1fr; } }
@media (max-width: 600px) { .stat-grid { grid-template-columns: 1fr; } .quick-panel { align-items: flex-start; flex-direction: column; } }
</style>
