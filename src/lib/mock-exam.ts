// Mock exam (模拟考) shared constants and helpers.

// A mock question lives in the `questions` table with question_type='mock', and
// its lesson_id points at a lesson of the paper's bound gate course. That is
// what gives each question its chapter/lesson label for free — but it also means
// the rows sit on gate lessons, so EVERY gate-facing read must exclude them,
// otherwise mock questions show up in the teacher's question bank or get carried
// along by "empty this lesson" / "copy this lesson".
export const NOT_MOCK = '&question_type=neq.mock'

// Answers that arrive up to this many seconds after the deadline still count, so
// an answer queued on a flaky connection is not lost when it finally flushes.
// Too large a window would let a student who went offline keep answering.
export const GRACE_SECONDS = 30
