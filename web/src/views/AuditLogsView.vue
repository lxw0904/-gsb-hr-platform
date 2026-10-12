<template>
  <div class="page">
    <div class="page-heading"><div><h1>操作审计日志</h1><p>关键操作仅可查询，任何用户都不能修改或删除审计记录。</p></div><div class="page-actions"><el-button plain @click="load" :loading="loading">刷新</el-button></div></div>
    <div class="content-card">
      <div class="toolbar">
        <el-input v-model="query.keyword" class="grow" clearable placeholder="搜索操作人、动作、资源或详情" @keyup.enter="search" />
        <el-select v-model="query.resource" clearable placeholder="全部资源"><el-option label="认证" value="auth" /><el-option label="部门" value="department" /><el-option label="职位" value="position" /><el-option label="员工" value="employee" /><el-option label="考勤" value="attendance" /><el-option label="请假" value="leave" /><el-option label="审批流程" value="employee_flow" /><el-option label="调薪" value="salary_adjustment" /><el-option label="工资单" value="payroll" /><el-option label="用户" value="user" /></el-select>
        <el-date-picker v-model="dateRange" type="daterange" value-format="YYYY-MM-DD" range-separator="至" start-placeholder="开始日期" end-placeholder="结束日期" />
        <el-button type="primary" @click="search">查询</el-button><el-button @click="reset">重置</el-button>
      </div>
      <StatePanel v-if="error" title="审计日志加载失败" :description="error" retry @retry="load" />
      <template v-else>
        <div class="table-wrap">
          <el-table v-loading="loading" :data="rows" @sort-change="sortChange">
            <el-table-column prop="created_at" label="时间" width="175" sortable><template #default="{ row }">{{ formatDate(row.created_at, true) }}</template></el-table-column>
            <el-table-column prop="username" label="操作人" width="110" sortable><template #default="{ row }"><strong>{{ row.username }}</strong></template></el-table-column>
            <el-table-column prop="action" label="操作" min-width="170"><template #default="{ row }">{{ actionLabel(row.action) }}<div class="muted">{{ row.action }}</div></template></el-table-column>
            <el-table-column prop="resource" label="资源" width="130"><template #default="{ row }"><el-tag effect="plain">{{ row.resource }}</el-tag></template></el-table-column>
            <el-table-column prop="resource_id" label="资源 ID" width="100" />
            <el-table-column label="操作详情" min-width="260"><template #default="{ row }"><el-button link type="primary" :disabled="!row.detail" @click="showDetail(row)">{{ row.detail ? '查看详情' : '无详情' }}</el-button></template></el-table-column>
            <el-table-column prop="ip" label="IP 地址" width="130" />
            <template #empty><StatePanel title="暂无审计记录" description="调整筛选条件后重试" /></template>
          </el-table>
        </div>
        <div class="pager"><el-pagination v-model:current-page="query.page" v-model:page-size="query.pageSize" layout="total, sizes, prev, pager, next" :total="total" :page-sizes="[10,20,50]" @current-change="load" @size-change="search" /></div>
      </template>
    </div>
    <el-drawer v-model="detailVisible" title="审计详情" size="500px"><pre class="audit-json">{{ detailText }}</pre></el-drawer>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { api } from '../api/http'
import { actionLabel, formatDate } from '../utils/format'
import StatePanel from '../components/StatePanel.vue'

const rows = ref([]); const total = ref(0); const loading = ref(false); const error = ref(''); const detailVisible = ref(false); const detailRow = ref(null); const dateRange = ref([])
const query = reactive({ page: 1, pageSize: 20, keyword: '', resource: '', action: '', startDate: '', endDate: '', sortBy: 'created_at', sortOrder: 'desc' })
const detailText = computed(() => { try { return JSON.stringify(JSON.parse(detailRow.value?.detail || '{}'), null, 2) } catch { return detailRow.value?.detail || '' } })
async function load() { loading.value = true; error.value = ''; try { const data = await api.get('/system/audit-logs', query, { silent: true }); rows.value = data.list; total.value = data.total } catch (err) { error.value = err.message } finally { loading.value = false } }
function search() { query.page = 1; if (dateRange.value?.length) { query.startDate = dateRange.value[0]; query.endDate = dateRange.value[1] } else { query.startDate = ''; query.endDate = '' }; load() }
function reset() { dateRange.value = []; Object.assign(query, { page: 1, pageSize: 20, keyword: '', resource: '', action: '', startDate: '', endDate: '', sortBy: 'created_at', sortOrder: 'desc' }); load() }
function sortChange({ prop, order }) { query.sortBy = prop || 'created_at'; query.sortOrder = order === 'ascending' ? 'asc' : 'desc'; search() }
function showDetail(row) { detailRow.value = row; detailVisible.value = true }
onMounted(load)
</script>

<style scoped>
.audit-json { margin: 0; padding: 18px; overflow: auto; border-radius: 12px; background: #101b2e; color: #cce0ff; font-family: Consolas, monospace; font-size: 12px; line-height: 1.7; white-space: pre-wrap; word-break: break-word; }
</style>
