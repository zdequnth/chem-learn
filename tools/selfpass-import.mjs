// SelfPass auto-import: drop .md question files into D:\111 MY IDEA\SelfPass\<course>\
//   node tools/selfpass-import.mjs            → dry run: prints the mapping report only
//   node tools/selfpass-import.mjs --apply    → writes questions to the bank (deduped)
//
// Matching: folder name → course, file name "[.. U<chapter>.<lesson> Q] <title>"
//   → chapter/lesson by position, cross-checked against the lesson title.
import fs from 'fs'
import path from 'path'
import { execFileSync } from 'child_process'

const ROOT = 'D:/111 MY IDEA/SelfPass'
const APPLY = process.argv.includes('--apply')

// Supabase is not reachable directly from this machine; route through the local
// Clash proxy (same one git uses). Override with SELFPASS_PROXY=<url|direct>.
const PROXY = process.env.SELFPASS_PROXY ?? process.env.HTTPS_PROXY ?? process.env.ALL_PROXY ?? 'http://127.0.0.1:7890'

const env = fs.readFileSync('.env.local', 'utf8')
const SB = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)[1].trim()
const KEY = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)[1].trim()

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)

// The Clash tunnel drops TLS connections intermittently (curl exit 35), so retry
// a few times before giving up — that's what the backoff is for.
function http(method, pathAndQuery, body) {
  const args = ['-s', '-X', method, SB + '/rest/v1/' + pathAndQuery,
    '-H', 'apikey: ' + KEY, '-H', 'Authorization: Bearer ' + KEY]
  if (PROXY && PROXY !== 'direct') args.push('-x', PROXY)
  else args.push('--noproxy', '*')
  if (body !== undefined) args.push('-H', 'Content-Type: application/json', '-H', 'Prefer: return=representation', '--data-binary', '@-')
  const input = body !== undefined ? JSON.stringify(body) : undefined
  let last
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const out = execFileSync('curl', args, { input, maxBuffer: 64 * 1024 * 1024, stdio: ['pipe', 'pipe', 'ignore'] })
      const text = out.toString().trim()
      return text ? JSON.parse(text) : null
    } catch (e) {
      last = e
      if (attempt < 5) sleep(attempt * 800)
    }
  }
  throw last
}

const norm = (s) => String(s || '').replace(/\s+/g, '').replace(/[()（）【】\[\]—\-_·.、,，:：]/g, '').toLowerCase()

function parseQuestions(md) {
  const clean = md.replace(/<span[^>]*class="katex"[^>]*>[\s\S]*?<\/span>/g, ' ').replace(/<[a-zA-Z/!][^>]*>/g, '')
  const lines = clean.replace(/\r\n/g, '\n').split('\n')
  const raw = []
  let cur = null, stage = 'none'
  const isStart = (l) => /^\s*\*\*\s*\d+\s*[.)、．:]/.test(l) || /^\s*\d+\s*[.)、．:]\s+\S/.test(l)
  for (const line0 of lines) {
    const line = line0.trim()
    if (!line) continue
    if (isStart(line)) {
      cur = { stem: line.replace(/^\s*\**\s*\d+\s*[.、)．:]\s*/, '').replace(/\*\*/g, '').trim(), options: [], answer: null, explanation: '' }
      raw.push(cur); stage = 'stem'; continue
    }
    if (!cur) continue
    if (/^-{3,}$/.test(line)) continue
    let m
    if ((m = line.match(/^[-*]\s*([A-D])[.)、]\s*(.*)$/))) { cur.options.push({ letter: m[1].toUpperCase(), content: m[2].replace(/\*\*/g, '').trim() }); stage = 'options'; continue }
    if ((m = line.match(/^\**\s*Answer\s*[:：]\s*\(?([A-D])/i))) { cur.answer = m[1].toUpperCase(); stage = 'answer'; continue }
    if ((m = line.match(/^\**\s*Explanation\s*[:：]\s*([\s\S]*)$/i))) { cur.explanation = m[1].replace(/\*\*/g, '').trim(); stage = 'explanation'; continue }
    const t = line.replace(/\*\*/g, '')
    if (stage === 'explanation' || stage === 'answer') cur.explanation += (cur.explanation ? '\n' : '') + t
    else if (stage === 'stem') cur.stem += '\n' + t
  }
  const out = []
  for (const q of raw) {
    const options = q.options.filter(o => o.content)
    if (!q.stem || options.length < 2) continue
    if (!q.answer || !options.some(o => o.letter === q.answer)) continue
    out.push({
      stem: q.stem,
      explanation: q.explanation ? `Answer: ${q.answer}. ${q.explanation}` : `Answer: ${q.answer}.`,
      difficulty: 3,
      options: options.map(o => ({ content: o.content, isCorrect: o.letter === q.answer })),
    })
  }
  return out
}

// title-overlap check: do the file's title words appear in the lesson title?
function titleMatches(fileTitle, lessonTitle) {
  const a = norm(fileTitle), b = norm(lessonTitle)
  if (!a || !b) return false
  if (a.includes(b) || b.includes(a)) return true
  const words = String(fileTitle).toLowerCase().match(/[a-z0-9]{3,}/g) || []
  if (words.length === 0) return true
  const hit = words.filter(w => String(lessonTitle).toLowerCase().includes(w)).length
  return hit / words.length >= 0.5
}

const courses = http('GET', 'courses?select=id,name&limit=200')
const folders = fs.readdirSync(ROOT, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name)

console.log('== SelfPass 自动导入' + (APPLY ? '（写入）' : '（试跑，不写库）') + ' ==\n')
const jobs = []
for (const folder of folders) {
  const nf = norm(folder)
  const course = courses.find(c => norm(c.name) === nf) || courses.find(c => norm(c.name).includes(nf) || nf.includes(norm(c.name)))
  const files = fs.readdirSync(path.join(ROOT, folder)).filter(f => f.toLowerCase().endsWith('.md'))
  console.log(`📁 ${folder}  → 课程：${course ? course.name : '❌ 未匹配到课程'}` + (files.length ? '' : '（无文件）'))
  if (!course) { for (const f of files) console.log(`   · ${f} → ❌ 课程未匹配，跳过`); continue }

  const chapters = http('GET', `chapters?course_id=eq.${course.id}&select=id,title,sort_order&order=sort_order`)
  for (const file of files) {
    const name = file.replace(/\.md$/i, '')
    const codeM = name.match(/U\s*(\d+)\s*\.\s*(\d+)/i)
    const titleM = name.match(/\]\s*(.+)$/)
    const fileTitle = (titleM ? titleM[1] : name).trim()
    const qs = parseQuestions(fs.readFileSync(path.join(ROOT, folder, file), 'utf8'))
    if (!codeM) { console.log(`   · ${file} → ❌ 文件名里没找到 U<章>.<节>，跳过（题数 ${qs.length}）`); continue }
    const chIdx = +codeM[1] - 1, lnIdx = +codeM[2] - 1
    const chapter = chapters[chIdx]
    if (!chapter) { console.log(`   · ${file} → ❌ 该课程没有第 ${chIdx + 1} 章，跳过（题数 ${qs.length}）`); continue }
    const lessons = http('GET', `lessons?chapter_id=eq.${chapter.id}&select=id,title,sort_order&order=sort_order`)
    const lesson = lessons[lnIdx]
    if (!lesson) { console.log(`   · ${file} → ❌ 第 ${chIdx + 1} 章没有第 ${lnIdx + 1} 个课时，跳过（题数 ${qs.length}）`); continue }
    const ok = titleMatches(fileTitle, lesson.title)
    console.log(`   · ${file} → 📚 ${chapter.title} / 第${lnIdx + 1}课「${lesson.title}」 | 标题核对：${ok ? '✅ 一致' : '⚠️ 不一致（文件标题“' + fileTitle + '”）'} | ${qs.length} 题`)
    jobs.push({ file, lesson, qs, ok })
  }
}

const good = jobs.filter(j => j.ok)
console.log(`\n合计：可导入 ${good.length} 个文件，共 ${good.reduce((a, j) => a + j.qs.length, 0)} 题${jobs.length - good.length ? `；${jobs.length - good.length} 个因标题不一致待确认` : ''}`)

if (!APPLY) { console.log('（试跑结束。确认无误后加 --apply 写入）'); process.exit(0) }

let inserted = 0
let failed = 0
for (const job of jobs.filter(j => j.ok)) {
  const existing = http('GET', `questions?lesson_id=eq.${job.lesson.id}&select=stem&limit=2000`)
  const have = new Set(existing.map(e => norm(e.stem)))
  let added = 0
  for (const q of job.qs) {
    if (have.has(norm(q.stem))) continue
    const created = http('POST', 'questions', { lesson_id: job.lesson.id, question_type: 'gate_test', stem: q.stem, explanation: q.explanation, difficulty: q.difficulty, is_approved: true, is_ai_generated: false })
    const qid = Array.isArray(created) ? created[0]?.id : created?.id
    if (!qid) { failed++; continue }
    try {
      // one request per question → options can't end up half-written
      http('POST', 'question_options', q.options.map((o, i) => ({ question_id: qid, content: o.content, is_correct: o.isCorrect, display_order: i })))
      inserted++; added++
    } catch (e) {
      // roll the question back so a re-run redoes it instead of skipping a broken one
      try { http('DELETE', `question_options?question_id=eq.${qid}`) } catch {}
      try { http('DELETE', `questions?id=eq.${qid}`) } catch {}
      failed++
      console.log(`   ⚠️ 写入失败已回滚：${q.stem.slice(0, 40)}…`)
    }
  }
  console.log(`✅ ${job.file} → ${job.lesson.title}：新增 ${added} 题（已跳过重复）`)
}
console.log(`\n完成：共新增 ${inserted} 题。` + (failed ? `失败 ${failed} 题，请重跑本命令补上。` : ''))
