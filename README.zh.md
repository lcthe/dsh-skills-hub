# dsh-skills-hub

一个用于 DeepSeek Harness（DSH）浏览器客户端的 Skill 浏览与管理插件，用于管理 DSH 全局目录和已注册工作区中的 Skills。

[English](README.md)

## 项目定位

`dsh-skills-hub` 在 DSH 的**设置 → 技能**中提供技能管理页面。它负责管理 Skill 目录，不修改 DSH 核心运行时，也不会伪装成支持当前尚未提供的 Skill 生命周期控制能力。

插件需要运行在带浏览器客户端的 DSH 部署中，包括带内嵌 Web UI 的桌面版或 DSH Web 版。

## 当前功能

- 浏览已安装 Skills，查看名称、介绍、Markdown 文件、路径和软链接目标。
- 按名称或介绍搜索 Skills。
- 在全局 Skills 目录和已注册 DSH 工作区之间切换。
- 检测 Codex、Claude Code、ZCode、WorkBuddy 和 QCoderWork 中实际存在的技能目录，并在导入窗口就绪前扫描数量。
- 展开来源分组，按需查看已经扫描到的外部 Skills。
- 通过复制目录或创建目录软链接导入 Skills。
- 将本地 Skill 文件夹上传到全局目录或已注册工作区。
- 目标中已有同名 Skill 时跳过，不覆盖原有内容。
- 安全删除 Skill 目录或已识别的软链接。
- 显示已导入、已跳过和失败项目的导入结果摘要。

> 当前 DSH **不支持单个 Skill 的运行时启用/停用**。本插件不会提供只改变页面显示状态的伪开关。

## 快速开始

### 前置条件

- 支持的 DSH 浏览器客户端：桌面版 Web UI 或 DSH Web 版。
- 有权限向 DSH profile 添加依赖并编辑其中的 `cordis.yml`。

### 安装 npm 包

```sh
pnpm add @lcthe/dsh-skills-hub
```

在 profile 的 `cordis.yml` 中，与其他 bundle 项目相同的 include 层级添加插件：

```yaml
- insert:
    - id: dsh-skills-hub
      name: '@lcthe/dsh-skills-hub'
```

启动 DSH Web 客户端：

```sh
pnpm dsh web
```

DSH 启动后打开**设置 → 技能**。

## 使用方式

### 浏览已安装 Skills

主页面会扫描当前选中的 DSH Skill 目录，显示每个 Skill 的名称、介绍、路径、Markdown 文件和软链接信息。可以使用搜索框按名称或介绍筛选。

### 切换技能范围

使用范围下拉框在以下目录之间切换：

- **全局：** `~/.dsh/skills/`
- **已注册工作区：** `<workspace>/.dsh/skills/`

工作区选项来自 DSH workspace registry，不代表 DSH 存在一个统一的“当前工作区”概念。

### 从其他 Agent 导入

1. 打开**导入**。
2. 插件检测实际存在的其他 Agent 技能目录，并扫描其中的 Skills 以计算可导入数量。
3. 来源分组默认折叠；展开分组即可查看已经扫描到的 Skills。
4. 点击技能查看介绍和来源路径。
5. 使用复选框选择要导入的 Skills。
6. 选择**复制**或**软链接**，再选择全局目录或已注册工作区。
7. 确认导入并查看结果摘要。

来源分组虽然保持折叠，但在窗口可操作前已经完成数量扫描。点击窗口右上角的刷新按钮会重新检测来源并重新扫描所有已检测到的来源，确保显示的总数准确。

目标目录中已有同名 Skill 时会跳过，导入不会覆盖原有技能目录。

### 上传本地 Skill 文件夹

在主技能页面点击**上传**打开上传窗口。可以把一个本地 Skill 文件夹拖入拖拽区域，也可以点击**选择文件夹**使用系统目录选择器。窗口会在上传前显示所选文件夹、文件数量和总大小，然后上传到当前选择的全局目录或已注册工作区。上传会先写入临时目录，完成校验后才移动到目标目录。

### 删除 Skill

点击**删除**并在确认窗口中核对路径。已识别的软链接只删除链接本身，不跟随或删除链接目标；普通 Skill 目录及其内容会递归删除。

## 当前限制

- DSH 当前没有针对单个 Skill 的持久化运行时启用/停用设置。
- `SKILL.md` 中的 `disable-model-invocation` 和 `user-invocable` 是静态调用策略，不是用户可控制的运行时开关。
- DSH 插件级的 `disabled` 控制整个 loader entry，不能只停用某个插件提供的单个 Skill。
- 不支持编辑 Skill 内容、打开文件夹或新建 Skill 向导。
- 不支持覆盖已有 Skill；同名目标固定跳过。
- 不支持自定义扫描根目录。
- 导入预览显示 Skill 元数据，但不显示文件大小。
- 来源目录存在不代表其中一定有可识别的 Skill；只有包含至少一个 Markdown 文件的目录才会被识别。
- 由于扫描时会验证目标是否为可用目录，悬空软链接可能不会被发现。

## 安全说明

插件提供以下安全边界：

- Skill 名称必须符合安全格式。
- 导入、上传和删除目标只能是全局目录或已注册工作区目录。
- 上传路径会拒绝路径穿越片段和重复文件写入。
- 上传限制为：请求体最大 16 MiB、最多 500 个文件、单文件最大 4 MiB、文件总量最大 12 MiB。
- 上传先写入临时目录，全部校验成功后再原子移动到目标目录。
- 目标目录已存在时不会覆盖。
- 删除已识别的软链接时只删除链接本身，不删除目标。

完整行为和安全契约请参阅 [SPEC.md](SPEC.md)。

## 支持的导入来源

| 来源 | 扫描路径 |
|---|---|
| Codex | `~/.codex/skills/`、`~/.codex/vendor_imports/skills/`、`~/.codex/plugins/cache/*/skills/` |
| Claude Code | `~/.claude/skills/` |
| ZCode | `~/.zcode/skills/`、`~/.zcode/cli/plugins/cache/*/skills/` |
| WorkBuddy | `~/.workbuddy/skills/` |
| QCoderWork | `~/.qcoderwork/skills/` |

## 截图

![技能列表](docs/1.png)

![导入窗口](docs/2.png)

![来源选择](docs/3.png)

## 本地开发

如果要使用本地源码而不是已发布的 npm 包，可以在 DSH profile 的 `package.json` 中添加 `file:` 依赖：

```json
{
  "dependencies": {
    "@lcthe/dsh-skills-hub": "file:/path/to/dsh-skills-hub"
  }
}
```

将 `@lcthe/dsh-skills-hub` 加入 `dsh.profile.bundles`，然后在源码目录构建：

```sh
pnpm install
pnpm run build
```

`pnpm run build` 会先执行 TypeScript 检查，再打包插件。

## 发布与维护

- 包名：`@lcthe/dsh-skills-hub`
- 源码包版本：以 `package.json` 为准。
- npm 已发布版本：以 npm registry 查询结果为准，不要仅根据本地版本字段推断发布状态。
- 所有插件开发改动应保留在本插件仓库；官方 `deepseek-harness` 源码仓库不是本插件的开发目标。

## 贡献

欢迎提交 Issue 和 Pull Request。请保持文档和发布元数据与实际实现一致。

## License

MIT
