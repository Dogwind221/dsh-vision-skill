# dsh-vision-skill · DSH 识图

给纯文本模型（DeepSeek Harness 等）补上「眼睛」的识图技能：本地 Node 脚本调用 OpenAI 兼容视觉模型，自动识别聊天里出现的图片（Web 附件 / 本地路径 / URL）。

融合 ModLens 优点：**结构化 JSON 契约**（`--schema`）、**输出校验重试**、**多供应商 failover**、**guard 判定**。

## 功能

- **自动触发**：Web 端拖入/粘贴图片 → 自动识别（`attachmentId` / 路径 / URL）
- **结构化输出**：`--schema img2img`（生图用：subject/visual(hex 主色)/semantics）、`--schema ecom`（电商商品）、`--schema ground`（主体 bbox 定位）；输出结构损坏自动重试
- **多 API key / 多供应商**：主供应商（`VISION_*`，模型链自动降级）+ 备用（`VISION2_*`）+ OpenAI 兼容（`OPENAI_*`）+ **任意多个**（`VISION_PROVIDERS` JSON 数组）；全部失败输出尝试记录（`meta.attempts`）
- **guard 判定**：`node vision.js guard` 检查配置可用性（DSH 默认模型无原生视觉，图片一律走脚本）
- 模型策略：性能优先 + 发布时间最近优先（qwen3.8-max → qwen3.7-plus → ...）

## 核心优点（对比 ModLens）

本 skill 的设计吸收自 [liustack/modlens](https://github.com/liustack/modlens)（结构化 JSON 契约 /
输出校验重试 / 多供应商 failover / guard 判定），但在以下方面做了差异化增强：

| 维度 | ModLens（liustack/modlens）| dsh-vision-skill（本 skill）|
|---|---|---|
| **形态** | dsh 原生插件（npm 包 + 工具注入 + 模型变体）| 零依赖单文件 `vision.js`，纯 Node 内置模块，任意 harness 即拷即用 |
| **供应商策略** | 复用本机已有登录态池（Claude Code/Codex/OpenCode/Pi）| **显式模型链**：DashScope 6 模型按性能+最新排序自动降级 → VISION2_* → OpenAI 兼容 → **Qoder CLI**，优先级可精确控制 |
| **输出契约** | 通用证据型 JSON（OCR 转录/版面/实体关系）| **三种领域 schema**（img2img 生图 / ecom 电商 / ground 主体定位）+ 输出校验自动重试，直接喂下游生图/电商 |
| **零 key 识图** | 需本机已有视觉模型登录态，或配 Gemini key / Antigravity CLI | **Qoder CLI**：spawn QoderCN 账号识图，**零 API key**，绕过欠费/配额；**多端 CLI 复用为规划能力**——已预留 codex-cli 骨架（检测到 `~/.codex/auth.json` 登录态自动启用，复用 ChatGPT 订阅视觉模型），未登录自动隐藏，零副作用 |
| **生态集成** | 独立插件 | img2img-studio 的 **L1 识图层**、file-intake 统一路由、dsh-vision-config 面板（多 key 三级优先级/开关/**欠费自动关停**探测）|
| **可观测性** | 结果标注额度来源 | `meta.attempts` 记录每次尝试的 provider/model/error/warnings，失败如实报告绝不编造 |
| **语言场景** | 英文为主 | **中文契约**（中文 prompt schema + 中文文档），识别欠费错误码（Arrearage / FreeTierOnly）自动提示 |
| **轻量度** | 完整插件体系（需安装维护）| 单文件 + `.env`，删除即完全卸载 |

**一句话**：ModLens 胜在「粘贴即用、多端复用登录态」；本 skill 胜在「**可编程的降级链 + 领域契约 + 零 key 通道 + 自研生态闭环**」——尤其适合需要精确控制供应商优先级、下游接生图/电商流水线的场景。

其余核心优点：

- **多供应商自动降级链**：DashScope 模型链（6 个，性能+最新优先）→ 备用 VISION2_* → OpenAI 兼容 → **Qoder CLI**；主链全挂自动切换，`meta.attempts` 完整记录每次尝试
- **结构化 JSON 契约**：`--schema img2img / ecom / ground` 强制输出 schema，**输出校验 + 自动重试**，下游直接消费，杜绝幻觉 JSON
- **CLI 供应商架构**：支持 spawn 外部 CLI（QoderCN）识图——**零 API key 也能识图**（Qoder 账号额度），绕过欠费/配额限制
- **guard 判定**：先探测配置可用性再决定是否走脚本，避免无效调用；`--list-providers` 不泄露密钥
- **AUTO-TRIGGER**：拖图/贴图/URL 自动识别；本地路径 / Web 附件（attachmentId）/ URL 全支持
- **可观测**：每次识别带 `meta.provider/model/attempts/warnings`；失败如实告知，绝不编造图片内容

## 安装

```powershell
# 复制到 Agent 的 skills 目录（Windows）
Copy-Item -Recurse -Force "dsh-vision-skill" "$env:USERPROFILE\.agents\skills\"
```

依赖：Node.js 18+；一个 OpenAI 兼容视觉 API key（DashScope / 智谱 / Moonshot / OpenAI 等）。

## 快速开始

```powershell
# 配置（scripts/.env 或环境变量）
# VISION_API_KEY=sk-...            # 必填
# VISION_MODEL=qwen3.8-max,qwen3.7-plus,qwen-vl-max   # 模型链，主失败自动降级
# VISION_PROVIDERS=[{"id":"glm","key":"sk-..","model":"glm-4v-plus","base":"https://open.bigmodel.cn/api/paas/v4"}]

# 识图（自由文本 / 结构化）
node "$env:USERPROFILE\.agents\skills\dsh-vision-skill\scripts\vision.js" "图片.png" "描述这张图"
node "$env:USERPROFILE\.agents\skills\dsh-vision-skill\scripts\vision.js" "图片.png" --schema img2img
node "$env:USERPROFILE\.agents\skills\dsh-vision-skill\scripts\vision.js" "图片.png" --schema ecom
node "$env:USERPROFILE\.agents\skills\dsh-vision-skill\scripts\vision.js" "图片.png" --schema ground

# 诊断
node "$env:USERPROFILE\.agents\skills\dsh-vision-skill\scripts\vision.js" guard
node "$env:USERPROFILE\.agents\skills\dsh-vision-skill\scripts\vision.js" --list-providers
```

## 目录结构

```text
dsh-vision-skill/
├── SKILL.md                      # 触发规则 + 使用说明
└── scripts/
    ├── vision.js                 # 识图脚本（schema/多供应商/guard）
    ├── resolve_attachment.mjs    # Web 附件 → 磁盘路径
    └── .env.example              # 配置示例
```

## License

MIT

## 说明

- 识图结果是模型生成，可能有幻觉，关键判断请复核
- 识别失败会自动降级供应商/模型；全部失败如实报告并输出尝试记录
- 本 skill 常与 [img2img-studio](https://github.com/Dogwind221/img2img-studio) 配合作为其 L1 识图层
