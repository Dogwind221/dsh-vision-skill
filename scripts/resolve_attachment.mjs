#!/usr/bin/env node
/**
 * Resolve a DSH web image attachment to a local file path.
 *
 * In the DeepSeek Harness web GUI, dropped/pasted images are stored as
 * content-addressed attachments. The agent sees an image block with:
 *   attachmentId: "sha256:<hex>"   (and mediaType/name/bytes)
 * Files live under $DSH_HOME/attachments/v1/objects/<hex[0:2]>/<hex>
 * (no extension; bytes are the raw image).
 *
 * Usage:
 *   node resolve_attachment.mjs sha256:<hex>
 *   node resolve_attachment.mjs <hex>
 *   node resolve_attachment.mjs --search <partial-hex-or-name>
 *
 * Prints the resolved absolute path, or the closest candidates.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const DSH_HOME = process.env.DSH_HOME || path.join(os.homedir(), ".dsh");
const ROOT = path.join(DSH_HOME, "attachments", "v1", "objects");

function resolveExact(id) {
  const hex = String(id).replace(/^sha256:/, "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(hex)) return null;
  const p = path.join(ROOT, hex.slice(0, 2), hex);
  return fs.existsSync(p) ? p : null;
}

function search(partial) {
  const q = partial.toLowerCase();
  const hits = [];
  if (!fs.existsSync(ROOT)) return hits;
  for (const bucket of fs.readdirSync(ROOT)) {
    const dir = path.join(ROOT, bucket);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const f of fs.readdirSync(dir)) {
      if (f.toLowerCase().includes(q)) hits.push(path.join(dir, f));
    }
  }
  return hits.slice(0, 10);
}

const arg = process.argv[2];
const mode = arg === "--search" ? "search" : "exact";
const value = mode === "search" ? process.argv[3] : arg;

if (!value) {
  console.error("用法: node resolve_attachment.mjs <attachmentId|sha256hex>");
  console.error("      node resolve_attachment.mjs --search <片段>");
  process.exit(1);
}

const p = mode === "exact" ? resolveExact(value) : null;
if (p) {
  console.log(p);
  process.exit(0);
}
const hits = search(value);
if (hits.length) {
  console.log(hits.join("\n"));
  process.exit(hits.length === 1 ? 0 : 2);
}
console.error(`未找到附件（查找根: ${ROOT}）。可能原因: DSH_HOME 不同、附件已清理，或会话无图片附件。`);
process.exit(3);
