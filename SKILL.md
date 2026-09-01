---
name: dsh-vision-skill
description: Give vision capability to text-only models in DeepSeek Harness. AUTO-TRIGGER — whenever the user drops, pastes, uploads, or references an image in the DSH web GUI (an image attachment block with attachmentId, "Saved attachments", an image path, or an image URL), load this skill and recognize the image WITHOUT waiting for an explicit text prompt. Also use when the user asks to describe/analyze/read/recognize image content and the active model cannot natively see images. Runs a local Node script that sends the image to an OpenAI-compatible vision API (multi-model with auto-failover) and returns a text description.
---

# DSH 识图（dsh-vision-skill）

**核心原则：web 端拖入/粘贴图片 = 自动识别。** 用户在 DeepSeek Harness web GUI 里直接丢一张图（不带任何文字），本技能就要自动加载并识别——**不要等用户打字**，识别完直接回复图片内容。

## ⚠️ 多模态分流（先判定，再选路）

识别图片**之前必须先判定当前会话模型是否支持图像输入**，两条路只走一条：

| 当前模型 | 识别方式 |
|---|---|
| **多模态**（支持图像输入，如 `deepseek-v4-flash-vision-exp`、`deepseek-v4-pro`、外接的 vision/vl/multimodal 模型） | **直接用 DSH 原生 `read_image` 工具**（模型自己看图），**屏蔽本识别链**——不调用 `vision.js`/识图 API，不浪费外部额度 |
| **纯文本**（flash / pro 等 text-only，如 `deepseek-v4-flash`、`deepseek-v4-pro`） | 走下方「识别链」（`vision.js` 多模型降级 + 备用供应商） |

**权威判定方法（推荐，自动适配外接模型）**：
1. 先调用 `read_image` 工具读图；
2. 成功 → 当前模型原生多模态，直接用工具返回的图像识别，**不要**再走识别链（省额度、免延迟）；
3. 失败（报错含 `does not declare image input` / `switch to an image-capable model` 等）→ 当前模型是纯文本，转入本技能识别链。

**快速判定名单**（可跳过探测直接选路，减少一次失败轮次；名单随模型新增更新）：
- 多模态：`deepseek-v4-flash-vision-exp`、`deepseek-v4-pro`、`qwen-vl-*`、`glm-4v*`、`gpt-4o*`、`claude-*`、任何含 `vision`/`vl`/`multimodal` 的模型 id
- 纯文本：`deepseek-v4-flash`、`deepseek-v4-pro`（text-only 版）、`glm-4.5*`（未标 image 时）…

> 规则：**外接多模态模型只需在 DSH 模型配置标了 `inputModalities: [text, image]`，`read_image` 自动可用，识别链自动屏蔽**——本名单只是快判优化，不是必需。
> `read_image` 工具报错文本即模型能力来源（DSH 按模型配置判定），判断以工具实际结果为准。

## 自动触发场景（命中任一即执行）

1. 用户消息带**图片附件**：会话里出现 image block / `attachmentId`（形如 `sha256:<hex>`）、"Saved attachments:"、或 Web 端上传的图片引用
2. 用户给出图片**本地路径**或**网络 URL**（即使没说明意图）
3. 用户要求分析/描述/识别图片内容

> 多模态模型下触发后直接 `read_image`；纯文本模型下触发后进入下方识别链。

## 识别图片附件（web 端拖入的图）

1. 从消息中取出图片附件的 `attachmentId`（`sha256:<hex>`）
2. 解析磁盘路径：

```powershell
node "C:\Users\ASUS\.agents\skills\dsh-vision-skill\scripts\resolve_attachment.mjs" "<attachmentId>"
# 找不到时按片段搜索:
node "...\resolve_attachment.mjs" --search "<hex或名称片段>"
```

   附件存储规则：`<DSH_HOME>\attachments\v1\objects\<hex前2位>\<hex>`（`DSH_HOME` 默认 `C:\Users\ASUS\.dsh`；文件无扩展名，直接读）
3. 调用识别脚本：

```powershell
node "C:\Users\ASUS\.agents\skills\dsh-vision-skill\scripts\vision.js" "<解析出的路径>" "请用中文详细描述这张图片的内容"
```

4. 把描述作为回复内容（附上识别依据），无需用户再发文字

## 识别本地路径 / URL 图片

```powershell
node "C:\Users\ASUS\.agents\skills\dsh-vision-skill\scripts\vision.js" "<图片绝对路径>" "问题"
node "C:\Users\ASUS\.agents\skills\dsh-vision-skill\scripts\vision.js" --url "<图片链接>" "问题"
```

## 配置（scripts/.env 或环境变量）

| 变量 | 说明 |
|---|---|
| `VISION_API_KEY` | 识图 API Key（**必填**，已配置） |
| `VISION_MODEL` | 逗号分隔的**模型优先级列表**，主模型失败/配额用完**自动降级**（按「性能优先 + 发布时间最近优先」排序，已配置 6 个） |
| `VISION_BASE_URL` | OpenAI 兼容地址（默认 DashScope，已配置） |
| `VISION2_API_KEY` / `VISION2_MODEL` / `VISION2_BASE_URL` | **备用供应商**（主供应商全部失败后自动切换，ModLens 式 failover） |
| `OPENAI_API_KEY` / `OPENAI_MODEL` / `OPENAI_BASE_URL` | 可选 OpenAI 兼容第三供应商 |
| `VISION_CLI_CMD` / `VISION_CLI_MODEL` | **CLI 供应商**（QoderCN）：spawn `qoderclicn -p <prompt> --attachment <图片> -m <model>` 识图。默认模型 `Qwen3.8-Max`（视觉）。已配置 |
| `VISION_PROVIDERS` | JSON 数组，任意多个供应商；`{"type":"cli","id":"qoder","cmd":"qoderclicn","model":"Qwen3.8-Max"}` 可注册 CLI 供应商 |

已配置模型链（2026-08 按性能+最新更新）：
`qwen3.8-max`（最新旗舰，对标 GPT-5.5/Claude Opus）→ `qwen3.7-plus`（旗舰平衡）→ `qwen3.7-flash-2026-07-15`（轻量）→ `qwen3.6-plus` → `qwen-vl-max` → `qwen-vl-plus`（旧版兜底）

**QoderCN CLI 供应商**（2026-08-17 已实测）：
- 登录：`qoderclicn login`（浏览器授权，一次即可）
- CLI 走 `node <npm全局>/@qodercn-ai/qoderclicn/bundle/qoderclicn.js`（避免 .cmd 包装编码问题）
- 注意：DashScope `qwen3.8-max` 免费额度已耗尽（403 FreeTierOnly），脚本自动降级 `qwen3.7-plus` 或 CLI 供应商

## 使用规则

- 一张图识别一次；多图逐张识别后合并回复
- **结构化输出（推荐，ModLens 式契约）**：给下游生图/电商用时加 `--schema`，脚本强制 JSON 契约 + 输出校验，结构损坏自动重试：
  - `--schema img2img`（生图用：summary / subject / composition / visual(hex 主色) / semantics / ocr，含 meta.attempts 尝试记录）
  - `--schema ecom`（电商商品：product_name / key_features 等）
- **guard 判定**：`node vision.js guard` 检查供应商可用性并给出「是否必须走脚本」的判定（**纯文本模型**无原生视觉，图片一律走脚本；多模态模型不走脚本）
- **`--list-providers`**：查看已配置供应商（不泄露密钥）
- **不要用 Read 工具假装读取图片内容，也不要声称模型"能看到"**——纯文本模型必须走本脚本；多模态模型用 `read_image` 工具（模型原生视觉，不走脚本、不耗识别链额度）
- 识别失败（配额/网络）时，脚本自动降级模型→备用供应商；全部失败输出尝试记录并如实告知
- 识别结果可能有幻觉，涉及关键判断时提示用户复核
