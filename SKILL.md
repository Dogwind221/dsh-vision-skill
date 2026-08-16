---
name: dsh-vision-skill
description: Give vision capability to text-only models in DeepSeek Harness. AUTO-TRIGGER 鈥?whenever the user drops, pastes, uploads, or references an image in the DSH web GUI (an image attachment block with attachmentId, "Saved attachments", an image path, or an image URL), load this skill and recognize the image WITHOUT waiting for an explicit text prompt. Also use when the user asks to describe/analyze/read/recognize image content and the active model cannot natively see images. Runs a local Node script that sends the image to an OpenAI-compatible vision API (multi-model with auto-failover) and returns a text description.
---

# DSH 璇嗗浘锛坉sh-vision-skill锛?
**鏍稿績鍘熷垯锛歸eb 绔嫋鍏?绮樿创鍥剧墖 = 鑷姩璇嗗埆銆?* 鐢ㄦ埛鍦?DeepSeek Harness web GUI 閲岀洿鎺ヤ涪涓€寮犲浘锛堜笉甯︿换浣曟枃瀛楋級锛屾湰鎶€鑳藉氨瑕佽嚜鍔ㄥ姞杞藉苟璇嗗埆鈥斺€?*涓嶈绛夌敤鎴锋墦瀛?*锛岃瘑鍒畬鐩存帴鍥炲鍥剧墖鍐呭銆?
## 鑷姩瑙﹀彂鍦烘櫙锛堝懡涓换涓€鍗虫墽琛岋級

1. 鐢ㄦ埛娑堟伅甯?*鍥剧墖闄勪欢**锛氫細璇濋噷鍑虹幇 image block / `attachmentId`锛堝舰濡?`sha256:<hex>`锛夈€?Saved attachments:"銆佹垨 Web 绔笂浼犵殑鍥剧墖寮曠敤
2. 鐢ㄦ埛缁欏嚭鍥剧墖**鏈湴璺緞**鎴?*缃戠粶 URL**锛堝嵆浣挎病璇存槑鎰忓浘锛?3. 鐢ㄦ埛瑕佹眰鍒嗘瀽/鎻忚堪/璇嗗埆鍥剧墖鍐呭

## 璇嗗埆鍥剧墖闄勪欢锛坵eb 绔嫋鍏ョ殑鍥撅級

1. 浠庢秷鎭腑鍙栧嚭鍥剧墖闄勪欢鐨?`attachmentId`锛坄sha256:<hex>`锛?2. 瑙ｆ瀽纾佺洏璺緞锛?
```powershell
node "$env:USERPROFILE\.agents\skills\dsh-vision-skill\scripts\resolve_attachment.mjs" "<attachmentId>"
# 鎵句笉鍒版椂鎸夌墖娈垫悳绱?
node "...\resolve_attachment.mjs" --search "<hex鎴栧悕绉扮墖娈?"
```

   闄勪欢瀛樺偍瑙勫垯锛歚<DSH_HOME>\attachments\v1\objects\<hex鍓?浣?\<hex>`锛坄DSH_HOME` 榛樿 `$env:USERPROFILE\.dsh`锛涙枃浠舵棤鎵╁睍鍚嶏紝鐩存帴璇伙級
3. 璋冪敤璇嗗埆鑴氭湰锛?
```powershell
node "$env:USERPROFILE\.agents\skills\dsh-vision-skill\scripts\vision.js" "<瑙ｆ瀽鍑虹殑璺緞>" "璇风敤涓枃璇︾粏鎻忚堪杩欏紶鍥剧墖鐨勫唴瀹?
```

4. 鎶婃弿杩颁綔涓哄洖澶嶅唴瀹癸紙闄勪笂璇嗗埆渚濇嵁锛夛紝鏃犻渶鐢ㄦ埛鍐嶅彂鏂囧瓧

## 璇嗗埆鏈湴璺緞 / URL 鍥剧墖

```powershell
node "$env:USERPROFILE\.agents\skills\dsh-vision-skill\scripts\vision.js" "<鍥剧墖缁濆璺緞>" "闂"
node "$env:USERPROFILE\.agents\skills\dsh-vision-skill\scripts\vision.js" --url "<鍥剧墖閾炬帴>" "闂"
```

## 閰嶇疆锛坰cripts/.env 鎴栫幆澧冨彉閲忥級

| 鍙橀噺 | 璇存槑 |
|---|---|
| `VISION_API_KEY` | 璇嗗浘 API Key锛?*蹇呭～**锛屽凡閰嶇疆锛?|
| `VISION_MODEL` | 閫楀彿鍒嗛殧鐨?*妯″瀷浼樺厛绾у垪琛?*锛屼富妯″瀷澶辫触/閰嶉鐢ㄥ畬**鑷姩闄嶇骇**锛堟寜銆屾€ц兘浼樺厛 + 鍙戝竷鏃堕棿鏈€杩戜紭鍏堛€嶆帓搴忥紝宸查厤缃?6 涓級 |
| `VISION_BASE_URL` | OpenAI 鍏煎鍦板潃锛堥粯璁?DashScope锛屽凡閰嶇疆锛?|
| `VISION2_API_KEY` / `VISION2_MODEL` / `VISION2_BASE_URL` | **澶囩敤渚涘簲鍟?*锛堜富渚涘簲鍟嗗叏閮ㄥけ璐ュ悗鑷姩鍒囨崲锛孧odLens 寮?failover锛?|
| `OPENAI_API_KEY` / `OPENAI_MODEL` / `OPENAI_BASE_URL` | 鍙€?OpenAI 鍏煎绗笁渚涘簲鍟?|

宸查厤缃ā鍨嬮摼锛?026-08 鎸夋€ц兘+鏈€鏂版洿鏂帮級锛?`qwen3.8-max`锛堟渶鏂版棗鑸帮紝瀵规爣 GPT-5.5/Claude Opus锛夆啋 `qwen3.7-plus`锛堟棗鑸板钩琛★級鈫?`qwen3.7-flash-2026-07-15`锛堣交閲忥級鈫?`qwen3.6-plus` 鈫?`qwen-vl-max` 鈫?`qwen-vl-plus`锛堟棫鐗堝厹搴曪級

## 浣跨敤瑙勫垯

- 涓€寮犲浘璇嗗埆涓€娆★紱澶氬浘閫愬紶璇嗗埆鍚庡悎骞跺洖澶?- **缁撴瀯鍖栬緭鍑猴紙鎺ㄨ崘锛孧odLens 寮忓绾︼級**锛氱粰涓嬫父鐢熷浘/鐢靛晢鐢ㄦ椂鍔?`--schema`锛岃剼鏈己鍒?JSON 濂戠害 + 杈撳嚭鏍￠獙锛岀粨鏋勬崯鍧忚嚜鍔ㄩ噸璇曪細
  - `--schema img2img`锛堢敓鍥剧敤锛歴ummary / subject / composition / visual(hex 涓昏壊) / semantics / ocr锛屽惈 meta.attempts 灏濊瘯璁板綍锛?  - `--schema ecom`锛堢數鍟嗗晢鍝侊細product_name / key_features 绛夛級
- **guard 鍒ゅ畾**锛歚node vision.js guard` 妫€鏌ヤ緵搴斿晢鍙敤鎬у苟缁欏嚭銆屾槸鍚﹀繀椤昏蛋鑴氭湰銆嶇殑鍒ゅ畾锛圖SH 榛樿妯″瀷鏃犲師鐢熻瑙夛紝鍥剧墖涓€寰嬭蛋鑴氭湰锛?- **`--list-providers`**锛氭煡鐪嬪凡閰嶇疆渚涘簲鍟嗭紙涓嶆硠闇插瘑閽ワ級
- 涓嶈鐢?Read 宸ュ叿鍋囪璇诲彇鍥剧墖鍐呭锛屼篃涓嶈澹扮О妯″瀷"鑳界湅鍒?鈥斺€旂函鏂囨湰妯″瀷蹇呴』璧版湰鑴氭湰
- 璇嗗埆澶辫触锛堥厤棰?缃戠粶锛夋椂锛岃剼鏈嚜鍔ㄩ檷绾фā鍨嬧啋澶囩敤渚涘簲鍟嗭紱鍏ㄩ儴澶辫触杈撳嚭灏濊瘯璁板綍骞跺瀹炲憡鐭?- 璇嗗埆缁撴灉鍙兘鏈夊够瑙夛紝娑夊強鍏抽敭鍒ゆ柇鏃舵彁绀虹敤鎴峰鏍?
