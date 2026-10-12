<template>
  <div>
    <PageHeader title="组织工作台" :description="`欢迎回来，${authStore.state.user?.employeeName || authStore.state.user?.username}。这里是今天的人力资源概览。`" />
    <PageState :loading="loading" :error="error" @retry="load">
      <template v-if="data?.scope === 'ORGANIZATION'">
        <section class="stat-grid">
          <article class="card stat-card" style="--stat-color:#1459d9;--stat-soft:#eaf1ff">
            <div class="stat-label">在职员工</div><div class="stat-value">{{ data.organization.totalActive }}</div>
            <div class="stat-foot">本月入职 {{ data.organization.thisMonthHires }} 人 · 离职 {{ data.organization.thisMonthLeaves }} 人</div>
            <span class="stat-icon">人</span>
          </article>
          <article class="card stat-card" style="--stat-color:#0e9f6e;--stat-soft:#e7f8f1">
            <div class="stat-label">组织部门</div><div class="stat-value">{{ data.organization.totalDepartments }}</div>
            <div class="stat-foot">共设置 {{ data.organization.totalPositions }} 个职位</div><span class="stat-icon">部</span>
          </article>
          <article class="card stat-card" style="--stat-color:#e58b16;--stat-soft:#fff5e5">
            <div class="stat-label">待办审批</div><div class="stat-value">{{ data.organization.pendingApprovals }}</div>
            <div class="stat-foot">请假申请等待处理</div><span class="stat-icon">待</span>
          </article>
          <article class="card stat-card" style="--stat-color:#7652d6;--stat-soft:#f0ebff">
            <div class="stat-label">本月净变化</div><div class="stat-value">{{ netChange > 0 ? '+' : '' }}{{ netChange }}</div>
            <div class="stat-foot">入职与离职人数差额</div><span class="stat-icon">↗</span>
          </article>
        </section>
        <section class="dashboard-grid">
          <article class="card chart-card">
            <div class="section-title"><h3>近 6 个月入离职趋势</h3><span class="muted">按入职/离职日期统计</span></div>
            <ChartPanel :option="trendOption" />
          </article>
          <article class="card chart-card">
            <div class="section-title"><h3>部门人数分布</h3><span class="muted">当前在职员工</span></div>
            <ChartPanel :option="departmentOption" />
          </article>
        </section>
        <section class="dashboard-grid" style="grid-template-columns: 1fr 1fr">
          <article class="card chart-card" style="min-height:340px">
            <div class="section-title"><h3>薪酬发放趋势</h3><span class="muted">实发工资合计</span></div>
            <ChartPanel :option="payrollOption" />
          </article>
          <article class="card chart-card" style="min-height:340px">
            <div class="section-title"><h3>请假类型分布</h3><span class="muted">待审与已通过</span></div>
            <ChartPanel :option="leaveOption" />
          </article>
        </section>
      </template>
      <template v-else-if="data">
        <section class="stat-grid">
          <article class="card stat-card" style="--stat-color:#1459d9;--stat-soft:#eaf1ff">
            <div class="stat-label">我的待办</div><div class="stat-value">{{ data.pendingTodos }}</div>
            <div class="stat-foot">待审批请假申请</div><span class="stat-icon">待</span>
          </article>
          <article class="card stat-card" style="--stat-color:#0e9f6e;--stat-soft:#e7f8f1">
            <div class="stat-label">最近实发</div><div class="stat-value money" style="font-size:24px">{{ formatMoney(lastPayroll) }}</div>
            <div class="stat-foot">{{ lastPayrollMonth }} 工资单</div><span class="stat-icon">薪</span>
          </article>
          <article class="card stat-card" style="--stat-color:#e58b16;--stat-soft:#fff5e5">
            <div class="stat-label">本月出勤</div><div class="stat-value">{{ latestAttendance?.actualDays || 0 }}</div>
            <div class="stat-foot">应出勤 {{ latestAttendance?.workDays || 0 }} 天</div><span class="stat-icon">勤</span>
          </article>
          <article class="card stat-card" style="--stat-color:#7652d6;--stat-soft:#f0ebff">
            <div class="stat-label">加班时长</div><div class="stat-value">{{ latestAttendance?.overtimeHours || 0 }}</div>
            <div class="stat-foot">最近月度汇总小时数</div><span class="stat-icon">时</span>
          </article>
        </section>
        <section class="dashboard-grid">
          <article class="card chart-card">
            <div class="section-title"><h3>个人考勤趋势</h3><span class="muted">实出勤天数</span></div>
            <ChartPanel :option="attendanceOption" />
          </article>
          <article class="card chart-card">
            <div class="section-title"><h3>工资趋势</h3><span class="muted">近 6 个月实发工资</span></div>
            <ChartPanel :option="selfPayrollOption" />
          </article>
        </section>
      </template>
    </PageState>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { api } from '../api/client.js';
import { authStore } from '../stores/auth.js';
import { formatMoney, LEAVE_TYPE_LABELS, labelOf } from '../utils/format.js';
import PageHeader from '../components/PageHeader.vue';
import PageState from '../components/PageState.vue';
import ChartPanel from '../components/ChartPanel.vue';

const data = ref(null);
const loading = ref(true);
const error = ref('');
const netChange = computed(() => (data.value?.organization?.thisMonthHires || 0) - (data.value?.organization?.thisMonthLeaves || 0));
const lastPayroll = computed(() => data.value?.payrollTrend?.at(-1)?.netSalary || data.value?.payrollTrend?.at(-1)?.total || 0);
const lastPayrollMonth = computed(() => data.value?.payrollTrend?.at(-1)?.month || '暂无');
const latestAttendance = computed(() => data.value?.attendance?.at(-1));

const commonText = { color: '#657189', fontSize: 11 };
const baseGrid = { left: 42, right: 20, top: 36, bottom: 32, containLabel: true };
const trendOption = computed(() => ({
  color: ['#1459d9', '#e58b16'], tooltip: { trigger: 'axis' }, legend: { right: 0, top: 0, textStyle: commonText },
  grid: baseGrid, xAxis: { type: 'category', data: data.value?.trend?.map((x) => x.month) || [], axisLine: { lineStyle: { color: '#dfe5ef' } }, axisLabel: commonText },
  yAxis: { type: 'value', minInterval: 1, splitLine: { lineStyle: { color: '#eef2f7' } }, axisLabel: commonText },
  series: [
    { name: '入职', type: 'line', step: 'middle', symbolSize: 7, data: data.value?.trend?.map((x) => x.hires) || [], areaStyle: { opacity: .08 } },
    { name: '离职', type: 'line', step: 'middle', symbolSize: 7, data: data.value?.trend?.map((x) => x.leaves) || [], areaStyle: { opacity: .06 } },
  ],
}));
const departmentOption = computed(() => ({
  color: ['#1459d9', '#4b86ed', '#5db6cb', '#0e9f6e', '#e58b16', '#9a75dd', '#e76d8d'],
  tooltip: { trigger: 'item' }, legend: { bottom: 0, icon: 'circle', textStyle: commonText },
  series: [{ type: 'pie', radius: ['45%', '70%'], center: ['50%', '44%'], avoidLabelOverlap: true,
    itemStyle: { borderColor: '#fff', borderWidth: 3, borderRadius: 5 }, label: { formatter: '{b}\n{c}人', color: '#536078', fontSize: 11 },
    data: (data.value?.departmentDistribution || []).filter((item) => item.value > 0) }],
}));
const payrollOption = computed(() => ({
  color: ['#0e9f6e'], tooltip: { trigger: 'axis', valueFormatter: (value) => formatMoney(value) }, grid: baseGrid,
  xAxis: { type: 'category', data: data.value?.payrollTrend?.map((x) => x.month) || [], axisLabel: commonText, axisLine: { lineStyle: { color: '#dfe5ef' } } },
  yAxis: { type: 'value', axisLabel: { ...commonText, formatter: (value) => `${Math.round(value / 1000)}k` }, splitLine: { lineStyle: { color: '#eef2f7' } } },
  series: [{ type: 'bar', data: data.value?.payrollTrend?.map((x) => x.total) || [], barMaxWidth: 36, itemStyle: { borderRadius: [7, 7, 0, 0] } }],
}));
const leaveOption = computed(() => ({
  color: ['#7652d6', '#1459d9', '#e58b16', '#0e9f6e', '#e76d8d', '#6f7b91'], tooltip: { trigger: 'item' }, legend: { bottom: 0, icon: 'circle', textStyle: commonText },
  series: [{ type: 'pie', radius: ['34%', '67%'], center: ['50%', '44%'], roseType: 'radius', itemStyle: { borderColor: '#fff', borderWidth: 3, borderRadius: 5 },
    label: { formatter: (item) => `${item.name} ${item.value}`, color: '#536078', fontSize: 11 },
    data: data.value?.leaveTypes?.map((x) => ({ name: labelOf(LEAVE_TYPE_LABELS, x.type), value: x.value })) || [] }],
}));
const attendanceOption = computed(() => ({
  color: ['#1459d9'], tooltip: { trigger: 'axis' }, grid: baseGrid,
  xAxis: { type: 'category', data: data.value?.attendance?.map((x) => x.month) || [], axisLabel: commonText },
  yAxis: { type: 'value', splitLine: { lineStyle: { color: '#eef2f7' } }, axisLabel: commonText },
  series: [{ type: 'bar', data: data.value?.attendance?.map((x) => x.actualDays) || [], barMaxWidth: 34, itemStyle: { borderRadius: [7, 7, 0, 0] } }],
}));
const selfPayrollOption = computed(() => ({
  color: ['#0e9f6e'], tooltip: { trigger: 'axis', valueFormatter: formatMoney }, grid: baseGrid,
  xAxis: { type: 'category', data: data.value?.payrollTrend?.map((x) => x.month) || [], axisLabel: commonText },
  yAxis: { type: 'value', axisLabel: commonText, splitLine: { lineStyle: { color: '#eef2f7' } } },
  series: [{ type: 'line', smooth: true, symbolSize: 8, data: data.value?.payrollTrend?.map((x) => x.netSalary) || [], areaStyle: { opacity: .1 } }],
}));

async function load() {
  loading.value = true; error.value = '';
  try { data.value = await api.get('/dashboard'); }
  catch (err) { error.value = err.message; }
  finally { loading.value = false; }
}
onMounted(load);
</script>



