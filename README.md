# GSB 人力资源平台

一个可在本地完整运行的前后端分离 HR 管理系统。前端负责页面与交互，后端提供 RESTful API，业务数据持久化到本机 SQLite 单文件，不依赖云服务、Redis、消息队列或 CORS 插件。

## 技术栈

- 前端：Vue 3、Vite、Element Plus、Pinia、Vue Router、ECharts
- 后端：Node.js、Express、SQLite（`sql.js` 文件持久化）、JWT、bcrypt
- 开发代理：Vite 将 `/api` 请求代理到 `http://localhost:3000`
- 全部业务代码使用 JavaScript，不包含 Python、Java、Go 等其他语言

## 目录结构

```text
.
├─ server/                  # 后端独立子项目
│  ├─ src/
│  │  ├─ routes/            # RESTful API 路由
│  │  ├─ lib/               # 数据库、鉴权、演示数据、通用工具
│  │  ├─ scripts/init-db.js # 数据库初始化脚本
│  │  └─ index.js           # API 入口，默认端口 3000
│  ├─ data/hr.sqlite        # 运行时自动生成，已被 Git 忽略
│  └─ package.json
├─ web/                     # 前端独立子项目
│  ├─ src/                  # 页面、布局、路由、状态、请求封装
│  ├─ vite.config.js        # 开发服务器与 /api 代理
│  └─ package.json
└─ README.md
```

## 环境要求

- Node.js `>= 20`，推荐 Node 20 LTS、22 LTS 或 24
- npm `>= 10`
- 无需安装数据库服务

检查环境：

```bash
node -v
npm -v
```

## 本地启动

前后端需要分别安装依赖、分别启动。

### 1. 启动后端

```bash
cd server
npm install
npm run init-db
npm run dev
```

后端地址：`http://localhost:3000`

`npm run init-db` 会自动创建 `server/data/hr.sqlite`、建表并写入演示数据；重复执行不会覆盖已有数据。首次直接运行 `npm run dev` 也会自动完成初始化。

生产模式本地启动：

```bash
npm start
```

### 2. 启动前端

另开一个终端：

```bash
cd web
npm install
npm run dev
```

前端地址：`http://localhost:5173`

浏览器访问 `http://localhost:5173`。前端开发请求统一发送到 `/api`，由 Vite 代理转发到 `http://localhost:3000`，没有在业务代码中写死后端地址。

## 默认演示账号

| 角色 | 用户名 | 密码 | 数据范围 |
| --- | --- | --- | --- |
| 管理员 | `admin` | `Admin@123` | 全部系统功能，含用户、权限、审计和演示数据重置 |
| HR | `hr` | `Hr@123` | 组织、员工、考勤、请假、薪酬与审批，不含系统级用户管理 |
| 普通员工 | `employee` | `Employee@123` | 仅本人资料、考勤、请假和已发放工资条 |

三个账号首次初始化时自动创建。密码使用 bcrypt 加盐哈希存储，数据库中不保存明文密码。

## 功能范围

### 已完成核心功能

- 登录与角色：管理员、HR、普通员工三种角色，菜单和后端接口双重权限控制
- 组织架构：部门树、负责人、排序、职位与编制
- 员工档案：新增、编辑、离职、调岗申请、筛选、分页、排序、CSV 导入导出
- 员工自助：维护手机号、邮箱、地址和紧急联系人，查看本人考勤与工资条
- 考勤管理：按人按日明细、按月汇总、HR/管理员补录与修正
- 请假：草稿、提交、待审批、通过、驳回、撤销，支持批量审批
- 人事流程：转正、调岗，`pending → approved / rejected`
- 薪酬管理：月度工资单生成、草稿维护、发放，支持基本工资、绩效、津贴、社保、公积金、个税、实发
- 调薪流程：提交、审批、通过后更新员工基本工资
- 系统管理：用户与角色、密码重置、审计日志查询、一键重置演示数据
- 仪表盘：组织人数、部门分布、入离职趋势、待办审批、员工个人趋势

招聘候选池、入职流程和公告通知属于后续扩展模块，当前版本未提供入口，不存在无响应的占位按钮。

## 权限与安全规则

- 除 `/api/health` 和 `/api/auth/login` 外，所有 API 都必须携带 JWT。
- 普通员工访问员工管理、用户管理、审计日志等管理端接口返回 `403`，不会返回业务数据。
- 员工只能查看自己的考勤、请假和个人工资条；工资条只展示 `issued` 状态。
- 管理员和 HR 可以查看敏感员工字段；普通员工查看本人的身份证号和银行卡号时会脱敏。
- 所有 SQL 均使用参数绑定，没有拼接用户输入。
- 删除、批量审批、权限变更、薪资修改均有二次确认和后端确认校验。
- 删除部门前校验下级部门、关联职位和在职员工；删除职位前校验在职员工。
- 审计日志仅管理员可查询，没有修改或删除接口。

## 状态机

- 请假：`draft → pending → approved / rejected`，草稿和待审批可撤销
- 转正/调岗：`pending → approved / rejected`，通过后才更新员工档案
- 调薪：`pending → approved / rejected`，通过后才更新基本工资
- 工资单：`draft → issued`，已发放工资单不可编辑或删除
- 员工离职：`active / probation / leave → terminated`

## CSV 员工导入

使用 UTF-8 编码，表头如下：

```csv
employee_no,name,gender,phone,email,department,position,hire_date,base_salary
GSB1001,张三,male,13800000000,zhangsan@example.com,产品研发部,前端工程师,2026-01-05,18000
```

字段说明：

- `gender`：`male`、`female`、`unknown`
- `hire_date`：`YYYY-MM-DD`
- `base_salary`：非负数字
- 部门和职位名称必须与系统内已有数据一致，且职位必须属于对应部门

系统会先逐行校验。若存在错误，不会写入任何一行，并返回具体行号及错误原因。CSV 导出文件带 UTF-8 BOM，可直接用 Excel 打开中文内容。

## 数据与配置

默认数据库文件：

```text
server/data/hr.sqlite
```

重启后端不会丢失数据。若需要重新生成演示数据，可在管理员账号的“系统设置”页面执行重置；也可以删除数据库文件后重新运行：

```bash
cd server
npm run init-db
```

后端支持环境变量：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `3000` | 后端端口 |
| `DB_PATH` | `server/data/hr.sqlite` | SQLite 文件路径 |
| `JWT_SECRET` | 内置开发密钥 | 生产环境应改为高强度随机值 |
| `JWT_EXPIRES_IN` | `12h` | JWT 有效期 |
| `DEMO_RESET_TOKEN` | `RESET` | 重置演示数据的确认口令 |

PowerShell 示例：

```powershell
$env:PORT=3000
$env:JWT_SECRET="replace-with-a-long-random-secret"
npm run dev
```

## 列表页统一能力

员工、考勤、请假、工资单、审批、用户和审计日志均支持：

- 分页与每页条数切换
- 关键字搜索
- 状态、部门或类型筛选
- 指定字段排序
- 加载态、空状态和错误重试
- 前后端统一错误提示

员工管理额外支持 CSV 批量导入导出。部门树采用树形展示，职位列表支持搜索、部门筛选、排序和分页。

## 统一错误格式

所有接口错误返回：

```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "当前角色无权访问该功能"
  }
}
```

CSV 导入校验失败时，`error.details.rows` 会包含具体行号和行内错误列表。前端不会直接展示服务器堆栈或原始 500 信息。

## 常用命令

后端：

```bash
npm run dev       # nodemon 开发模式
npm start         # 普通启动
npm run init-db   # 幂等初始化演示数据
```

前端：

```bash
npm run dev       # Vite 开发服务器，默认 5173
npm run build     # 生产构建
npm run preview   # 预览生产构建
```

## 故障排查

- 页面提示“无法连接后端服务”：确认 `server` 已在 3000 端口启动，并访问 `http://localhost:3000/api/health`。
- 登录后接口提示登录失效：检查系统时间、`JWT_SECRET` 是否变化，然后重新登录。
- 5173 被占用：Vite 配置使用严格端口，释放端口或修改 `web/vite.config.js` 和启动端口。
- 3000 被占用：设置 `PORT` 环境变量，同时同步修改 `web/vite.config.js` 的代理目标。
- 重置后旧页面提示失效：演示数据重置会重新创建账号和用户 ID，需要回到登录页重新登录。
