#!/usr/bin/env node
/**
 * 独立识图脚本 v2 —— 融合 ModLens 优点：结构化 JSON 契约 + 输出校验重试 +
 * 多供应商 failover + guard 检测。零依赖，OpenAI 兼容视觉模型。
 *
 * 用法:
 *   node vision.js <图片路径> [问题]                     # 自由文本（向后兼容）
 *   node vision.js <图片路径> --schema img2img          # 结构化 JSON（生图用）
 *   node vision.js <图片路径> --schema ecom             # 结构化 JSON（电商商品）
 *   node vision.js --url <图片链接> --schema img2img
 *   node vision.js guard                                # 检测配置/原生视觉判定
 *   node vision.js --list-providers                     # 列出可用供应商（不泄露密钥）
 *
 * 配置（scripts/.env 或环境变量）:
 *   主供应商:
 *     VISION_API_KEY / VISION_MODEL(逗号分隔降级链) / VISION_BASE_URL
 *   备用供应商（主供应商全部失败后自动切换，同 ModLens failover）:
 *     VISION2_API_KEY / VISION2_MODEL / VISION2_BASE_URL
 *   可选 OpenAI 兼容第三供应商（如中转）:
 *     OPENAI_API_KEY / OPENAI_MODEL / OPENAI_BASE_URL
 *   DASHSCOPE_API_KEY / DASHSCOPE_BASE_URL 为旧版别名
 */

const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");

function loadDotEnv(file) {
  try {
    const text = fs.readFileSync(file, "utf8");
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      const val = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch {}
}
loadDotEnv(path.resolve(".env"));
loadDotEnv(path.resolve(__dirname, ".env"));

const ENV = process.env;

/* ---------- 供应商构建（多 API key：VISION_PROVIDERS JSON，兼容 VISION_ 系列） ---------- */
function buildProviders() {
  const list = [];
  const push = (id, key, models, base) => {
    const ms = String(models || "").split(",").map((s) => s.trim()).filter(Boolean);
    if (key && ms.length) list.push({ id, key, models: ms, base });
  };
  // 0) VISION_PROVIDERS：任意多个供应商（JSON 数组），最灵活
  try {
    const extra = JSON.parse(ENV.VISION_PROVIDERS || "[]");
    if (Array.isArray(extra)) {
      for (const [i, p] of extra.entries()) {
        if (p && p.key && (p.model || p.models)) {
          list.push({
            id: p.id || `p${i + 1}`,
            key: p.key,
            models: String(p.model || p.models || "").split(",").map((s) => s.trim()).filter(Boolean),
            base: p.base || "https://dashscope.aliyuncs.com/compatible-mode/v1",
          });
        }
      }
    }
  } catch {}
  // 1) 主供应商
  push("main",
    ENV.VISION_API_KEY || ENV.DASHSCOPE_API_KEY || "",
    ENV.VISION_MODEL || ENV.VISION_MODELS || "",
    ENV.VISION_BASE_URL || ENV.DASHSCOPE_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1");
  // 2) 备用供应商
  push("backup", ENV.VISION2_API_KEY || "", ENV.VISION2_MODEL || "", ENV.VISION2_BASE_URL || "");
  // 3) OpenAI 兼容
  push("openai", ENV.OPENAI_API_KEY || "", ENV.OPENAI_MODEL || "", ENV.OPENAI_BASE_URL || "");
  return list;
}

const mask = (k) => (k ? k.slice(0, 4) + "••••" + k.slice(-4) : "");

/* ---------- 结构化 JSON 契约 ---------- */
const SCHEMAS = {
  img2img: {
    fields: ["summary", "subject", "composition", "visual", "semantics"],
    required: ["summary", "subject.main", "visual.colors_hex", "semantics.mood"],
    prompt: `请严格输出 JSON（不要其他文字、不要 markdown 代码块），结构如下：
{
  "summary": "一句话总结画面",
  "subject": {"main": "主体", "pose_action": "姿态/动作", "objects": ["关键物件"]},
  "composition": {"layout": "构图", "background": "背景", "text_in_image": "画面文字（无则空串）"},
  "visual": {"colors_hex": ["主色hex 2-4个"], "materials": ["材质"], "lighting": "光线", "style_hints": "风格线索(年代/风格/流派)"},
  "semantics": {"mood": "情绪/氛围", "intent": "画面意图(可选)"}
}
字段必须齐全，colors_hex 必须是 #RRGGBB 格式。`,
  },
  ecom: {
    fields: ["product_name", "category", "material", "color_hex", "shape", "key_features", "text_in_image", "background", "defects", "target_audience"],
    required: ["product_name", "category", "color_hex", "key_features"],
    prompt: `请严格输出 JSON（不要其他文字、不要 markdown 代码块），结构如下：
{"product_name":"商品名称","category":"品类","material":"材质","color_hex":"主色hex(#RRGGBB)","shape":"形状结构","key_features":["核心卖点3-5条"],"text_in_image":"商品图上的文字(无则空串)","background":"背景描述","defects":["瑕疵/需去除元素"],"target_audience":"适用人群"}
字段必须齐全。`,
  },
  ground: {
    fields: ["subject", "subject_bbox"],
    required: ["subject_bbox"],
    prompt: `请严格输出 JSON（不要其他文字、不要 markdown 代码块），结构如下：
{"subject":"画面主体名称","subject_bbox":{"x":0.1,"y":0.2,"w":0.6,"h":0.5}}
其中 subject_bbox 是主体（商品/人物/物体）的边界框，x/y/w/h 均为 0-1 归一化坐标（相对原图宽高），必须把主体完整框住且尽量紧贴主体。`,
  },
};

function deepGet(obj, dotted) {
  return dotted.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}
function validateResult(schemaName, parsed) {
  const schema = SCHEMAS[schemaName];
  if (!schema || parsed == null || typeof parsed !== "object") return "输出不是 JSON 对象";
  const missing = schema.required.filter((f) => {
    const v = deepGet(parsed, f);
    return v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
  });
  return missing.length ? `缺少必填字段: ${missing.join(", ")}` : null;
}

/* ---------- 参数 ---------- */
function parseArgs() {
  const argv = process.argv.slice(2);
  const a = { imageSource: "", prompt: "", isUrl: false, schema: "", listProviders: false, guard: false };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    if (v === "--url" && argv[i + 1]) { a.isUrl = true; a.imageSource = argv[++i]; }
    else if (v === "--schema" && argv[i + 1]) { a.schema = argv[++i].toLowerCase(); }
    else if (v === "--list-providers") a.listProviders = true;
    else if (v === "guard") a.guard = true;
    else if (!v.startsWith("--") && !a.imageSource) a.imageSource = v;
    else if (!v.startsWith("--")) a.prompt = a.prompt ? a.prompt + " " + v : v;
  }
  if (!a.prompt) a.prompt = "请详细描述这张图片的内容。";
  return a;
}

function resolveImageUrl(source, isUrl) {
  if (isUrl) return source;
  const resolved = path.resolve(source);
  if (!fs.existsSync(resolved)) throw new Error(`文件不存在: ${resolved}`);
  const ext = path.extname(resolved).toLowerCase().replace(".", "");
  const mimeMap = { jpg: "jpeg", jpeg: "jpeg", png: "png", gif: "gif", webp: "webp", bmp: "bmp" };
  const data = fs.readFileSync(resolved);
  return `data:image/${mimeMap[ext] || "jpeg"};base64,${data.toString("base64")}`;
}

function request(provider, model, payload) {
  const url = new URL(provider.base.replace(/\/?$/, "/") + "chat/completions");
  const body = JSON.stringify(payload);
  const transport = url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const req = transport.request(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${provider.key}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        if (res.statusCode >= 400) return reject(new Error(`API ${res.statusCode}: ${data.slice(0, 300)}`));
        try { resolve(JSON.parse(data)?.choices?.[0]?.message?.content || data); }
        catch { resolve(data); }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

/* ---------- 主流程 ---------- */
async function main() {
  const a = parseArgs();
  const providers = buildProviders();
  const configured = providers.filter((p) => p.key);

  if (a.listProviders) {
    const out = {
      providers: providers.map((p) => ({ id: p.id, configured: !!p.key, key: p.key ? mask(p.key) : "", base: p.base, models: p.models })),
      schemas: Object.keys(SCHEMAS),
    };
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }

  if (a.guard) {
    // ModLens guard 等价物：判定本环境是否需要走脚本识图 + 可用性
    const verdict = {
      nativeVision: false, // DSH 默认模型（deepseek 系）为纯文本，无原生视觉
      mustUseScript: true,
      configuredProviders: configured.map((p) => p.id),
      note: "DSH 当前模型为纯文本（无原生视觉），图片一律走本脚本识图。",
    };
    if (!configured.length) {
      verdict.mustUseScript = false;
      verdict.note = "未配置任何识图供应商（无 VISION_API_KEY 等）。请配置后重试，或使用 ChatGPT 网页通道。";
    }
    console.log(JSON.stringify(verdict, null, 2));
    process.exit(0);
  }

  if (!configured.length) {
    console.error("错误: 未配置任何识图供应商。请设置 VISION_API_KEY（DashScope 等），或备用 VISION2_* / OPENAI_*。");
    console.error("运行 --list-providers 查看状态；运行 guard 查看判定。");
    process.exit(1);
  }
  if (!a.imageSource) {
    console.error("用法: node vision.js <图片路径> [--schema img2img|ecom] [问题]");
    console.error("      node vision.js guard | --list-providers");
    process.exit(1);
  }

  const schema = SCHEMAS[a.schema] ? a.schema : "";
  const prompt = schema ? SCHEMAS[schema].prompt : a.prompt;

  let imageUrl;
  try { imageUrl = resolveImageUrl(a.imageSource, a.isUrl); }
  catch (e) { console.error("识图失败:", e.message); process.exit(1); }

  const attempts = [];
  const warnings = [];
  let lastErr = null;
  let result = null;
  let usedModel = "";

  outer:
  for (const provider of configured) {
    for (const model of provider.models) {
      const attempt = { provider: provider.id, model, ok: false };
      attempts.push(attempt);
      try {
        let raw = await request(provider, model, {
          model,
          messages: [{ role: "user", content: [{ type: "image_url", image_url: { url: imageUrl } }, { type: "text", text: prompt }] }],
          stream: false,
          max_tokens: 2048,
        });
        // 结构化契约：解析 + 校验，结构损坏则重试（同模型最多 2 次）
        if (schema) {
          let parsed = null;
          try {
            const cleaned = String(raw).replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
            parsed = JSON.parse(cleaned);
          } catch {}
          const err = validateResult(schema, parsed);
          if (err) {
            attempt.error = `schema 校验失败: ${err}`;
            attempt.ok = false;
            if (attempts.filter((x) => x.provider === provider.id && x.model === model).length < 2) {
              warnings.push(`${provider.id}/${model}: 输出结构损坏，重试一次`);
              const raw2 = await request(provider, model, {
                model,
                messages: [{ role: "user", content: [{ type: "image_url", image_url: { url: imageUrl } }, { type: "text", text: prompt + "\n（上次输出不是合法 JSON，请务必只输出 JSON）" }] }],
                stream: false,
                max_tokens: 2048,
              });
              const cleaned2 = String(raw2).replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
              try { parsed = JSON.parse(cleaned2); } catch {}
              const err2 = validateResult(schema, parsed);
              if (err2) { attempt.error = `schema 校验失败(重试后): ${err2}`; continue; }
            } else {
              continue;
            }
          }
          if (parsed && !parsed.meta) parsed.meta = {};
          parsed.meta.model = model;
          parsed.meta.provider = provider.id;
          parsed.meta.attempts = attempts.map((x) => ({ provider: x.provider, model: x.model, ok: x.ok, error: x.error || undefined }));
          parsed.meta.warnings = warnings;
          result = parsed;
        } else {
          result = raw;
        }
        attempt.ok = true;
        usedModel = model;
        if (provider.id !== "main") warnings.push(`已降级到备用供应商: ${provider.id}`);
        if (attempts.length > 1) console.error(`[vision] 已降级到 ${provider.id}/${model}（前序尝试失败）`);
        break outer;
      } catch (e) {
        attempt.error = e.message.split("\n")[0];
        lastErr = e;
        console.error(`[vision] ${provider.id}/${model} 失败: ${attempt.error}`);
      }
    }
  }

  if (result === null) {
    console.error("识图失败: 所有供应商/模型均不可用");
    console.error("最后错误:", lastErr ? lastErr.message : "未知");
    console.error("尝试记录:", JSON.stringify(attempts));
    process.exit(1);
  }

  if (schema) console.log(JSON.stringify(result, null, 2));
  else console.log(result);
  process.exit(0);
}

main();
