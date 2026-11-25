---
name: kb-grounded-answer
description: 先用本地文献知识库检索证据，再回答高分子机理/数据问题；含论文自动入库、手动存段落与引用纪律
whenToUse: 回答可能已有本地文献支撑的高分子问题，或用户要求“根据知识库回答/把这段存入知识库/查一下库里有没有”
metadata:
  domain: methodology
  version: 1
---

# 知识库增强回答

## 回答前先查库

1. `kb_stats` 看库内文档/块数量；空库直接说明“本地库暂无文献”，不要假装有证据。
2. `kb_search`：
   - `query` 用 3–12 个**英文术语**（库内正文以英文为主），结构写「材料/体系 + 方法/工艺 + 性质/表征」，例如 `PVA film biaxial stretching crystallinity`；
   - 事实查询用 `depth="quick"`；综述/跨文献综合用 `depth="deep"`；
   - 年份/作者/章节放 `filters`，不要塞进 query。
3. 有证据时：正文每个事实后写 `[标题, 年份](https://doi.org/DOI)`；没有 DOI 写 `（标题, 年份, 文件名）`。不要只写 `[n]`。
4. 需要“综合多篇给出结论”时用 `kb_rag`（quick 第一跳，deep 第二跳），并在最后一行写
   「以上内容全部由 kb-rag 查询反馈信息整理。」；有库外推断时改为「……整理，推断部分为模型补充。」
5. 无命中时：明确说“根据现有资料无法回答”，再决定是否用 `pm_literature_search` 在线检索；不得把常识或记忆冒充库内证据。

## 入库

- **论文下载自动入库**：`pm_literature_download` / `pm_literature_browser_download` 成功后返回
  `data.kbIngest`；`ok:true` 表示已由 `kb_ingest` 建立索引，`skipped` 表示 KB 插件未装（文件仍在磁盘）。
- **手动存一段**：用户说“把这段/这个结论/这组参数存入知识库”时，调用
  `pm_kb_note`（`text` 必填，`title`/`tags` 可选）。它写入 `literature/notes/` 并自动 `kb_ingest`。
- 入库后立刻用 `kb_search` 用标题关键词复核一次，确认能检索到再回复用户。

## 与记忆的分工

- 论文事实、数值、方法 → 知识库（`kb_*`）。
- 研究经验、偏好、验收口径、该记住的教训 → `cognition_remember` / `cognition_recall`。
- 不要把一次性数值写成“准则”，也不要把准则塞进知识库冒充文献证据。
