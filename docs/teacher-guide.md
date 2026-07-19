# SelfPass 教师使用指南 / Teacher Guide

---

## 中文版

### 设计理念

SelfPass 基于**布鲁姆精熟学习理论**。教师自主建课、AI 辅助出题、精熟通关检测，学生必须在当前课时达标后才能解锁下一课时，杜绝盲目跳进度。涵盖语文、数学、英语、二外、物理、化学、生物、人文八大学科。

### 快速上手

#### 1. 创建课程

- 仪表盘 → 课程管理 → 新建课程
- 填课程名称，选学科和年级
- 创建后点进课程开始搭建内容

#### 2. 搭建课程结构

- **章节**：课程内的大单元（如"酸碱中和"）
- **课时**：章节下的具体教学内容（如"指示剂"）
- 支持批量导入：用 Markdown 格式 `# 章节名` / `## 课时名` 一键生成
- 支持跨课程复制章节（📥 导入章节）
- 章节和课时可以拖拽排序、重命名

#### 3. 知识点管理

- 展开课时 → 点击「知识点 ▸」→ 添加知识点
- 点击知识点标题弹出编辑窗口：左侧编辑描述/PDF/视频，右侧实时预览学生端效果
- 支持 Markdown 格式、Ctrl+V 粘贴图片

#### 4. 题库建设

- **AI 生成题目**：选课时 → 设定数量 → 一键生成选择题（支持 8 大学科）
- **导入题目**：粘贴 Markdown 格式的题目文本，AI 转为结构化题目
- **手动添加**：纯手动输入题目、选项、解析
- 所有题目保存到题库，可按课时筛选、预览、删除

#### 5. 班级管理

- 创建班级时选择关联课程（必选）
- 邀请码发给学生，学生自助加入
- 也可以直接添加学生（输入姓名搜索）
- 班级详情页查看每个学生的通关进度（进度条 + 章节细分）

#### 6. 协作者

课程业主可以添加其他教师为协作者，协作者拥有课程的全部编辑权限（章节、课时、题库）。

### 通关规则说明

- 学生连续答对 7 题 → 通关
- 或答 ≥ 10 题且正确率 ≥ 90% → 通关
- 累计答错 3 题 → 锁定 10 分钟
- 一章全部通关后自动解锁下一章第一节

### 重点课时

课时旁 ❤️ 按钮标记为重点课时，学生端红色边框 + ❤️ 提示。

### 常见问题

**Q: 学生没有进度怎么办？**
确保班级绑定到了对应的课程。student_id 和 progress 外键依赖 profile 表，profile 缺失会导致进度无法创建。学生登录时系统会自动创建 profile。

**Q: AI 出题失败？**
重试一次。如果反复失败，检查 DeepSeek API 余额。

---

## English Version

### Design Philosophy

SelfPass is built on **Bloom's Mastery Learning Theory**. Teachers build courses independently, AI assists in question generation, and students must pass each lesson before advancing. Covers 8 subjects: Chinese, Math, English, 2nd Language, Physics, Chemistry, Biology, and Humanities.

### Quick Start

#### 1. Create a Course

Dashboard → Course Management → New Course. Enter name, select subject and grade level.

#### 2. Build Course Structure

- **Chapters**: Major units within the course
- **Lessons**: Specific teaching content under chapters
- Batch import: use Markdown format `# Chapter` / `## Lesson` for one-click creation
- Cross-course copy: 📥 Import Chapter from another course
- Drag to reorder, click to rename

#### 3. Knowledge Points

Expand a lesson → click "知识点 ▸" → add knowledge points. Click a KP title to open the editor: edit description/PDF/video on the left, live student preview on the right. Supports Markdown and Ctrl+V image paste.

#### 4. Question Bank

- **AI Generate**: Select lesson → set count → one-click generation (8 subjects supported)
- **Import**: Paste Markdown text, AI parses into structured questions
- **Manual Add**: Enter question, options, explanation manually
- View, filter, and delete questions by lesson

#### 5. Class Management

- Create a class with a linked course (required)
- Students join via invite code
- Add students directly by searching their name
- Class detail page shows each student's progress with per-chapter breakdown

#### 6. Collaborators

Course owners can add other teachers as collaborators with full editing permissions.

### Mastery Rules

- 7 consecutive correct → Pass
- ≥ 10 questions with ≥ 90% accuracy → Pass
- 3 total wrong → 10-minute lock
- All lessons in a chapter passed → auto-unlock next chapter

### Key Lessons

❤️ button marks a lesson as key. Students see a red border + ❤️ indicator.

### FAQ

**Q: Student has no progress?**
Ensure the class is linked to the correct course. The student's profile must exist in the database (auto-created on first login).

**Q: AI generation fails?**
Retry. Check DeepSeek API balance if the issue persists.
