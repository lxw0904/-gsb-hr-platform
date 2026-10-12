<template>
  <div>
    <PageHeader title="审计日志" description="查询删除、批量操作、权限变更和薪资修改等关键行为，日志仅管理员可查看。">
      <template #actions><el-button @click="exportCsv">CSV 导出</el-button></template>
    </PageHeader>
    <div class="card filter-card">
      <el-form inline @submit.prevent="search">
        <el-form-item label="关键字"><el-input v-model="filters.q" clearable placeholder="操作人 / 动作 / 数据 / 详情" style="width:240px" @keyup.enter="search" /></el-form-item>
        <el-form-item label="角色"><el-select v-model="filters.role" clearable placeholder="全部" style="width:125px"><el-option label="管理员" value="ADMIN" /><el-option label="HR" value="HR" /><el-option label="员工" value="EMPLOYEE" /></el-select></el-form-item>
        <el-form-item label="动作"><el-input v-model="filters.action" clearable placeholder="如 DELETE_USER" style="width:170px" /></el-form-item>
        <el-form-item label="日期"><el-date-picker v-model="dateRange" type="daterange" value-format="YYYY-MM-DD" range-separator="至" start-placeholder="开始日期" end-placeholder="结束日期" style="width:250px" /></el-form-item>
        <el-form-item><el-button type="primary" @click="search">查询</el-button><el-button @click="reset">重置</el-button></el-form-item>
      </el-form>
    </div>
    <PageState :loading="loading" :error="error" @retry="load">
      <div class="card table-card">
        <div class="table-toolbar"><div><strong>关键操作记录</strong><span style="margin-left:10px">共 {{ meta.total }} 条</span></div><span>日志不可修改或删除</span></div>
        <el-table :data="rows" empty-text="暂无审计日志" @sort-change="sortChange">
          <el-table-column prop="createdAt" label="时间" width="170" sortable="custom"><template #default="{row}">{{ formatDateTime(row.created_at) }}</template></el-table-column>
          <el-table-column prop="username" label="操作人" width="120" sortable="custom"><template #default="{row}"><strong>{{ row.username }}</strong><div class="muted">{{ labelOf(ROLE_LABELS,row.role) }}</div></template></el-table-column>
          <el-table-column prop="action" label="动作" min-width="180" sortable="custom"><template #default="{row}"><el-tag effect="plain">{{ row.action }}</el-tag></template></el-table-column>
          <el-table-column prop="targetType" label="对象类型" width="130" sortable="custom"><template #default="{row}">{{ row.target_type }}</template></el-table-column>
          <el-table-column prop="target_id" label="对象 ID" width="110"><template #default="{row}">{{ row.target_id || '—' }}</template></el-table-column>
          <el-table-column prop="detail" label="操作详情" min-width="300" show-overflow-tooltip><template #default="{row}">{{ pretty(row.detail) }}</template></el-table-column>
          <el-table-column label="查看" width="90" fixed="right"><template #default="{row}"><el-button link type="primary" @click="showDetail(row)">详情</el-button></template></el-table-column>
        </el-table>
        <div class="table-footer"><el-pagination v-model:current-page="pagination.page" v-model:page-size="pagination.pageSize" :total="meta.total" :page-sizes="[10,20,50]" layout="total, sizes, prev, pager, next" @current-change="load" @size-change="search" /></div>
      </div>
    </PageState>
    <el-dialog v-model="detailVisible" title="审计详情" width="640px"><el-descriptions :column="1" border><el-descriptions-item label="操作人">{{ selected?.username }}（{{ labelOf(ROLE_LABELS,selected?.role) }}）</el-descriptions-item><el-descriptions-item label="动作">{{ selected?.action }}</el-descriptions-item><el-descriptions-item label="对象">{{ selected?.target_type }} / {{ selected?.target_id || '—' }}</el-descriptions-item><el-descriptions-item label="时间">{{ formatDateTime(selected?.created_at) }}</el-descriptions-item><el-descriptions-item label="IP 地址">{{ selected?.ip || '—' }}</el-descriptions-item></el-descriptions><pre class="detail-json">{{ pretty(selected?.detail,true) }}</pre></el-dialog>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { api } from '../api/client.js';
import { formatDateTime, ROLE_LABELS, labelOf } from '../utils/format.js';
import PageHeader from '../components/PageHeader.vue'; import PageState from '../components/PageState.vue';
const rows=ref([]);const loading=ref(true);const error=ref('');const detailVisible=ref(false);const selected=ref(null);const dateRange=ref([]);const filters=reactive({q:'',role:'',action:'',startDate:'',endDate:'',sortBy:'createdAt',sortOrder:'DESC'});const pagination=reactive({page:1,pageSize:10});const meta=reactive({total:0,totalPages:1});
function pretty(value,indent=false){try{return JSON.stringify(typeof value==='string'?JSON.parse(value||'{}'):(value||{}),null,indent?2:0);}catch{return String(value||'');}}
async function load(){loading.value=true;error.value='';filters.startDate=dateRange.value?.[0]||'';filters.endDate=dateRange.value?.[1]||'';try{const result=await api.get('/admin/audit-logs',{...filters,page:pagination.page,pageSize:pagination.pageSize});rows.value=result;Object.assign(meta,result.meta||{});}catch(err){error.value=err.message;}finally{loading.value=false;}}
function search(){pagination.page=1;load();}function reset(){Object.assign(filters,{q:'',role:'',action:'',startDate:'',endDate:'',sortBy:'createdAt',sortOrder:'DESC'});dateRange.value=[];search();}function sortChange({prop,order}){filters.sortBy=prop;filters.sortOrder=order==='ascending'?'ASC':'DESC';search();}function showDetail(row){selected.value=row;detailVisible.value=true;}
async function exportCsv(){try{await api.download('/admin/audit-logs/export',filters,'审计日志.csv');ElMessage.success('导出已开始');}catch(err){ElMessage.error(err.message);}}
onMounted(load);
</script>
<style scoped>.detail-json{margin:18px 0 0;padding:16px;overflow:auto;border-radius:10px;background:#101b31;color:#c9d8f5;font-size:12px;line-height:1.7}</style>
