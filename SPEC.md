# dsh-skills-hub 当前实现规格

## 文档状态

本文档描述 `@lcthe/dsh-skills-hub` 当前已经实现的行为和边界，不把未实现的规划写成现有功能。源码包版本以 `package.json` 为准；npm 实际发布状态以 npm registry 为准。

## 产品定位与运行前提

`dsh-skills-hub` 是 DSH 浏览器客户端插件，在 **设置 → 技能**中提供 Skill 目录浏览和管理能力。

支持的运行方式：

- 带内嵌 Web UI 的 DSH 桌面版；
- DSH Web 版。

插件管理两个范围：

- DSH 全局 Skills 目录：`~/.dsh/skills/`；
- DSH workspace registry 中已注册工作区的 Skills 目录：`<workspace>/.dsh/skills/`。

## 非目标

以下能力不属于当前实现：

- 单个 Skill 的运行时启用/停用；
- Skill 内容编辑、打开所在文件夹或新建 Skill 向导；
- 覆盖已有 Skill；
- 用户自定义扫描根目录；
- 通过本插件修改 DSH loader entry 的插件级启停状态。

尤其需要区分：

- `SKILL.md` 中的 `disable-model-invocation` 和 `user-invocable` 是静态调用策略，不是用户可运行时切换的状态；
- DSH 插件级 `disabled` 控制整个 loader entry，不能单独停用其中一个 Skill；
- 本插件不保存只影响页面显示的伪 `enabled/disabled` 状态。

## 已实现范围

- 扫描 DSH 全局 Skills 目录和已注册工作区；
- 显示技能名称、描述、Markdown 文件、路径和软链接目标；
- 按名称或描述搜索；
- 刷新当前范围；
- 检测 Codex、Claude Code、ZCode、WorkBuddy、QCoderWork 的可用来源目录；
- 查看外部 Skill 详情；
- 复制目录或创建目录软链接导入；
- 上传本地 Skill 文件夹；
- 全局或已注册工作区作为导入/上传目标；
- 同名目标固定跳过，不覆盖；
- 删除普通 Skill 目录或已识别的软链接；
- 显示导入结果摘要。

## 用户操作与行为契约

### 浏览和搜索

主页面扫描当前范围对应的 Skill 目录，并显示每个可识别的 Skill。搜索只作用于当前范围内已扫描的 Skill 名称和描述。

### 切换范围

范围选择器的 `global` 值对应 `~/.dsh/skills/`；其他选项来自 DSH workspace registry，并对应 `<workspace>/.dsh/skills/`。工作区列表不等同于单一“当前工作区”。

切换范围会重新扫描目标目录，不会把旧范围的技能列表混入新范围。

### 外部来源发现和扫描

导入窗口首先调用 `detect`，检测实际存在的来源目录；随后扫描本次检测到的来源，以便在来源分组折叠时也显示真实技能数量。来源分组默认折叠，展开分组只负责显示已经扫描到的 Skills；已扫描分组会复用当前窗口内的结果。

点击导入窗口的刷新按钮会：

1. 重新检测来源目录；
2. 清空当前选择、展开状态和导入结果；
3. 重新扫描本次检测到的所有来源；
4. 在刷新完成后恢复来源数量和总数量。

刷新使用扫描代次保护。刷新前已经发出的旧扫描请求完成后，不得把结果写回刷新后的状态。

来源目录存在但没有包含 Markdown 文件的可识别技能时，该来源的技能数量可以为零。扫描会验证目录目标可用，因此悬空软链接可能不会被发现。

### 导入

导入请求包含：

- `mode: copy`：复制技能目录内容；
- `mode: symlink`：在目标目录创建指向源目录的目录软链接；
- `target: global`：写入 `~/.dsh/skills/`；
- `target: <workspace path>`：写入 `<workspace>/.dsh/skills/`；
- 已选技能的来源和名称。

目标目录中已有同名项时返回 `skipped`，不覆盖原有内容。导入完成后显示 `imported`、`skipped` 和 `failed` 三类结果。

### 上传

上传从浏览器接收一个 Skill 文件夹，先写入目标根目录下的临时目录。所有文件校验成功后，通过原子重命名提交到最终目录；失败时清理临时目录。目标 Skill 已存在时跳过。

### 删除

普通 Skill 目录递归删除。已识别的目录软链接只删除链接本身，不跟随或删除链接目标。

## 范围与工作区语义

| 范围 | 实际目录 | 来源 |
|---|---|---|
| 全局 | `~/.dsh/skills/` | DSH 用户目录 |
| 工作区 | `<workspace>/.dsh/skills/` | DSH workspace registry |

所有导入、上传和删除操作都必须通过全局范围或已注册工作区校验；本插件不接受任意自定义目标目录。

## 外部导入来源与路径

| 来源 | 扫描路径 |
|---|---|
| Codex | `~/.codex/skills/`、`~/.codex/vendor_imports/skills/`、`~/.codex/plugins/cache/*/skills/` |
| Claude Code | `~/.claude/skills/` |
| ZCode | `~/.zcode/skills/`、`~/.zcode/cli/plugins/cache/*/skills/` |
| WorkBuddy | `~/.workbuddy/skills/` |
| QCoderWork | `~/.qcoderwork/skills/` |

检测阶段只报告实际存在的来源。扫描阶段会检查子目录是否可用，并要求其中至少有一个 Markdown 文件。

## 当前限制

- 没有单个 Skill 的运行时启用/停用设置；页面不提供伪持久化开关；
- 不支持编辑内容、打开文件夹、新建 Skill、覆盖已有 Skill 或自定义扫描路径；
- 导入预览不显示文件大小；
- 悬空软链接可能因目标不可用而不被扫描识别；
- 导入窗口打开时会扫描本次检测到的来源，以便折叠状态也能显示真实数量；来源分组展开只显示已扫描结果；显式刷新会重新扫描所有检测到的来源；
- 工作区语义基于已注册工作区，不提供单独的当前工作区概念。

## 安全边界

### 名称和路径

- Skill 名称必须符合安全名称格式：以字母或数字开头，后续可包含字母、数字、`.`、`_`、`-`；
- 目标只能是全局目录或已注册工作区目录；
- 上传相对路径拒绝空路径段、`.`、`..` 和 NUL 字符；
- 写入目标必须保持在临时目录或指定目标根目录内。

### 上传限制

当前实现限制为：

- 请求体最大：16 MiB；
- 文件数量最大：500；
- 单文件最大：4 MiB；
- 文件总量最大：12 MiB。

上传文件使用排他写入，重复路径不会覆盖临时目录中的已有文件。全部验证成功后才执行原子移动。

### 删除和覆盖

- 已存在的目标 Skill 不会被导入或上传覆盖；
- 普通目录删除会递归删除其内容；
- 已识别的软链接删除只解除链接，不删除链接目标。

## 技术架构与 API 概览

插件由两部分组成：

1. DSH Host 侧 loader 注册同源 HTTP API，并负责读取、扫描和修改本地 Skill 目录；
2. DSH 浏览器客户端通过 `skillRpc()` 对 `/dsh-skills-hub-api/*` 发起同源 POST 请求，渲染设置页面和对话框。

当前 API：

| Endpoint | 用途 |
|---|---|
| `/dsh-skills-hub-api/detect` | 检测可用外部来源目录 |
| `/dsh-skills-hub-api/scan` | 扫描一个外部来源，或扫描指定 DSH 范围 |
| `/dsh-skills-hub-api/workspaces` | 获取全局目录和已注册工作区 |
| `/dsh-skills-hub-api/import` | 复制或软链接导入已选 Skills |
| `/dsh-skills-hub-api/upload` | 上传一个本地 Skill 文件夹 |
| `/dsh-skills-hub-api/delete` | 删除指定范围中的 Skill |

所有 endpoint 都要求 POST，并返回 `{ ok, value }` 或 `{ ok: false, error }` 结构。

## 验证与发布备注

- `pnpm run build` 会先执行 `tsc -p tsconfig.build.json --noEmit`，再生成插件 bundle；
- 文档中的当前能力必须与源码实现保持一致；
- 源码版本以 `package.json` 为准；
- npm 发布状态以 npm registry 为准；
- 插件开发、提交和发布只应发生在本仓库，不应修改官方 `deepseek-harness` 源仓库。
