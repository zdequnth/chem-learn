# SelfPass 背单词课程建设指南 / Building a Vocabulary Course

> 面向：想自己开一门「背单词」课的老师。
> 前提：会用浏览器、会复制粘贴。**不需要写代码，也不需要联系平台作者。**
> 用到的 AI：任何一家都行（ChatGPT / Claude / DeepSeek / 豆包…）。关键是下面第 3 步给的提示词。

---

## 中文版

### 一、这套东西是怎么运作的（先看这 30 秒）

SelfPass 的「背单词」不是独立的刷词 App，而是挂在**课程 → 章节 → 课时**这套已有结构上的：

```
课程（背单词类型）
 └── 章节（例如 Ch.12 The Periodic Table）
      └── 课时（例如 12.2 Group I: the alkali metals）
           └── 词条（term / 音标 / 中文 / 英文释义 / 例句 …）
```

学生登录后按课时背词，进度存在服务器上（**换电脑、换平板都能接着背**），你在后台能看到每个人的掌握情况。

**所以你要准备的东西只有两样：**
1. 在后台搭好课程骨架（章节 + 课时）——点几下的事
2. 每个课时的词表 —— 交给 AI 生成，你再粘贴导入

---

### 二、全流程（7 步）

1. 新建一门「背单词课程」
2. 搭章节和课时
3. 让 AI 生成词表 JSON（**核心步骤，附提示词**）
4. 检查 AI 的输出
5. 粘贴导入
6. 配图（可选）
7. 建班级 / 加协作者

---

#### 第 1 步　新建「背单词课程」

1. 登录 → 左上角菜单 → **课程管理**
2. 点 **新建课程**
3. 填课程名称（例如 `IGCSE 化学`）、学科、年级
4. **课程类型必须选 `📖 背单词课程`** —— ⚠️ 创建后不可更改。选错了只能删掉重建
5. 创建完成

> 背单词课程和普通「过关课程」是两套东西：过关课程有"连对 7 题通关"的关卡逻辑，背单词课程没有关卡，学生自由练习。**不要用过关课程来装词表。**

---

#### 第 2 步　搭章节和课时

1. 课程管理 → 点你刚建的课程右边的 **编辑**（背单词课程多一个 `📖 词库` 按钮，那是管词表的，不是管结构的）
2. 在课程结构页里添加章节、课时

**批量导入（推荐）**：课程结构页支持 Markdown 批量生成，格式是：

```markdown
# Ch.1 States of matter
## 1.1 Solids, liquids, and gases
## 1.2 The particle model
## 1.3 Explaining the changes of state

# Ch.2 Separating substances
## 2.1 Mixtures and compounds
## 2.2 Solutions and solubility
```

（`#` 是章节，`##` 是课时。一次可以贴好几章。）

> **重要：课时名要和教材/你的教学进度对得上。** 词表是按课时挂的，课时名乱了后面很难对。
> 建议直接照抄教材目录，或者你自己的教学计划表。

---

#### 第 3 步　让 AI 生成词表 JSON　★核心

这一步决定词库的质量。把下面这段提示词**整段复制**给 AI，然后按提示替换方括号里的内容。

##### 提示词模板（完整版，推荐）

```
你是 IGCSE 化学词汇教研助手。我要为教材《____［填教材名］》的
「____［填章节名，如 Ch.12 The Periodic Table］」整理一份"背单词"词表，
请输出严格 JSON。

【背景】
学生是国际部九年级，用英文学化学。他们的障碍不是化学概念，而是英文词汇——
很多在母语者看来很普通的词（steel、terminal、layer）他们也没掌握。
所以选词要"宽"，不要只挑抽象概念。

【选词范围】
下面粘贴这一章的教材内容 / 目录 / 复习清单。请只从里面选词：
———— 从这里开始粘贴 ————
［粘贴教材原文或该章目录 + 复习清单］
———— 粘贴结束 ————

【选词原则】
- 收：化学概念、物质名称、仪器装置、材料、专业形容词/动词、部件与方位词、通用技术词
  （例如：conical flask、negative terminal、steel、layer、moisture、upside down）
- 不收：与化学无关的纯日常词（如 beautiful、friend、holiday）
- 忠于教材：教材里没真正出现过的词不要收。拿不准就跳过，宁可少不可错
- 一个词在同一课时只出现一次
- 数量：每个课时约 10–14 个词；内容单薄的课时 6–8 个也可以

【请按课时分组，每个课时单独给我一个 JSON 数组，并标上课时名】

【字段规则】每个词是一个对象，字段如下：
{
  "term": "英文词条，用教材的原写法",
  "ipa": "英式音标，带斜杠，如 /ˈætəm/。多词短语给整条音标",
  "pos": "词性缩写，只能是 n. / v. / adj. / adv.",
  "zh": "简洁准确的中文，2–8 字，如 '碱金属'，不要写整句",
  "en_def": "用九年级学生看得懂的简单英文解释这个词，一句话",
  "example_en": "一个化学语境的完整英文例句",
  "example_zh": "上面例句的中文翻译",
  "note": "易错点 / 易混词 / 记忆提示，一句话。没有就填空字符串",
  "difficulty": "核心必背" | "重要理解" | "拓展阅读"（不填按「重要理解」）
}

【硬性要求】
1. 只输出 JSON 数组，用 ```json 围栏包起来，前后不要写任何解释文字
2. 顶层是数组，不是对象
3. term 和 zh 不能为空，其余字段允许是空字符串 ""
4. 不要有重复的 term
5. 拼写一律用英式（BrE）：sulfur 不写 sulphur、colour 不写 color、-ise 不写 -ize
6. 音标一律用英式（BrE）发音
7. 例句里用到的其他专业词要保证简单、或学生已学过

【输出格式示例】
```json
[
  { "term": "atom", "ipa": "/ˈætəm/", "pos": "n.", "zh": "原子",
    "en_def": "The smallest particle of an element that can exist.",
    "example_en": "An atom of sodium has 11 protons.",
    "example_zh": "一个钠原子有 11 个质子。",
    "note": "与 molecule、ion 区分：原子是元素的最小单位。", "difficulty": "核心必背" }
]
```

请开始，输出「［课时名］」的 JSON。
```

##### 提示词模板（精简版，赶时间用）

```
你是有 20 年经验的 IGCSE 化学老师。请为【____】这一课时整理背单词表，
输出严格 JSON 数组，用 ```json 包起来，不要任何解释。

每个词一个对象，字段：term(英文), ipa(英式音标), pos(n./v./adj.),
zh(中文,不超过8字), en_def(九年级能懂的英文解释),
example_en(化学例句), example_zh(例句中文), note(易错提示),
difficulty(核心必背/重要理解/拓展阅读)。

要求：
- 收 10–14 个词，包括化学概念、仪器、材料、部件方位词；不收无关日常词
- 只用教材里真正出现过的词，拿不准的跳过
- 英式拼写和英式音标
- term 和 zh 必填，其余可为空字符串
- 不要重复
```

##### 一次给多章怎么办

AI 一次输出十几章会**中途偷懒**（词量缩水、后面章节糊弄）。建议：

- **一次一个课时或一章**。想要快就一次一章，然后逐课时核对数量。
- 章节多时，可以在提示词末尾加一句：
  > 我有 19 章，这是第 1 章。讲完后我会发第 2 章，请保持同样的标准和详细程度。

---

#### 第 4 步　检查 AI 的输出

AI 一定会出错。粘贴前花 2 分钟过一遍：

| 检查项 | 常见问题 |
|---|---|
| **JSON 格式** | 有没有缺逗号、多逗号、括号不配对 → 粘进去会报"解析失败" |
| **数量** | 每个课时够不够 10 个左右；AI 常常越到后面越少 |
| **拼写** | 会不会混进美式拼写（color / sulphur / -ize） |
| **音标** | 有没有漏 `/`、或用美式音标 |
| **中文** | 是不是写成了整句话（应该 2–8 字） |
| **term 重复** | 同一课时里有没有重复词 |
| **凭空造词** | 教材里没有的词（AI 很容易"顺手"补一个）→ 删掉 |
| **易混点** | `note` 有没有价值，比如 ammonia/ammonium、sulfuric/sulfurous |

**怎么快速验 JSON 格式**：把 AI 的输出粘到任意一个 JSON 校验网站，或直接在导入弹窗里点「解析预览」——能预览出条数就是格式没问题。

---

#### 第 5 步　粘贴导入

1. 课程管理 → 点你的背单词课程旁的 **`📖 词库`**
2. 顶部有三个标签：**词库管理 / 掌握情况 / 协作者**，默认在「词库管理」
3. 三个下拉框依次选 **课程 → 章节 → 课时**（选到课时才会显示词表）
4. 点 **「粘贴 JSON 导入」**
5. 把 AI 给的 JSON **整段粘进文本框**（连 ` ```json ` 围栏一起粘也行，会自动去掉）
6. 点 **「解析预览」** → 会显示"预览：N 条"
7. 逐条快速核对，不要的点条目上的删除按钮
8. 点 **「确认导入 N 条」**

导入后可以逐条 **编辑**（术语 / 音标 / 词性 / 中文 / 英文释义 / 例句 / 例句翻译 / 易错点 / 掌握优先级 / 配图），也可以手动新增、删除。

##### ⚠️ 导入规则（务必知道，不然会踩坑）

| 规则 | 说明 |
|---|---|
| **只有 `term` 和 `zh` 必填** | 其它字段留空也可以，卡片上就不显示那一行 |
| **同一课时内 term 重复 → 跳过** | 注意是**跳过，不是覆盖**！想改已有的词，用「编辑」，别指望重新导入覆盖 |
| **顺序按数组顺序追加到末尾** | 想让某个词排前面，就在数组里放前面 |
| **`difficulty` 只认三档** | 只能填「核心必背 / 重要理解 / 拓展阅读」；写 1/2/3 也认（映射为这三档）；其它值或不填一律按「重要理解」 |
| **删除单个词条会连带删除学生的学习进度** | 删之前想清楚 |
| **可以重复导入** | 已经有的词会被跳过，不会变成两份 |

---

#### 第 6 步　配图（可选，但很提分）

对具体的东西（装置、材料、矿物）配图效果很好；抽象概念不用配。

两种方式：

**A. 在编辑弹窗里上传（推荐）**
1. 词条右侧点 **编辑**
2. 点 **上传图片** → 选本地图片
3. 保存

限制：**只支持 PNG / JPG / WebP / GIF，且小于 1MB**（不支持 SVG）。超过 1MB 请先压缩。

**B. 在 JSON 里直接写 `image_url`**
可以用外部图片链接，但要保证学生能打开。**最稳的还是用 A 方式上传。**

> ⚠️ 换图时**必须换一个新文件名**（系统对图片做了永久缓存，同名文件不会更新）。也就是说：删掉图片重新上传 ≠ 覆盖，得让它生成新名字，这在编辑弹窗里上传时是自动的。

---

#### 第 7 步　发布课程、建班级、加协作者

**发布课程（学生才能看到）**

回到 **课程管理**，在你这门课右边点 **发布**。按钮会变成「取消发布」，卡片上出现绿色的 **已发布** 标记。

> 学生的可见规则是：**「他所在班级关联的课程」或「任何已发布的课程」**。
> 所以两条路任选其一即可：① 把课程发布（推荐，一次搞定全体）；② 建一个班级并关联这门课。
> 两条都不做 → 学生端「词汇」页面里**看不到这门课**。

**建班级（为了让老师能在班级维度看学情）**
1. 菜单 → **班级管理** → 新建班级
2. 关联课程选你这门背单词课程（这样班级详情页能看到这门课的进度）
3. 把邀请码发给学生，学生自助加入；也可以直接搜索姓名把学生加进来

**加协作者（多位老师一起建词库）**
1. 进 `📖 词库` → **协作者** 标签
2. 按课程添加其他老师——**协作者按课程独立**，每门课各自维护名单
3. 协作者拥有该课程的全部编辑权限（词库、章节、课时）

---

### 三、字段速查表

| 字段 | 必填 | 说明 |
|---|---|---|
| `term` | ✅ | 英文词条，教材原写法（英式拼写） |
| `zh` | ✅ | 中文，2–8 字 |
| `ipa` | | 英式音标，含斜杠，如 `/ˈætəm/` |
| `pos` | | 只写 `n.` / `v.` / `adj.` / `adv.`。仅教师端和导出文件使用，学生卡片上不显示 |
| `en_def` | | 简单的英文释义（九年级看得懂） |
| `example_en` | | 化学语境的英文例句 |
| `example_zh` | | 上面例句的中文翻译 |
| `note` | | 易错点 / 易混词 / 记忆提示 |
| `difficulty` | | 掌握优先级，三选一：`核心必背`（必须会拼会解释）/ `重要理解`（认得并理解）/ `拓展阅读`（见过即可）。不填按「重要理解」 |
| `image_url` | | 一般留空，用上传方式配图 |

---

### 四、学生端会怎么用这些词（为什么字段质量重要）

学生端有四种模式：**卡片 / 发音 / 拼写 / 选择题**。

- **卡片**：`term` + `ipa` + 🔊 发音（浏览器朗读）→ 翻面看 `zh` / `en_def` / `example_en` / `note`
- **拼写**：给中文和发音 → 学生拼英文
- **选择题（英文）**：看 `term` 选中文
- **选择题（英释）**：看 `en_def` 选英文词条 ← **所以 `en_def` 必须能把这个词和同课时的其他词区分开**，否则题目没法出
- 干扰项从**同一课时的其他词**里取。所以一个课时**词太少（少于 4 个）选择题会降级**为少数选项

**掌握度规则**：只有**拼写 / 选择题**这类客观题答对才会提升掌握度；卡片上自评"认识"**不会**提升（防止学生自己点过去）。所以同一课时里，拼写要能拼、词义要能区分，词与词**不能太像**。

`difficulty`（掌握优先级）分三档，学生端三轮都会背到，它只是给老师和学生一个"先背哪一批"的次序：

- **核心必背** —— 必须会拼、会解释。基础概念（atom / ion / mole）、考纲标准物质、仪器名、反应类型
- **重要理解** —— 要认得、能理解，拼写次要。具体化合物（`magnesium chloride`）、一般性质/过程词
- **拓展阅读** —— 见过即可。商品名（`Teflon`）、细分矿物（`galena`）、偏门工业词、过细的有机命名、生物/地理支撑词

标注时请用**绝对标准**，不要"跟本章其他词比"——否则越到后面章，难度会整体漂高。判断口径：*如果学生在考试里拼不出/解释不了这个词会不会被扣分？* 会 → 核心必背。

---

### 五、常见问题

**Q：课程建好了，学生看不到？**
可见条件是「班级关联了这门课」**或**「课程已发布」。所以检查：① 课程有没有点**发布**；② 如果没发布，班级是不是关联了这门课、学生有没有加入班级。

**Q：导入后数量不对，少了几条？**
被跳过了。同一个课时里 `term` 重复、或 `term`/`zh` 为空的条目会被跳过。弹窗会提示"跳过 N 条"。

**Q：我想改已导入的词，重新导入一次能覆盖吗？**
**不能。** 重复的 term 会被跳过。请用「编辑」改。

**Q：点了「解析预览」没反应 / 报错？**
JSON 格式不对。最常见的是：AI 输出了多段代码块（每课时一段），你只粘了一段或多段拼在一起。**一次只粘一个课时的一整段 JSON 数组。**

**Q：一个课时 15 个词会不会太多？**
系统没有上限，但建议 10–14 个，学生一次背完不至于崩。词多的课时可以拆成两个课时。

**Q：图片传不上去？**
① 格式不对（不支持 SVG 和 PDF，只支持 PNG/JPG/WebP/GIF）；② 超过 1MB，先压缩。注意移动端拍的图一般远大于 1MB。

**Q：想给别的学科（生物、物理、二外）也建背单词课？**
完全一样。把第 3 步提示词里的「IGCSE 化学」换成你的学科，把"化学概念"换成对应学科的概念即可。

---

### 六、附：可直接复制的提示词（只保留主体，方便改）

**中文版**

```
你是____学科的词汇教研助手。我要为教材《____》的「____」整理一份背单词词表，
输出严格 JSON 数组，用 ```json 围起来，前后不要任何解释文字。

【背景】学生是____年级，用英文学____。他们的英文词汇量是主要障碍，
很多普通词也没掌握，所以选词要宽，不要只挑抽象概念。

【选词范围】只从下面这段教材内容里选：
［粘贴教材原文］

【选词原则】
- 收：学科概念、物质/对象名称、仪器装置、材料、专业形容词动词、部件与方位词、通用技术词
- 不收：与学科无关的纯日常词
- 忠于教材，教材里没出现的词不要收，拿不准就跳过
- 每课时约 10–14 个词

【字段】term(英文原写法), ipa(音标,带斜杠), pos(n./v./adj.), zh(中文2-8字),
en_def(该年级能懂的简单英文解释), example_en(学科语境例句), example_zh(例句中文),
note(易错/易混提示,没有填空字符串), difficulty(核心必背/重要理解/拓展阅读)

【硬性要求】
1. 顶层是数组；2. term 和 zh 必填，其余可为空字符串；3. 不要重复 term；
4. 一律英式拼写和英式音标；5. en_def 要能把本词和同课时其他词区分开

请输出「____」的 JSON。
```

**English version**

```
You are a vocabulary consultant for ____ (subject). Build a vocabulary list for
"____" from the textbook "____". Output STRICT JSON only, wrapped in a ```json
fence, with no commentary before or after.

[Context] The students are in grade ____ and study ____ in English. Their main
obstacle is English vocabulary - even many ordinary words are unfamiliar - so
select generously, not just abstract concepts.

[Scope] Choose only from the textbook content pasted below:
[paste the textbook text]

[Selection rules]
- INCLUDE: subject concepts, names of substances/objects, apparatus, materials,
  technical adjectives and verbs, parts and orientation words, general technical terms
- EXCLUDE: everyday words unrelated to the subject
- Be faithful to the textbook. Do not include words that never appear; if unsure, skip
- About 10-14 words per lesson

[Fields] term, ipa (with slashes), pos (n./v./adj.), zh (Chinese, 2-8 characters),
en_def (simple definition a grade-____ student understands),
example_en (subject-specific sentence), example_zh (translation of the example),
note (common mistakes / confusables, "" if none),
difficulty (核心必背 / 重要理解 / 拓展阅读)

[Hard requirements]
1. Top level is an array; 2. term and zh are required, others may be "";
3. No duplicate terms; 4. Use British spelling and British pronunciation;
5. en_def must make the word distinguishable from the other words in the same lesson

Now output the JSON for "____".
```

---

## English Version

### How it works (30 seconds)

The vocabulary feature is not a standalone app - it hangs off the existing
**Course → Chapter → Lesson** structure:

```
Course (vocabulary type)
 └── Chapter (e.g. Ch.12 The Periodic Table)
      └── Lesson (e.g. 12.2 Group I: the alkali metals)
           └── Word entries (term / IPA / Chinese / English definition / example …)
```

Students practise per lesson, and progress is stored server-side, so they can
continue on any device. You can watch each student's mastery in the backend.

### The 7 steps

1. **Create a vocabulary course** - Course Management → New Course → fill in name /
   subject / grade → **Course type must be `📖 Vocabulary course`** (fixed after
   creation, so choose carefully).
2. **Build chapters and lessons** - Course Management → *Edit* on your course.
   Batch import with Markdown: `# Chapter` / `## Lesson`. Lesson names should match
   your textbook or teaching plan, because word lists hang off lessons.
3. **Have an AI generate the word list JSON** - see the prompt templates above.
   Feed it the textbook text for one chapter, and paste the prompt.
4. **Check the AI output** - JSON validity, word count, British spelling, IPA,
   duplicates, invented words.
5. **Paste and import** - `📖 Word bank` on the course → tabs *Word bank / Mastery /
   Collaborators* → pick course → chapter → lesson → **Paste JSON** → **Parse** →
   review → **Import**.
6. **Add images (optional)** - edit a word → upload. PNG/JPG/WebP/GIF only, under
   1 MB. To replace an image you must use a new filename (images are cached forever).
7. **Publish, create a class, add collaborators** - back in Course Management click
   **发布 (Publish)** on your course. Students see a course if their class links it
   **or** if it is published. Then Class Management → new class → link the course →
   share the invite code. Add co-teachers under the *Collaborators* tab (kept per
   course, with full edit rights).

### Import rules you must know

| Rule | Detail |
|---|---|
| Only `term` and `zh` are required | Other fields may be blank |
| Duplicate `term` in the same lesson → **skipped, not overwritten** | Use *Edit* to change an existing word |
| Order | Words are appended in array order |
| `difficulty` | One of `核心必背` (must be able to spell + explain) / `重要理解` (recognise and understand) / `拓展阅读` (read-only). `1`/`2`/`3` are also accepted and mapped onto these. Anything else, or blank, becomes `重要理解` |
| Deleting a word | Also deletes students' progress for that word |
| Re-importing | Existing words are skipped, never duplicated |

### Why the fields matter

Students get four modes: **flashcard / pronunciation / spelling / multiple choice**.
Multiple choice draws distractors from the *other words in the same lesson*, and one
mode asks students to pick the English term from its English definition. So:

- `en_def` must distinguish the word from its lesson-mates.
- Lessons with fewer than 4 words get degraded MCQs.
- Only objective modes (spelling / multiple choice) raise mastery; flashcard
  self-rating never does.

### FAQ

**Course invisible to students?** Students see a course if their class links it **or**
if the course is published - so either publish the course, or make sure the class is
linked to it and the student has joined that class.

**Import count lower than expected?** Duplicate or blank entries were skipped; the
dialog reports how many.

**Can I overwrite by re-importing?** No. Duplicates are skipped - use *Edit*.

**Image upload fails?** Unsupported format (no SVG/PDF) or larger than 1 MB.

**Other subjects?** Identical workflow - just swap the subject name in the prompt.
