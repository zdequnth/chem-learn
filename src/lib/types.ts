// ============================================================
// Database types for Supabase
// ============================================================

export interface Database {
  public: {
    Tables: {
      profiles: { Row: Profile; Insert: ProfileInsert; Update: ProfileUpdate }
      courses: { Row: Course; Insert: CourseInsert; Update: CourseUpdate }
      chapters: { Row: Chapter; Insert: ChapterInsert; Update: ChapterUpdate }
      lessons: { Row: Lesson; Insert: LessonInsert; Update: LessonUpdate }
      knowledge_points: { Row: KnowledgePoint; Insert: KnowledgePointInsert; Update: KnowledgePointUpdate }
      video_links: { Row: VideoLink; Insert: VideoLinkInsert; Update: VideoLinkUpdate }
      questions: { Row: Question; Insert: QuestionInsert; Update: QuestionUpdate }
      question_options: { Row: QuestionOption; Insert: QuestionOptionInsert; Update: QuestionOptionUpdate }
      classes: { Row: Class; Insert: ClassInsert; Update: ClassUpdate }
      class_members: { Row: ClassMember; Insert: ClassMemberInsert; Update: ClassMemberUpdate }
      student_progress: { Row: StudentProgress; Insert: StudentProgressInsert; Update: StudentProgressUpdate }
      boss_progress: { Row: BossProgress; Insert: BossProgressInsert; Update: BossProgressUpdate }
      gate_test_sessions: { Row: GateTestSession; Insert: GateTestSessionInsert; Update: GateTestSessionUpdate }
      gate_test_answers: { Row: GateTestAnswer; Insert: GateTestAnswerInsert; Update: GateTestAnswerUpdate }
      boss_test_sessions: { Row: BossTestSession; Insert: BossTestSessionInsert; Update: BossTestSessionUpdate }
      boss_test_answers: { Row: BossTestAnswer; Insert: BossTestAnswerInsert; Update: BossTestAnswerUpdate }
      wrong_question_book: { Row: WrongQuestionBook; Insert: WrongQuestionBookInsert; Update: WrongQuestionBookUpdate }
      ai_generation_logs: { Row: AIGenerationLog; Insert: AIGenerationLogInsert; Update: AIGenerationLogUpdate }
      daily_activity: { Row: DailyActivity; Insert: DailyActivityInsert; Update: DailyActivityUpdate }
      vocab_words: { Row: VocabWord; Insert: VocabWordInsert; Update: VocabWordUpdate }
      vocab_progress: { Row: VocabProgress; Insert: VocabProgressInsert; Update: VocabProgressUpdate }
      mock_papers: { Row: MockPaper; Insert: MockPaperInsert; Update: MockPaperUpdate }
      mock_paper_questions: { Row: MockPaperQuestion; Insert: Omit<MockPaperQuestion, 'id' | 'created_at'>; Update: Partial<MockPaperQuestion> }
      mock_test_sessions: { Row: MockTestSession; Insert: Omit<MockTestSession, 'id'>; Update: Partial<MockTestSession> }
      mock_test_answers: { Row: MockTestAnswer; Insert: Omit<MockTestAnswer, 'id'>; Update: Partial<MockTestAnswer> }
    }
  }
}

// ============================================================
// Profile
// ============================================================
export type UserRole = 'student' | 'teacher' | 'admin'

export interface Profile {
  id: string
  role: UserRole
  display_name: string
  avatar_url: string | null
  created_at: string
  updated_at: string
}

export interface ProfileInsert {
  id: string
  role?: UserRole
  display_name: string
  avatar_url?: string
}

export interface ProfileUpdate {
  display_name?: string
  avatar_url?: string
}

// ============================================================
// Course
// ============================================================
// gate = 过关课程（上新课时用）；vocab = 背单词课程；mock = 模拟考课程（限时套题）
export const COURSE_KINDS = ['gate', 'vocab', 'mock'] as const
export type CourseKind = typeof COURSE_KINDS[number]

export interface Course {
  id: string
  name: string
  description: string | null
  grade_level: string | null
  icon: string
  owner_id: string
  sort_order: number
  is_published: boolean
  subject?: string
  kind?: CourseKind
  // Only set on a mock course: the gate course its papers are built from.
  mock_source_course_id?: string | null
  created_at: string
  updated_at: string
}

export interface CourseInsert {
  name: string
  description?: string
  grade_level?: string
  icon?: string
  owner_id: string
  sort_order?: number
  is_published?: boolean
  kind?: CourseKind
  mock_source_course_id?: string | null
}

export interface CourseUpdate {
  name?: string
  description?: string
  grade_level?: string
  icon?: string
  sort_order?: number
  is_published?: boolean
}

// ============================================================
// Chapter
// ============================================================
export interface Chapter {
  id: string
  course_id: string
  title: string
  description: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

export interface ChapterInsert {
  course_id: string
  title: string
  description?: string
  sort_order?: number
}

export interface ChapterUpdate {
  title?: string
  description?: string
  sort_order?: number
}

// ============================================================
// Lesson
// ============================================================
export interface Lesson {
  id: string
  chapter_id: string
  title: string
  description: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

export interface LessonInsert {
  chapter_id: string
  title: string
  description?: string
  sort_order?: number
}

export interface LessonUpdate {
  title?: string
  description?: string
  sort_order?: number
}

// ============================================================
// Knowledge Point
// ============================================================
export interface KnowledgePoint {
  id: string
  lesson_id: string
  title: string
  description: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

export interface KnowledgePointInsert {
  lesson_id: string
  title: string
  description?: string
  sort_order?: number
}

export interface KnowledgePointUpdate {
  title?: string
  description?: string
  sort_order?: number
}

// ============================================================
// Video Link
// ============================================================
export interface VideoLink {
  id: string
  knowledge_point_id: string
  title: string
  url: string
  platform: string
  note: string | null
  sort_order: number
  created_at: string
}

export interface VideoLinkInsert {
  knowledge_point_id: string
  title: string
  url: string
  platform?: string
  note?: string | null
  sort_order?: number
}

export interface VideoLinkUpdate {
  title?: string
  url?: string
  platform?: string
  note?: string | null
  sort_order?: number
}

// ============================================================
// Question
// ============================================================
// 'mock' questions belong to a mock exam paper; their lesson_id points at a
// lesson of the paper's bound gate course, which is what gives the
// "this question is from Ch.2 2.1" mapping.
export type QuestionType = 'gate_test' | 'boss_test' | 'mock'

// 'short' covers fill-in-the-blank, numeric and free text — all graded by AI
// against answer_text. A DB CHECK keeps it to mock questions only, so the gate
// bank stays purely multiple-choice.
export type AnswerType = 'choice' | 'short'

export interface Question {
  id: string
  knowledge_point_id: string | null
  lesson_id: string
  question_type: QuestionType
  answer_type: AnswerType
  answer_text: string | null      // reference answer, for 'short'
  group_id: string | null         // parts of one multi-part question share this
  group_stem: string | null       // their shared passage / data / figure
  difficulty: number
  stem: string
  explanation: string
  image_url: string | null
  is_approved: boolean
  is_ai_generated: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface QuestionInsert {
  knowledge_point_id?: string
  lesson_id: string
  question_type: QuestionType
  answer_type?: AnswerType
  answer_text?: string | null
  group_id?: string | null
  group_stem?: string | null
  difficulty?: number
  stem: string
  explanation?: string
  image_url?: string
  is_approved?: boolean
  is_ai_generated?: boolean
  created_by?: string
}

export interface QuestionUpdate {
  knowledge_point_id?: string | null
  question_type?: QuestionType
  answer_type?: AnswerType
  answer_text?: string | null
  group_id?: string | null
  group_stem?: string | null
  difficulty?: number
  stem?: string
  explanation?: string
  image_url?: string
  is_approved?: boolean
}

// ============================================================
// Question Option
// ============================================================
export interface QuestionOption {
  id: string
  question_id: string
  content: string
  is_correct: boolean
  display_order: number
  created_at: string
}

export interface QuestionOptionInsert {
  question_id: string
  content: string
  is_correct?: boolean
  display_order?: number
}

export interface QuestionOptionUpdate {
  content?: string
  is_correct?: boolean
  display_order?: number
}

// ============================================================
// Class
// ============================================================
export interface Class {
  id: string
  name: string
  teacher_id: string
  course_id: string | null
  invite_code: string
  created_at: string
}

export interface ClassInsert {
  name: string
  teacher_id: string
  course_id?: string
}

export interface ClassUpdate {
  name?: string
  course_id?: string | null
}

export interface ClassMember {
  id: string
  class_id: string
  student_id: string
  joined_at: string
}

export interface ClassMemberInsert {
  class_id: string
  student_id: string
}

export interface ClassMemberUpdate {
  class_id?: string
  student_id?: string
}

// ============================================================
// Student Progress
// ============================================================
export type ProgressStatus = 'locked' | 'unlocked' | 'in_progress' | 'passed'

export interface StudentProgress {
  id: string
  student_id: string
  lesson_id: string
  status: ProgressStatus
  stars_earned: number
  passed_at: string | null
  attempt_count: number
  created_at: string
  updated_at: string
}

export interface StudentProgressInsert {
  student_id: string
  lesson_id: string
  status?: ProgressStatus
  stars_earned?: number
}

export interface StudentProgressUpdate {
  status?: ProgressStatus
  stars_earned?: number
  passed_at?: string | null
  attempt_count?: number
}

// ============================================================
// Boss Progress
// ============================================================
export type BossStatus = 'locked' | 'available' | 'passed'

export interface BossProgress {
  id: string
  student_id: string
  chapter_id: string
  status: BossStatus
  stars_earned: number
  passed_at: string | null
  attempt_count: number
  created_at: string
  updated_at: string
}

export interface BossProgressInsert {
  student_id: string
  chapter_id: string
  status?: BossStatus
}

export interface BossProgressUpdate {
  status?: BossStatus
  stars_earned?: number
  passed_at?: string | null
  attempt_count?: number
}

// ============================================================
// Test Sessions (Gate / Boss)
// ============================================================
export interface GateTestSession {
  id: string
  student_id: string
  lesson_id: string
  status: 'in_progress' | 'passed' | 'failed' | 'locked'
  questions_asked: number
  consecutive_correct: number
  total_correct: number
  total_wrong: number
  score_percentage: number | null
  stars_earned: number
  locked_until: string | null
  started_at: string
  completed_at: string | null
}

export interface GateTestSessionInsert {
  student_id: string
  lesson_id: string
}

export interface GateTestSessionUpdate {
  status?: 'in_progress' | 'passed' | 'failed' | 'locked'
  questions_asked?: number
  consecutive_correct?: number
  total_correct?: number
  total_wrong?: number
  score_percentage?: number | null
  stars_earned?: number
  locked_until?: string | null
  completed_at?: string | null
}

export interface GateTestAnswer {
  id: string
  session_id: string
  question_id: string
  selected_option_id: string | null
  is_correct: boolean
  answered_at: string
}

export interface GateTestAnswerInsert {
  session_id: string
  question_id: string
  selected_option_id?: string
  is_correct: boolean
}

export interface GateTestAnswerUpdate {
  selected_option_id?: string | null
  is_correct?: boolean
}

export interface BossTestSession {
  id: string
  student_id: string
  chapter_id: string
  status: 'in_progress' | 'passed' | 'failed' | 'locked'
  questions_asked: number
  consecutive_correct: number
  total_correct: number
  total_wrong: number
  score_percentage: number | null
  stars_earned: number
  locked_until: string | null
  started_at: string
  completed_at: string | null
}

export interface BossTestSessionInsert {
  student_id: string
  chapter_id: string
}

export interface BossTestSessionUpdate {
  status?: 'in_progress' | 'passed' | 'failed' | 'locked'
  questions_asked?: number
  consecutive_correct?: number
  total_correct?: number
  total_wrong?: number
  score_percentage?: number | null
  stars_earned?: number
  locked_until?: string | null
  completed_at?: string | null
}

export interface BossTestAnswer {
  id: string
  session_id: string
  question_id: string
  selected_option_id: string | null
  is_correct: boolean
  answered_at: string
}

export interface BossTestAnswerInsert {
  session_id: string
  question_id: string
  selected_option_id?: string
  is_correct: boolean
}

export interface BossTestAnswerUpdate {
  selected_option_id?: string | null
  is_correct?: boolean
}

// ============================================================
// Wrong Question Book
// ============================================================
export interface WrongQuestionBook {
  id: string
  student_id: string
  question_id: string
  chapter_id: string
  last_wrong_at: string
  wrong_count: number
  is_resolved: boolean
  created_at: string
  updated_at: string
}

export interface WrongQuestionBookInsert {
  student_id: string
  question_id: string
  chapter_id: string
}

export interface WrongQuestionBookUpdate {
  is_resolved?: boolean
}

// ============================================================
// AI Generation Log
// ============================================================
export interface AIGenerationLog {
  id: string
  teacher_id: string
  chapter_id: string | null
  lesson_id: string | null
  input_text: string | null
  prompt_tokens: number | null
  completion_tokens: number | null
  generated_json: any
  status: 'pending' | 'completed' | 'failed'
  error_message: string | null
  created_at: string
}

export interface AIGenerationLogInsert {
  teacher_id: string
  chapter_id?: string
  lesson_id?: string
  input_text?: string
}

export interface AIGenerationLogUpdate {
  prompt_tokens?: number | null
  completion_tokens?: number | null
  generated_json?: any
  status?: 'pending' | 'completed' | 'failed'
  error_message?: string | null
}

// ============================================================
// Daily Activity
// ============================================================
export interface DailyActivity {
  id: string
  student_id: string
  activity_date: string
  gate_tests_attempted: number
  gate_tests_passed: number
  questions_answered: number
  time_spent_seconds: number
}

export interface DailyActivityInsert {
  student_id: string
  activity_date?: string
  gate_tests_attempted?: number
  gate_tests_passed?: number
  questions_answered?: number
  time_spent_seconds?: number
}

export interface DailyActivityUpdate {
  gate_tests_attempted?: number
  gate_tests_passed?: number
  questions_answered?: number
  time_spent_seconds?: number
}

// ============================================================
// Vocab (背单词)
// ============================================================
export type VocabResult = 'known' | 'fuzzy' | 'unknown'

// 三档掌握优先级：必须会拼会解释 / 认得并理解 / 见过即可
export const VOCAB_DIFFICULTIES = ['核心必背', '重要理解', '拓展阅读'] as const
export type VocabDifficulty = typeof VOCAB_DIFFICULTIES[number]

// Accepts the labels, or the legacy 1/2/3 numbers from older AI output.
export function normaliseDifficulty(v: unknown): VocabDifficulty {
  if (typeof v === 'string' && (VOCAB_DIFFICULTIES as readonly string[]).includes(v)) return v as VocabDifficulty
  const n = Number(v)
  if (n === 1) return '核心必背'
  if (n === 3) return '拓展阅读'
  return '重要理解'
}

export interface VocabWord {
  id: string
  lesson_id: string
  term: string
  ipa: string | null
  pos: string | null
  zh: string
  en_def: string | null
  example_en: string | null
  example_zh: string | null
  image_url: string | null
  note: string | null
  difficulty: VocabDifficulty
  sort_order: number
  created_at: string
  updated_at: string
}

export interface VocabWordInsert {
  lesson_id: string
  term: string
  zh: string
  ipa?: string | null
  pos?: string | null
  en_def?: string | null
  example_en?: string | null
  example_zh?: string | null
  image_url?: string | null
  note?: string | null
  difficulty?: VocabDifficulty
  sort_order?: number
}

export type VocabWordUpdate = Partial<Omit<VocabWordInsert, 'lesson_id'>>

// SRS state for one student × one word. Mastery is derived from `box`
// (box >= 3), never from `last_result`.
export interface VocabProgress {
  id: string
  student_id: string
  word_id: string
  last_result: VocabResult | null
  box: number
  due_at: string
  correct_count: number
  wrong_count: number
  last_seen_at: string | null
  updated_at: string
}

export interface VocabProgressInsert {
  student_id: string
  word_id: string
  last_result?: VocabResult
  box?: number
  due_at?: string
}

export interface VocabProgressUpdate {
  last_result?: VocabResult | null
  box?: number
  due_at?: string
  correct_count?: number
  wrong_count?: number
  last_seen_at?: string | null
}

export interface VocabWordWithProgress extends VocabWord {
  progress: Pick<VocabProgress, 'last_result' | 'box' | 'due_at'> | null
}

// ============================================================
// UI Helper Types
// ============================================================
export interface LessonWithProgress extends Lesson {
  progress: StudentProgress | null
  isUnlocked: boolean
  isPassed: boolean
}

export interface ChapterWithLessons extends Chapter {
  lessons: LessonWithProgress[]
  bossProgress: BossProgress | null
  isBossAvailable: boolean
  isBossPassed: boolean
}

export interface CourseWithProgress extends Course {
  chapters: ChapterWithLessons[]
  totalLessons: number
  passedLessons: number
  progressPercent: number
}

export interface QuestionWithOptions extends Question {
  options: QuestionOption[]
}

export interface GateTestState {
  sessionId: string
  status: 'in_progress' | 'passed' | 'failed' | 'locked'
  currentQuestion: QuestionWithOptions | null
  isAnswered: boolean
  isCorrect: boolean | null
  correctOptionId: string | null
  explanation: string | null
  stats: {
    questionsAsked: number
    consecutiveCorrect: number
    totalCorrect: number
    totalWrong: number
  }
  lockedUntil: string | null
  result: { passed: boolean; stars: number } | null
}

// ============================================================
// Mock exam (模拟考) — a paper of full-suite questions taken under a timer
// ============================================================
export interface MockPaper {
  id: string
  mock_course_id: string
  title: string
  duration_minutes: number
  sort_order: number
  created_at: string
  updated_at: string
}

export interface MockPaperInsert {
  mock_course_id: string
  title: string
  duration_minutes?: number
  sort_order?: number
}

export type MockPaperUpdate = Partial<Omit<MockPaperInsert, 'mock_course_id'>>

// Ordered membership of a question in a paper. The question itself lives in
// `questions` with question_type='mock'.
export interface MockPaperQuestion {
  id: string
  paper_id: string
  question_id: string
  sort_order: number
  created_at: string
}

export type MockSessionStatus = 'in_progress' | 'submitted'
export type MockSubmitReason = 'manual' | 'timeout'

export interface MockTestSession {
  id: string
  student_id: string
  paper_id: string
  status: MockSessionStatus
  submit_reason: MockSubmitReason | null
  duration_seconds: number
  started_at: string
  expires_at: string
  submitted_at: string | null
  total_questions: number
  total_correct: number
  total_wrong: number
  score_percentage: number | null
}

// One row per question of the paper, pre-inserted at start — so this table is
// also the paper snapshot used for resume.
export interface MockTestAnswer {
  id: string
  session_id: string
  question_id: string
  sort_order: number
  selected_option_id: string | null
  answer_text: string | null      // what the student wrote, for 'short'
  feedback: string | null         // AI's comment on a 'short' answer
  is_correct: boolean
  answered_at: string | null
}

// The review payload handed to the student after submitting (and on a
// post-submit refresh). Correct answers appear here only, never while
// a session is in_progress.
export interface MockReviewQuestion {
  questionId: string
  sortOrder: number
  stem: string
  imageUrl: string | null
  explanation: string
  chapterId: string | null
  chapterTitle: string | null
  lessonId: string
  lessonTitle: string | null
  lessonRef: string | null
  options: { id: string; content: string }[]
  selectedOptionId: string | null
  correctOptionId: string | null
  isCorrect: boolean
  // True when this question was already answered correctly in an earlier sitting,
  // so this retest did not ask it again.
  notInThisSession: boolean
  // The student marked this one during the exam ("not sure, come back to it").
  flagged: boolean
  // Across every attempt at this paper: which attempt first got it right, how
  // many times it was asked, and how many times it was missed.
  askedTimes: number
  wrongTimes: number
  firstCorrectAttempt: number | null
}

export interface MockReviewAttempt {
  n: number
  sessionId: string
  mode: 'full' | 'retry'
  // that sitting
  correctInAttempt: number
  totalInAttempt: number
  ownPercentage: number
  // running mastery across this and every earlier attempt
  cumulativeCorrect: number
  cumulativePercentage: number
  submittedAt: string | null
  submitReason: MockSubmitReason | null
}

export interface MockReview {
  sessionId: string
  paperId: string
  paperTitle: string
  /** Cumulative: how much of the whole paper has been answered correctly by now. */
  score: {
    total: number
    correct: number
    wrong: number
    unanswered: number
    percentage: number
  }
  /** Every sitting, oldest first — the score box lists these. */
  attempts: MockReviewAttempt[]
  sessionMode: 'full' | 'retry'
  durationSeconds: number
  usedSeconds: number
  submittedAt: string | null
  submitReason: MockSubmitReason | null
  questions: MockReviewQuestion[]
}
