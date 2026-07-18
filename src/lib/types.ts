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
  sort_order: number
  created_at: string
}

export interface VideoLinkInsert {
  knowledge_point_id: string
  title: string
  url: string
  platform?: string
  sort_order?: number
}

export interface VideoLinkUpdate {
  title?: string
  url?: string
  platform?: string
  sort_order?: number
}

// ============================================================
// Question
// ============================================================
export type QuestionType = 'gate_test' | 'boss_test'

export interface Question {
  id: string
  knowledge_point_id: string | null
  lesson_id: string
  question_type: QuestionType
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
