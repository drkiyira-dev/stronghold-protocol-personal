# Stronghold Protocol: Alliance — Enhanced Edition：差异审计

基线状态：下一阶段设计输入，当时尚未实施。审计日期：2026-10-30。本文保留该时点的代码和数据契约结论，不代表完整的线上功能验收；后续首批修复见[实施报告](RELIABILITY.zh-CN.md)。

配套：[技术设计](ENHANCED-DESIGN.zh-CN.md) · [风险清单](ENHANCED-RISKS.zh-CN.md) · [任务计划](ENHANCED-PLAN.zh-CN.md) · [机器可读基线](audit/2026-10-30-baseline.json)。

## 1. 基线和审计方法

| 对象 | 本次锁定版本 | 核验方式 |
| --- | --- | --- |
| 当前仓库 `main` | [`9a96d852ab9b1ed8195796484faec12f4c291ccd`](https://github.com/drkiyira-dev/stronghold-protocol-personal/commit/9a96d852ab9b1ed8195796484faec12f4c291ccd) | GitHub 分支解析与本地 HEAD 一致；审计开始时工作区干净 |
| 上游默认分支 `master` | [`f07b8965061bbc311ad7aa815879b09264a1e47d`](https://github.com/sganggs/Stronghold-Protocol/commit/f07b8965061bbc311ad7aa815879b09264a1e47d) | GitHub 递归 Git tree，`truncated=false`；上游默认分支不是 `main` |
| 当前个人层版本 | `1.1.0` | 根目录 `package.json` |
| 内置上游版本 | `0.3.3` | 上游 package 与源码；版本号不能替代提交和内容哈希 |

把本地 `git ls-tree -r HEAD upstream` 中的路径去掉 `upstream/` 前缀，与上游锁定提交的每个 blob SHA 比较：两边均为 **2,370 个文件，2,367 个逐字节一致，无新增或缺失文件**。其余三个文件如下。

| 文件 | 差异与结论 |
| --- | --- |
| `upstream/package-lock.json` | 文本顺序变化；递归排序 JSON 键后完全等价，没有依赖集合、版本或取值变化 |
| `upstream/public/js/ui/gameLogic/result.js` | `normalizeResult` 新增可选 config；历史结果缺少 `lastRound` 时从当前版本对应 mode 获取，避免九回合结果被当成十四回合 |
| `upstream/public/js/screens/result.js` | 向上述函数传入 `gd.config`，与同一修复配套 |

因此，当前 `server/`、`shared/`、玩法数据、插件系统、Studio、干员和战斗引擎与此上游提交一致。它们是保留并复用的上游实现。**这不意味着构建产物没有适配变化**：`personal/build.mjs` 复制模板、重写素材入口，`build-worker.mjs` 改变模块加载与平台依赖，必须另行纳入升级检查。

“已实现”表示已发现有效实现；“已验证”仅指下文列出的实际测试。“待完善”不应写成 README 中已经交付的能力。

## 2. 模块清单

| 模块 | 上游能力 / 复用点 | personal 已实现 | 待完善 / 重复实现风险 |
| --- | --- | --- | --- |
| 战斗、干员、盟约、商店 | `server/sim/`、`server/match/`、`shared/`、`data/` | Worker 执行原 `Lobby / Network / Match`，无另一套战斗规则 | 维持引擎一致性；禁止为教练、挑战另建技能机制表或模拟器 |
| 浏览器适配 | 原 ESM 引擎、原 `net` 和 store | `local-server.mjs`、`local-client.mjs`、6 个平台 shim | 模块路径、`Match` 私有状态和字符串替换均是升级耦合点；建立契约检测 |
| 主界面 | Preact / htm、主题、i18n、公共组件、原战绩页 | 原 UI 大部分保留；覆盖 index、data、lobby 模板；新增 CSS 与入口按钮 | 模板整文件覆盖会掩盖上游更新；优先缩为明确适配点 |
| 战术终端 | 原弹层/设置/统计和渲染系统 | `toolkit.mjs` 原生 dialog，复盘、存档、挑战、网络/AI、资源五页 | 独立 DOM、中文字符串、样式和状态管理；入口、暂停和路由依赖散在 local-client，尚未形成统一 UI 层 |
| 复盘采集和存储 | `battleRunner` 的 field/snap/ev/result；`tools/record-battle.mjs` | 每秒位置/生命采样、部分事件、结算；IndexedDB 保留最近 30 条，JSON 导入导出 | 缺完整 BattleSpec、版本/内容标识、事件 ID、截断和缺口信息；多人所有分支未形成覆盖矩阵 |
| 回放显示 | `public/studio/js/preview/replay.js`、`public/dev/render-demo.js`、`createFieldView` 已有播放能力 | 简化 canvas 示意、时间滑块、关键事件按钮 | 再写地图/特效/3D 播放器会重复上游；应适配原渲染接口，保留轻量示意作为降级 |
| 输入重放与调试 | `server/match/testTrace.js`、`testReplay.js` 可记录/重放测试输入、计时器与切片步数 | 当前存档恢复明确 `journal:false` | 上游日志是 test-only，并非生产房间 WAL；复用测试机制验证恢复，不能直接打开 test 模式冒充持久化 |
| 本地战术教练 | 原 AI 队友、策略合约、advisor/策略研究体系 | `tactics.mjs` 基于结算和准备状态给出规则建议、场次比较 | 建议没有证据引用；观察与推测结构未区分；教练应解释记录，不重复上游 AI 队友或自动操作 |
| 可选模型教练 | 与战斗 AI 不是同一系统 | `coach-service.mjs` 服务端代理、令牌、限流、去敏摘要、超时降级 | 输入没有事件证据，输出是自由文本；缺引用校验、来源版本、模型响应审计标识 |
| 单人 PREP 存档 | 原 Match 状态、不变量校验、六路 RNG | `checkpoint.mjs` 实际状态编解码；`save-vault.mjs` 双日志、校验、导入导出、手动备份 | 只支持受限的稳定单人休整状态；容器迁移与玩法状态迁移必须分开；见 §4 |
| 联机和重连 | 原 `SessionRegistry / Network / Lobby / Match`、内容子进程 | `host.mjs` 自托管 HTTP/WS；原房间和会话重连可用 | 进程内状态；重启丢失房间和会话；多人快照不能直接复用 solo codec |
| 插件 / Studio | 上游完整插件、DSL、内容集合、校验、安全隔离、Studio/Forge | 后端复用插件装载；有数据型示例 Mod | 默认 `studio:false`，静态构建给出空插件索引；属于未启用/未接通，不是需要重写 |
| 自定义挑战 | 上游规则、offers、插件数据/DSL | `challenges.mjs` 固定 seed、难度与部署/刷新/装备等白名单限制 | 当前是本地命令入口限制，非通用插件框架；扩展前先映射上游已有能力，避免规则双份维护 |
| 官方版本 | 上游四版本及版本 match host | 个人后端默认仅 `act2autochess` | 不宣称四版本都已适配/测试；恢复必须同时锁定官方玩法版本和插件集合 |
| 素材 | 上游 assets、atlas 解析与渲染器 | 外部 URL 清单、候选源、atlas 适配、字体/语音映射 | `unmapped=0` 只证明已扫描引用可映射，不证明所有 URL 可用或所有 VFX/3D 完整；旧缓存脚本仍在，需标注用途 |
| 构建和测试 | 上游已有测试与 CI 定义 | 根 scripts：build / test / server；个人层测试 | 上游 CI 位于 `upstream/.github/`，不会作为本仓库根工作流运行；需要根级测试门禁，禁止自动生产部署 |

关键源码入口：[原架构](../upstream/docs/ARCHITECTURE.md)、[个人功能说明](PERSONAL.zh-CN.md)、[构建适配](../personal/build.mjs)、[Worker 适配](../personal/build-worker.mjs)、[原回放视图](../upstream/public/studio/js/preview/replay.js)、[原输入重放](../upstream/server/match/testReplay.js)。

## 3. 终端耦合与复盘/教练证据

### A01 — 终端与原 UI 存在适配层耦合

`local-client.mjs:1–38` 直接读原 store、导入 net/runner，并拦截准备命令获取经济/布阵状态；`:102` 组合 vault、页面刷新和 Worker 恢复。`toolkit.mjs:14` 起负责自行挂载 dialog、事件、分页、canvas、异步状态。现有 UI 已包含原生 dialog、部分 aria 标签与错误提示，不能说完全没有可访问性支持；但主题/i18n、统一焦点归还、路由卸载和暂停所有权仍需集成测试。不是战斗引擎需要重写，而是 UI 服务边界需要收敛。

### A02 — 记录结束不等于数据完整

`replays.mjs:27–30` 仅保存 seed/kind/rect 等 spec 子集；`:47–57` 最多 600 帧、每帧 300 单位、2,500 事件、1,500 单位元数据，超限静默跳过；`:62` 收到结算就设置 `partial=false`。保存的事件只有 die/leak/deploy/技能启动，不含稳定 ID、原始 tick/seq、攻击目标、技能阶段等。不能据此还原完整操作顺序、逐帧模拟或直接证明因果。

本次内存探针提交 2,501 个事件并结束战斗：只保留 2,500 个，`partial=false` 且没有截断标记。需把“已收到结算”“采样完整”“允许确定性重算”分成不同状态。

`local-client.mjs:37–38` 记录入口为网络 b.start + 本地 battleRunner 事件。原 `runner.js:571` 的 result 发出位于权威结算分支；不能据此认定服务端流式战斗、接管、观战和多人联防也拥有完整记录。后续应覆盖每个消息来源及去重，而非仅增加采样频率。

### A03 — 建议有统计依据，但没有机器可验证的引用

`tactics.mjs:17–25` 的覆盖、生存、漏敌、资金、部署建议有实际字段依据，并有部分谨慎措辞；然而 `evidence` 是句子，没有事实路径、事件 ID 或规则版本。`coach-service.mjs:34–39` 只提供去敏汇总、返回自由文本，无法检查模型是否引用了实际发生的事件。上游 AI 队友负责行动决策；本项目的教练负责解释和复盘，两者保持分离。

### A04 — 统计与对比需要质量门槛

本次合成探针确认三种边界行为：

- 没有 result 的普通 partial 记录，被 `analyzeBattle` 计为 0 漏敌，而非未知。旧 summary 记录已有 null 处理，但不能覆盖所有缺失路径。
- `selfId` 找不到时，`:5–6` 回退汇总其他玩家；示例中其他玩家的 120 伤害成为分析总量。需要显式的个人/队伍/观战范围。
- `compareBattles:31` 只检查 seed、round、kind、challenge；两个不同 engineHash 的示例仍被判为 sameScenario。现格式实际上还未正式记录 engineHash，因此更不能保证受控比较。

这些探针揭示的是边界缺陷；现有 16 项回归通过不排除它们。

## 4. 存档、恢复和持久化

### A05 — 已有防损坏机制，不等于跨引擎兼容

`save-vault.mjs` 已提供 v2 容器、两份日志、SHA-256 内容校验、坏副本回退、旧单存档导入及原文保留。`checkpoint.mjs:134–151` 要求 payload v1、固定 engine 标识、玩法数据 fingerprint 一致，不满足就拒绝恢复。没有迁移注册表、迁移证明或目标版本试恢复事务。数据 fingerprint 为 32 位兼容摘要，且 engine 字符串不包含具体构建；不是完整的代码/插件兼容身份。容器 checksum 是损坏检测，不是签名或反作弊凭证。

限制须继续明确：仅稳定、无计时、单人手动 PREP；战斗中退出恢复最近 PREP，**不恢复战斗某一帧**；多人及当前 codec 排除的扩展不适用。

### A06 — runId 和恢复提交顺序需要修正

`save-vault.mjs:73` 用玩家、roomCode、seed 生成 runId；`local-server.mjs:48` 恢复会替换 roomCode。内存探针确认相同状态换 roomCode 后 runId 改变，导致同一局的“最近三份自动存档”被分成不同分组。固定种子也不能用作对局身份；`:106` 完成判断仅比较 seed/玩家，后续应按稳定 runId 校验。

`local-client.mjs:102` 在 Worker 确认恢复成功之前就写入 activeId。源码审查显示存在“选中成功、恢复失败”的状态窗口；本次未做浏览器断电注入验证。改为试恢复、校验成功、提交指针，失败保留旧 activeId。

### A07 — 重连没有覆盖服务器重启

`host.mjs:15` 复用原 startServer；`:34` 明确进程内存状态。`upstream/server/net.js:156–165` 的 SessionRegistry 使用 Map。现有客户端重连能找回尚存的会话/Match，不提供进程退出后的恢复。

持久化范围必须包含房间成员/房主/设置、所有玩家、匹配版本与插件集合、随机流、阶段/计时、结算唯一性、恢复身份；还要覆盖 `server/match/host/` 的插件/版本子进程。不能把单人 checkpoint 简单放进数据库就称为多人恢复。

## 5. 部署能力边界

| 能力 | 静态 Sites 页面 + 本地 Worker | 自托管页面/房间后端（当前默认） |
| --- | --- | --- |
| 原规则单人模拟 | 可用；仍可能需要外部素材网络 | 可用，也可使用后端模式 |
| 浏览器 PREP 存档 | 可用，限浏览器/站点 origin | 本地模式同样可用；远程房间不使用此存档 |
| 多人房间、原 AI 队友 | 静态站本身不提供；连接另行部署的兼容 WSS 后端后才可能使用房间能力 | 复用上游；需后端持续运行 |
| 服务器重启后恢复 | 不适用 | 未实现 |
| 本地规则教练 | 可用，不需模型密钥 | 可用 |
| 可选模型建议 | 需另设允许该 origin 的 HTTPS 代理 | `/api/coach` 配置后提供；模型密钥留在服务端 |
| 插件/Studio | 静态空插件索引；无文件写入 API | 插件复用；Studio 默认关闭，后续仅接通原实现 |
| 原站账号同步 / 原站远程 AI | 未实现 | 未作为个人版能力接通；本教练不是远程 AI 队友 |

Sites 为 HTTPS 时不能直接连接普通局域网 `ws://`；同源局域网 HTTP 页面可使用 WS；公开连接需 WSS、证书与允许的 origin。不同域名/端口拥有不同浏览器存储，换部署地址不会自动搬运玩家存档。当前 `healthz` 静态 JSON 不是后端在线证明；能力展示需要运行时握手。

## 6. 本次验证和未验证范围

实际运行：`node --test personal/checkpoint.test.mjs personal/save-vault.test.mjs personal/tactics.test.mjs`，**16 通过、0 失败**。包括真实 Match 的 PREP 恢复及下一场战斗/下一回合一致性、六路 RNG、旧容器导入、损坏/配额保护、复盘及挑战等现有测试。

另做五项内存边界探针，结果写入[基线 JSON](audit/2026-10-30-baseline.json)：runId 漂移、事件截断未标记、缺失结果计零、个人身份缺失时汇总别人、不同引擎仍被判同场景。

本次没有执行完整个人层测试集、九回合浏览器验收、多机/进程强杀恢复、真实模型调用、全量外链可用性检查或生产部署。历史 README 的测试记录不算本次重新验证。下一阶段测试与放行条件见任务计划。
