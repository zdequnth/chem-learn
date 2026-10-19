// Import AP Chemistry question files from D:\AP化学-SelfPass into the matching
// course chapters/lessons.
//
//   node tools/ap-question-import.mjs                       → dry run
//   node tools/ap-question-import.mjs --unit=5 --unit=6 --apply
//
// Mapping: "Unit 05 .../[AP-Ch U5.3 Q] ..." → the course's 5th chapter, its 3rd
// lesson (lessons ordered by sort_order). The file title is cross-checked against
// the lesson title, so a mis-numbered file is reported instead of imported.
import fs from 'fs'
import path from 'path'
import { execFileSync } from 'child_process'

const ROOT = process.env.AP_ROOT ?? 'D:/AP化学-SelfPass'
const COURSE_NAME = process.env.AP_COURSE ?? 'AP 化学'
const APPLY = process.argv.includes('--apply')
const UNITS = [...new Set(process.argv.filter(a => a.startsWith('--unit=')).map(a => +a.slice(7)))]
const WANTED = UNITS.length ? UNITS : [5, 6]

const PROXY = process.env.SELFPASS_PROXY ?? process.env.HTTPS_PROXY ?? process.env.ALL_PROXY ?? 'http://127.0.0.1:7890'
const env = fs.readFileSync('.env.local', 'utf8')
const SB = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)[1].trim()
const KEY = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)[1].trim()

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
const norm = (s) => String(s || '').replace(/\s+/g, '').replace(/[()（）【】\[\]—\-_·.、,，:：]/g, '').toLowerCase()

// The Clash tunnel drops TLS connections intermittently; retry a few times.
function http(method, pathAndQuery, body) {
  const args = ['-s', '-X', method, SB + '/rest/v1/' + pathAndQuery,
    '-H', 'apikey: ' + KEY, '-H', 'Authorization: Bearer ' + KEY]
  if (PROXY && PROXY !== 'direct') args.push('-x', PROXY)
  else args.push('--noproxy', '*')
  if (body !== undefined) {
    args.push('-H', 'Content-Type: application/json', '-H', 'Prefer: return=representation', '--data-binary', '@-')
  }
  const input = body !== undefined ? JSON.stringify(body) : undefined
  let last
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      const out = execFileSync('curl', args, { input, maxBuffer: 128 * 1024 * 1024, stdio: ['pipe', 'pipe', 'ignore'] })
      const text = out.toString().trim()
      return text ? JSON.parse(text) : null
    } catch (e) {
      last = e
      if (attempt < 6) sleep(attempt * 700)
    }
  }
  throw last
}

function parseQuestions(md) {
  const clean = md.replace(/<span[^>]*class="katex"[^>]*>[\s\S]*?<\/span>/g, ' ').replace(/<[a-zA-Z/!][^>]*>/g, '')
  const lines = clean.replace(/\r\n/g, '\n').split('\n')
  const raw = []
  let cur = null, stage = 'none'
  const isStart = (l) => /^\s*\*\*\s*\d+\s*[.)、．:]/.test(l) || /^\s*\d+\s*[.)、．:]\s+\S/.test(l)
  for (const line0 of lines) {
    const line = line0.trim()
    if (!line) continue
    // Stop before the answer-key table, or it gets glued onto Q40's explanation.
    if (/^#{1,4}\s+Answer Key/i.test(line)) break
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

function titleMatches(fileTitle, lessonTitle) {
  const a = norm(fileTitle), b = norm(lessonTitle)
  if (!a || !b) return false
  if (a.includes(b) || b.includes(a)) return true
  const words = String(fileTitle).toLowerCase().match(/[a-z0-9]{3,}/g) || []
  if (words.length === 0) return true
  const hit = words.filter(w => String(lessonTitle).toLowerCase().includes(w)).length
  return hit / words.length >= 0.5
}

function walkMd(dir) {
  const out = []
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name)
    if (ent.isDirectory()) out.push(...walkMd(p))
    else if (ent.name.toLowerCase().endsWith('.md')) out.push(p)
  }
  return out
}

const courses = http('GET', 'courses?select=id,name&limit=200')
const course = courses.find(c => norm(c.name) === norm(COURSE_NAME))
  || courses.find(c => norm(c.name).includes(norm(COURSE_NAME)))
if (!course) { console.error(`找不到课程「${COURSE_NAME}」`); process.exit(1) }

const chapters = http('GET', `chapters?course_id=eq.${course.id}&select=id,title,sort_order&order=sort_order`)

console.log(`== AP 题库导入${APPLY ? '（写入）' : '（试跑，不写库）'} ==`)
console.log(`课程：${course.name}；单元：${WANTED.join(', ')}\n`)

const jobs = []
for (const unit of WANTED) {
  const chapter = chapters[unit - 1]
  if (!chapter) { console.log(`❌ 没有第 ${unit} 章`); continue }
  const lessons = http('GET', `lessons?chapter_id=eq.${chapter.id}&select=id,title,sort_order&order=sort_order`)
  const dirName = fs.readdirSync(ROOT).find(d => new RegExp(`^Unit\\s*0?${unit}\\b`, 'i').test(d) && fs.statSync(path.join(ROOT, d)).isDirectory())
  if (!dirName) { console.log(`❌ 找不到 Unit ${unit} 文件夹`); continue }
  const files = walkMd(path.join(ROOT, dirName)).filter(f => / Q\]/i.test(path.basename(f))).sort()
  for (const file of files) {
    const name = path.basename(file).replace(/\.md$/i, '')
    const codeM = name.match(/U\s*(\d+)\s*\.\s*(\d+)/i)
    const titleM = name.match(/\]\s*(.+)$/)
    const fileTitle = (titleM ? titleM[1] : name).trim()
    const qs = parseQuestions(fs.readFileSync(file, 'utf8'))
    if (!codeM) { console.log(`❌ ${name}：文件名无 U<章>.<节>`); continue }
    if (+codeM[1] !== unit) { console.log(`❌ ${name}：单元号不符`); continue }
    const lesson = lessons[+codeM[2] - 1]
    if (!lesson) { console.log(`❌ ${name}：第 ${unit} 章没有第 ${codeM[2]} 个课时`); continue }
    const ok = titleMatches(fileTitle, lesson.title)
    console.log(`${ok ? '✅' : '⚠️'} ${name}\n     → ${chapter.title} / 「${lesson.title}」 | ${qs.length} 题`)
    jobs.push({ file, lesson, qs, ok })
  }
}

const good = jobs.filter(j => j.ok)
console.log(`\n合计：${good.length} 个文件，${good.reduce((a, j) => a + j.qs.length, 0)} 题${jobs.length - good.length ? `；${jobs.length - good.length} 个标题不符` : ''}`)
if (!APPLY) { console.log('（试跑结束。确认后加 --apply）'); process.exit(0) }

let inserted = 0, skipped = 0, failed = 0
for (const job of good) {
  const existing = http('GET', `questions?lesson_id=eq.${job.lesson.id}&select=stem&limit=2000`)
  const have = new Set(existing.map(e => norm(e.stem)))
  const fresh = job.qs.filter(q => !have.has(norm(q.stem)))
  skipped += job.qs.length - fresh.length
  if (!fresh.length) { console.log(`↷ ${path.basename(job.file)}：全部已存在`); continue }

  let created
  try {
    created = http('POST', 'questions', fresh.map(q => ({
      lesson_id: job.lesson.id,
      question_type: 'gate_test',
      stem: q.stem,
      explanation: q.explanation,
      difficulty: q.difficulty,
      is_approved: true,
      is_ai_generated: false,
    })))
  } catch (e) {
    failed += fresh.length
    console.log(`⚠️ ${path.basename(job.file)}：题目写入失败 ${fresh.length} 题`)
    continue
  }

  const idByStem = new Map((created || []).map(row => [norm(row.stem), row.id]))
  const rows = []
  for (const q of fresh) {
    const qid = idByStem.get(norm(q.stem))
    if (!qid) continue
    q.options.forEach((o, i) => rows.push({
      question_id: qid, content: o.content, is_correct: o.isCorrect, display_order: i,
    }))
  }
  try {
    http('POST', 'question_options', rows)
    inserted += fresh.length
    console.log(`✅ ${path.basename(job.file)}：新增 ${fresh.length} 题`)
  } catch (e) {
    failed += fresh.length
    const ids = [...idByStem.values()]
    try { http('DELETE', `questions?id=in.(${ids.join(',')})`) } catch {}
    console.log(`⚠️ ${path.basename(job.file)}：选项写入失败，已回滚 ${fresh.length} 题`)
  }
}

console.log(`\n完成：新增 ${inserted} 题，跳过重复 ${skipped} 题${failed ? `，失败 ${failed} 题` : ''}。`)
