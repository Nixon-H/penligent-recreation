/**
 * Penligent — database schema.
 *
 * Recovered verbatim from the reference application's `db/db.cjs`
 * (javascript-obfuscator output, de-obfuscated with webcrack). The 21 table
 * definitions, column names, types, defaults and comments below are the
 * original statements; the original Chinese column comments are preserved so
 * that the schema can be diffed against the reference.
 */

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_name TEXT NOT NULL, -- 用户名
    user_email TEXT NOT NULL, -- 用户邮箱
    user_token TEXT NOT NULL, -- 用户token
    res_token TEXT NOT NULL, -- 用户llm token
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
  )`,

  `CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_name TEXT NOT NULL, -- 项目名称
    project_description TEXT, -- 项目描述
    task_tree TEXT, -- 任务树数据（JSON格式）
    historysummary TEXT DEFAULT '{}', -- 历史摘要
    user_name TEXT DEFAULT '', -- 用户名称
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
  )`,

  `CREATE TABLE IF NOT EXISTS auth_parameters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL, -- 项目id
    username TEXT, -- 用户名
    password TEXT, -- 密码
    description TEXT, -- 描述
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
  )`,

  `CREATE TABLE IF NOT EXISTS header_parameters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL, -- 项目id
    header_name TEXT, -- 请求头名称
    header_value TEXT, -- 请求头值
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
  )`,

  `CREATE TABLE IF NOT EXISTS project_remarks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL, -- 项目id
    background TEXT, -- 业务背景与应用目的
    range TEXT, -- 测试范围与方法偏好
    assets TEXT, -- 关键资产与高价值目标
    history TEXT, -- 已知问题与历史发现
    compliance TEXT, -- 合规要求
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
  )`,

  `CREATE TABLE IF NOT EXISTS tool_sets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tool_type TEXT NOT NULL, -- 接入类型 command 或者 api
    set_name TEXT NOT NULL, -- 工具名称
    command_path TEXT, -- 工具路径
    command_command TEXT, -- 工具命令
    api_config TEXT, -- 工具api配置
    format_str TEXT, -- 格式化字符串
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
  )`,

  `CREATE TABLE IF NOT EXISTS chat_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL, -- 项目id
    chat_type TEXT NOT NULL, -- 聊天类型 user 或者 assistant
    chat_content TEXT NOT NULL, -- 聊天内容
    chat_metadata TEXT, -- 聊天元数据
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
  )`,

  `CREATE TABLE IF NOT EXISTS execution_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL, -- 项目id
    tool_name TEXT NOT NULL, -- 工具名称
    command TEXT, -- 执行的命令
    parameters TEXT, -- 执行参数（JSON格式）
    result_data TEXT, -- 执行结果数据（JSON格式）
    status TEXT NOT NULL, -- 执行状态 success/failed/running
    start_time INTEGER DEFAULT (strftime('%s', 'now')), -- 开始时间
    end_time INTEGER, -- 结束时间
    duration INTEGER, -- 执行时长（秒）
    error_message TEXT, -- 错误信息
    scan_id TEXT, -- 扫描ID（用于进度跟踪）
    is_silent INTEGER DEFAULT 0, -- 是否为静默工具（0：否，1：是）
    summary TEXT DEFAULT '' -- 摘要信息
  )`,

  `CREATE TABLE IF NOT EXISTS risk_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL, -- 项目id
    execution_id INTEGER, -- 关联的执行结果ID
    risk_type TEXT NOT NULL, -- 风险类型 vulnerability/configuration/access_control等
    severity TEXT NOT NULL, -- 严重程度 critical/high/medium/low/info
    title TEXT NOT NULL, -- 风险标题
    description TEXT, -- 风险描述
    affected_target TEXT, -- 受影响的目标
    evidence TEXT, -- 证据信息（JSON格式）
    recommendation TEXT, -- 修复建议
    cve_id TEXT, -- CVE编号
    cvss_score REAL, -- CVSS评分
    status TEXT DEFAULT 'open', -- 状态 open/fixed/false_positive
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
  )`,

  `CREATE TABLE IF NOT EXISTS risk_items_execution_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL, -- 项目ID
    risk_item_id INTEGER NOT NULL, -- 风险清单ID
    execution_id INTEGER NOT NULL, -- 工具执行结果ID
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
  )`,

  `CREATE TABLE IF NOT EXISTS user_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    setting_key TEXT UNIQUE NOT NULL, -- 设置键名
    setting_value TEXT NOT NULL, -- 设置值
    setting_type TEXT DEFAULT 'string', -- 设置类型 string/number/boolean/json
    description TEXT, -- 设置描述
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
  )`,

  `CREATE TABLE IF NOT EXISTS token_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    send_content TEXT, -- 发送内容
    api_interface TEXT, -- api接口
    remark TEXT, -- 备注信息
    input_tokens INTEGER DEFAULT 0, -- 输入token数量
    output_tokens INTEGER DEFAULT 0, -- 输出token数量
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
  )`,

  `CREATE TABLE IF NOT EXISTS report_exports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL, -- 关联的projects ID
    export_time INTEGER DEFAULT (strftime('%s', 'now')), -- 导出时间
    report_content TEXT NOT NULL, -- 报告内容
    export_format TEXT DEFAULT 'md', -- 导出格式 (md/html/pdf等)
    file_path TEXT, -- 导出文件路径
    file_size INTEGER, -- 文件大小（字节）
    export_status TEXT DEFAULT 'completed', -- 导出状态 completed/failed/processing
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
  )`,

  `CREATE TABLE IF NOT EXISTS crawler_result (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL, -- 关联的 projects ID
    url TEXT NOT NULL, -- 目标 URL
    method VARCHAR(10) DEFAULT 'GET', -- 请求方法
    req_headers TEXT DEFAULT '', -- 请求头
    req_data TEXT DEFAULT '', -- 请求体数据
    has_param INTEGER DEFAULT 0, -- 是否包含参数 (0 为 false, 1 为 true)
    source VARCHAR(50) DEFAULT 'Target', -- 数据来源
    is_relative INTEGER DEFAULT 0, -- 是否为相对路径
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
  )`,

  "CREATE INDEX IF NOT EXISTS idx_crawler_project ON crawler_result (project_id)",
  `CREATE TABLE IF NOT EXISTS scan_result (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL, -- 关联项目 ID
    req_id INTEGER NOT NULL, -- 关联 crawler_result ID
    target_url TEXT NOT NULL, -- 目标基础 URL
    vulnerable_url TEXT NOT NULL, -- 发现漏洞的具体 URL
    vulnerability_type VARCHAR(100), -- 漏洞类型
    risk_level VARCHAR(20) DEFAULT 'low', -- 风险等级 (low, medium, high, critical)
    payload TEXT, -- 测试所用的 Payload
    request_data TEXT, -- 触发漏洞的完整请求
    response_data TEXT, -- 触发漏洞的响应特征
    vulnerable_params TEXT, -- 漏洞参数
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
  )`,

  `CREATE TABLE IF NOT EXISTS ai_tools (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL, -- 项目id
    tool_name TEXT NOT NULL, -- 工具名称
    title TEXT, -- 工具标题
    tool_input TEXT, -- 工具输入
    tool_output TEXT, -- 工具输出
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
  )`,

  `CREATE TABLE IF NOT EXISTS ttp (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL, -- ttp标题
    ttp_type TEXT, -- ttp类型 注入攻击/认证缺陷/数据安全/...
    ttp_level TEXT, -- ttp 风险等级 low/medium/high/critical
    ttp_priority INTEGER DEFAULT 1, -- ttp 检测优先级 1-10 1为最高优先级
    overview TEXT, -- ttp描述
    detection_method TEXT, -- ttp 完整数据
    waf_bypass TEXT, -- ttp 完整数据
    verification TEXT, -- ttp 完整数据
    false_positive TEXT, -- ttp 完整数据
    priority TEXT, -- ttp 完整数据
    notes TEXT, -- ttp 完整数据
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
  )`,

  `CREATE TABLE IF NOT EXISTS test_lists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL, -- 项目id
    test_type TEXT NOT NULL, -- 测试类型 type_1/type_2/type_3
    test_list TEXT, -- 测试list数据（JSON格式） 完整信息
    focus_data TEXT, -- 关注列表数据 json 当前聚焦信息
    focus_description TEXT, -- 关注列表描述 发送给 ai
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
  )`,

  `CREATE TABLE IF NOT EXISTS proxy_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    proxy_type TEXT NOT NULL, -- 代理设置类型 address / intercept_timeout / intercept_rules
    proxy_value TEXT NOT NULL, -- 代理设置值
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
  )`,

  `CREATE TABLE IF NOT EXISTS proxy_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id TEXT, -- 请求id
    request_url TEXT, -- 请求url
    request_method TEXT, -- 请求方法
    request_headers TEXT, -- 请求头
    request_data TEXT, -- 请求数据
    request_time TEXT, -- 请求时间 毫秒级时间戳
    response_status TEXT, -- 响应状态
    response_status_message TEXT, -- 响应状态信息
    response_headers TEXT, -- 响应头
    response_body TEXT, -- 响应体
    response_body_file_path TEXT, -- 响应体文件路径
    response_time TEXT, -- 响应时间 毫秒级时间戳
    analysis_result TEXT, -- 分析结果
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
  )`,

  `CREATE TABLE IF NOT EXISTS repeater_list (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_id INTEGER, -- 父级id 用来关联重放器
    request_id TEXT, -- 请求id
    request_url TEXT, -- 请求url
    request_method TEXT, -- 请求方法
    request_headers TEXT, -- 请求头
    request_data TEXT, -- 请求数据
    request_time TEXT, -- 请求时间 毫秒级时间戳
    response_status TEXT, -- 响应状态
    response_status_message TEXT, -- 响应状态信息
    response_headers TEXT, -- 响应头
    response_body TEXT, -- 响应体
    response_body_file_path TEXT, -- 响应体文件路径
    response_time TEXT, -- 响应时间 毫秒级时间戳
    analysis_result TEXT, -- 分析结果
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
  )`
];

/**
 * Columns added by the reference after the initial release.
 *
 * All 19 ALTER TABLE statements were recovered verbatim from the reference's
 * `db/db.cjs`. They define the reference's *effective* schema, which is the
 * CREATE TABLE block plus these migrations.
 */
const MIGRATION_STATEMENTS = [
  "ALTER TABLE projects ADD COLUMN task_tree TEXT",
  "ALTER TABLE projects ADD COLUMN historysummary TEXT DEFAULT '{}'",
  "ALTER TABLE projects ADD COLUMN user_name TEXT DEFAULT ''",
  "ALTER TABLE projects ADD COLUMN project_target TEXT DEFAULT ''",
  "ALTER TABLE projects ADD COLUMN over_view TEXT DEFAULT ''",
  "ALTER TABLE projects ADD COLUMN task_mode TEXT DEFAULT 'auto'",
  "ALTER TABLE projects ADD COLUMN testlist_type TEXT DEFAULT ''",
  "ALTER TABLE tool_sets ADD COLUMN description TEXT DEFAULT ''",
  "ALTER TABLE chat_records ADD COLUMN like_status TEXT DEFAULT 'neutral'",
  "ALTER TABLE execution_results ADD COLUMN is_silent INTEGER DEFAULT 0",
  "ALTER TABLE execution_results ADD COLUMN temp_tool_id TEXT",
  "ALTER TABLE execution_results ADD COLUMN claude_tool_use_id TEXT",
  "ALTER TABLE execution_results ADD COLUMN risk_item TEXT",
  "ALTER TABLE execution_results ADD COLUMN is_timeout INTEGER DEFAULT 0",
  "ALTER TABLE risk_items ADD COLUMN like_status TEXT DEFAULT 'neutral'",
  "ALTER TABLE risk_items ADD COLUMN verify_status TEXT DEFAULT 'open'",
  "ALTER TABLE risk_items ADD COLUMN verify_context TEXT",
  "ALTER TABLE risk_items ADD COLUMN verify_context_his TEXT",
  "ALTER TABLE crawler_result ADD COLUMN is_high_value INTEGER DEFAULT 0"
];

module.exports = { SCHEMA_STATEMENTS, MIGRATION_STATEMENTS };
