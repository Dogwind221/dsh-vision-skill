# dsh-vision-skill · DSH 识图

给纯文本模型（DeepSeek Harness 等）补上「眼睛」的识图技能：本地 Node 脚本调用 OpenAI 兼容视觉模型，自动识别聊天里出现的图片（Web 附件 / 本地路径 / URL）。

融合 ModLens 优点：**结构化 JSON 契约**（`--schema`）、**输出校验重试**、**多供应商 failover**、**guard 判定**。

## 功能

- **自动触发**：Web 端拖入/粘贴图片 → 自动识别（`attachmentId` / 路径 / URL）
- **结构化输出**：`--schema img2img`（生图用：subject/visual(hex 主色)/semantics）、`--schema ecom`（电商商品）、`--schema ground`（主体 bbox 定位）；输出结构损坏自动重试
- **多 API key / 多供应商**：主供应商（`VISION_*`，模型链自动降级）+ 备用（`VISION2_*`）+ OpenAI 兼容（`OPENAI_*`）+ **任意多个**（`VISION_PROVIDERS` JSON 数组）；全部失败输出尝试记录（`meta.attempts`）
- **guard 判定**：`node vision.js guard` 检查配置可用性（DSH 默认模型无原生视觉，图片一律走脚本）
- 模型策略：性能优先 + 发布时间最近优先（qwen3.8-max → qwen3.7-plus → ...）

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

## 核心优点

- **零依赖纯 Node**：单文件 `vision.js`，仅用内置模块，任何环境直接跑，无安装门槛
- **多供应商自动降级链**：DashScope 模型链（6 个，性能+最新优先）→ 备用 VISION2_* → OpenAI 兼容 → **Qoder CLI**；主链全挂自动切换，`meta.attempts` 完整记录每次尝试
- **结构化 JSON 契约**：`--schema img2img / ecom / ground` 强制输出 schema，**输出校验 + 自动重试**，下游直接消费，杜绝幻觉 JSON
- **CLI 供应商架构**：支持 spawn 外部 CLI（QoderCN）识图——**零 API key 也能识图**（Qoder 账号额度），绕过欠费/配额限制
- **guard 判定**：先探测配置可用性再决定是否走脚本，避免无效调用；`--list-providers` 不泄露密钥
- **AUTO-TRIGGER**：拖图/贴图/URL 自动识别；本地路径 / Web 附件（attachmentId）/ URL 全支持
- **可观测**：每次识别带 `meta.provider/model/attempts/warnings`；失败如实告知，绝不编造图片内容
