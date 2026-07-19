'use client'

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'

const translations: Record<string, Record<string, string>> = {
  // Navbar & Common
  dashboard: { zh: '仪表盘', en: 'Dashboard' },
  wrongBook: { zh: '错题本', en: 'Wrong Book' },
  courseMgmt: { zh: '课程管理', en: 'Courses' },
  questionBank: { zh: '题库', en: 'Q-Bank' },
  classes: { zh: '班级', en: 'Classes' },
  userMgmt: { zh: '用户管理', en: 'Users' },
  settings: { zh: '设置', en: 'Settings' },
  signOut: { zh: '退出登录', en: 'Sign Out' },
  teacher: { zh: '教师', en: 'Teacher' },
  student: { zh: '学生', en: 'Student' },
  admin: { zh: '管理员', en: 'Admin' },
  login: { zh: '登录', en: 'Login' },
  signup: { zh: '注册', en: 'Sign Up' },
  startNow: { zh: '立即开始', en: 'Start Now' },
  loading: { zh: '加载中...', en: 'Loading...' },
  save: { zh: '保存', en: 'Save' },
  cancel: { zh: '取消', en: 'Cancel' },
  confirm: { zh: '确认', en: 'Confirm' },
  delete: { zh: '删除', en: 'Delete' },
  edit: { zh: '编辑', en: 'Edit' },
  add: { zh: '添加', en: 'Add' },
  close: { zh: '关闭', en: 'Close' },
  back: { zh: '返回', en: 'Back' },
  submit: { zh: '提交', en: 'Submit' },
  retry: { zh: '重试', en: 'Retry' },

  // Login page
  loginTitle: { zh: '登录', en: 'Login' },
  loginSub: { zh: '自主通关学习平台', en: 'Mastery Learning Platform' },
  loginBtn: { zh: '登录', en: 'Log In' },
  signupBtn: { zh: '注册', en: 'Sign Up' },
  forgotPassword: { zh: '忘记密码？', en: 'Forgot Password?' },
  email: { zh: '邮箱', en: 'Email' },
  password: { zh: '密码（至少6位）', en: 'Password (min 6 chars)' },
  yourName: { zh: '你的姓名', en: 'Your Name' },
  iAmStudent: { zh: '我是学生', en: "I'm a Student" },
  iAmTeacher: { zh: '我是老师', en: "I'm a Teacher" },
  teacherCode: { zh: '教师邀请码（向管理员索取）', en: 'Teacher Invite Code' },
  registering: { zh: '处理中...', en: 'Processing...' },
  registerSuccess: { zh: '注册成功，请登录', en: 'Registration successful, please log in' },
  wrongCode: { zh: '教师邀请码不正确', en: 'Incorrect teacher invite code' },
  resetTitle: { zh: '找回密码', en: 'Reset Password' },
  resetDesc: { zh: '输入注册邮箱，我们会发送重置链接', en: 'Enter your email, we will send a reset link' },
  sendReset: { zh: '发送重置邮件', en: 'Send Reset Email' },
  sending: { zh: '发送中...', en: 'Sending...' },
  backToLogin: { zh: '← 返回登录', en: '← Back to Login' },
  resetSent: { zh: '密码重置邮件已发送，请检查邮箱（含垃圾箱）', en: 'Reset email sent. Check your inbox (and spam).' },
  setPassword: { zh: '设置新密码', en: 'Set New Password' },
  newPassword: { zh: '新密码（至少6位）', en: 'New Password (min 6)' },
  confirmPassword: { zh: '确认新密码', en: 'Confirm New Password' },
  resetSuccess: { zh: '密码重置成功！请用新密码登录', en: 'Password reset! Please log in with your new password' },

  // Dashboard
  teacherDashboard: { zh: '教师工作台', en: 'Teacher Workspace' },
  manageCourses: { zh: '管理课程、题库和班级', en: 'Manage courses, questions, and classes' },
  studentDashboard: { zh: '继续你的闯关之旅', en: 'Continue your mastery journey' },
  overallProgress: { zh: '总体进度', en: 'Overall Progress' },
  lessons: { zh: '课时', en: 'Lessons' },
  joinClass: { zh: '加入班级', en: 'Join Class' },
  joinBtn: { zh: '加入班级', en: 'Join' },
  joinPlaceholder: { zh: '输入班级邀请码', en: 'Enter class invite code' },
  joinSuccess: { zh: '✅ 加入成功！', en: '✓ Joined!' },
  myClasses: { zh: '我的班级', en: 'My Classes' },
  myFavorites: { zh: '⭐ 我的收藏', en: '⭐ My Favorites' },
  chooseSubject: { zh: '选择学科', en: 'Choose a Subject' },
  noCourses: { zh: '还没有课程', en: 'No courses yet' },
  noCoursesHint: { zh: '创建第一门课程吧', en: 'Create your first course' },
  noCourseStudent: { zh: '暂无可用课程', en: 'No courses available' },
  noCourseStudentHint: { zh: '请联系老师添加课程', en: 'Contact your teacher' },
  createCourse: { zh: '创建课程', en: 'Create Course' },
  loadError: { zh: '加载失败', en: 'Load Failed' },
  reload: { zh: '重新加载', en: 'Reload' },
  published: { zh: '已发布', en: 'Published' },
  unpublished: { zh: '未发布', en: 'Unpublished' },

  // Course page
  backToCourses: { zh: '返回课程列表', en: 'Back to Courses' },
  courseNotFound: { zh: '课程不存在', en: 'Course not found' },
  chaptersFinished: { zh: '章节通关后解锁', en: 'Complete chapter to unlock' },
  passed: { zh: '已通过', en: 'Passed' },
  retestBtn: { zh: '重新测试（不影响通关状态）', en: 'Retest (won\'t affect pass status)' },

  // Lesson hub
  knowledgeTree: { zh: '知识树', en: 'Knowledge Tree' },
  gateTest: { zh: '关卡测试', en: 'Gate Test' },
  locked: { zh: '锁定', en: 'Locked' },
  unlockHint: { zh: '完成上一课时解锁', en: 'Complete previous lesson to unlock' },
  passRules: { zh: '连续答对7题或正确率≥90%通关，累计答错3题锁定10分钟', en: '7 correct in a row or ≥90% to pass. 3 wrong = 10min lock' },
  knowledgePoints: { zh: '知识点 ▸', en: 'KP ▸' },

  // Gate test
  gateTestLocked: { zh: '测试已锁定', en: 'Test Locked' },
  minutesRemaining: { zh: '分钟后可重试', en: 'min remaining' },
  noQuestions: { zh: '没有可用的关卡测试题目', en: 'No test questions available' },
  questionNum: { zh: '第', en: 'Q' },
  questionNumOf: { zh: '题', en: '' },
  correctAnswer: { zh: '正确答案', en: 'Correct Answer' },
  nextQuestion: { zh: '下一题', en: 'Next' },
  continueBtn: { zh: '继续', en: 'Continue' },
  correct: { zh: '✓ 正确！', en: '✓ Correct!' },
  testPassed: { zh: '通关成功！', en: 'Passed!' },
  testFailed: { zh: '测试失败', en: 'Failed' },
  wrongCount: { zh: '答错', en: 'Wrong:' },
  totalWrong3: { zh: '题，累计答错3题', en: 'questions, 3 total wrong' },
  cooldown: { zh: '冷却 10 分钟', en: '10-min Cooldown' },
  cooldownHint: { zh: '建议去知识树查看视频链接学习，或请教老师同学', en: 'Review the knowledge tree or ask for help' },
  reviewTest: { zh: '这是复习测试，不影响已通过状态', en: 'Review test, pass status unchanged' },
  backToLesson: { zh: '返回课时', en: 'Back to Lesson' },
  quitConfirm: { zh: '确定退出测试吗？本次测试将作废，不记录成绩。', en: 'Quit test? Progress will be lost.' },

  // AI generate KP
  aiGenerateKp: { zh: '🧠 AI 生成知识点', en: '🧠 AI Generate KP' },
  aiGenerating: { zh: 'AI 生成中...', en: 'AI Generating...' },
  kpSummary: { zh: '知识点总结', en: 'Knowledge Point Summary' },

  // Wrong book
  wrongBookTitle: { zh: '错题本', en: 'Wrong Question Book' },
  wrongBookDesc: { zh: '个性化错题汇总，按课程-章节分类，方便复习', en: 'Personalized wrong questions by chapter' },
  wrongRetest: { zh: '🎯 错题重测', en: '🎯 Wrong Q Retest' },
  exportPdf: { zh: '导出 PDF / 打印', en: 'Export PDF / Print' },
  allCourses: { zh: '全部课程', en: 'All Courses' },
  allChapters: { zh: '全部章节', en: 'All Chapters' },
  showMastered: { zh: '显示已掌握', en: 'Show Mastered' },
  repeatedWrong: { zh: '🌶️ 反复错误', en: '🌶️ Repeated' },
  mastered: { zh: '✓ 已掌握', en: '✓ Mastered' },
  resolution: { zh: '解析：', en: 'Explanation: ' },
  wrongTimes: { zh: '答错', en: 'Wrong' },
  times: { zh: '次', en: 'x' },
  recently: { zh: '最近：', en: 'Recently: ' },
  lessonLabel: { zh: '课时：', en: 'Lesson: ' },
  emptyWrongBook: { zh: '错题本为空', en: 'Wrong book is empty' },
  noWrongYet: { zh: '还没有错题记录', en: 'No wrong answers yet' },

  // Wrong retest
  wrongRetestTitle: { zh: '错题重测', en: 'Wrong Q Retest' },
  backToWrongBook: { zh: '返回错题本', en: 'Back to Wrong Book' },
  noUnresolved: { zh: '没有待重测的错题', en: 'No unresolved wrong questions' },
  allMastered: { zh: '所有错题已掌握', en: 'All wrong questions mastered' },
  retestComplete: { zh: '错题重测完成', en: 'Retest Complete' },
  retestCorrect: { zh: '✓ 已掌握', en: '✓ Mastered' },
  retestRepeated: { zh: '🌶️ 反复错误', en: '🌶️ Repeated Error' },
  anotherRound: { zh: '再来一轮', en: 'Another Round' },

  // Teacher pages
  newCourse: { zh: '新建课程', en: 'New Course' },
  courseName: { zh: '课程名称（必填）', en: 'Course Name (required)' },
  gradeLevel: { zh: '年级/级别（如 G10-H, AP）', en: 'Grade Level (e.g. G10-H, AP)' },
  courseDesc: { zh: '课程描述', en: 'Course Description' },
  selectSubject: { zh: '选择学科（必选）', en: 'Select Subject (required)' },
  newChapter: { zh: '新章节名称', en: 'New Chapter Name' },
  newLesson: { zh: '新课名称', en: 'New Lesson Name' },
  batchImport: { zh: '📄 批量导入', en: '📄 Batch Import' },
  importChapter: { zh: '📥 导入章节', en: '📥 Import Chapter' },
  chaptersAndLessons: { zh: '章节与课时', en: 'Chapters & Lessons' },
  chaptersCount: { zh: '章', en: 'chapters' },
  kpManagement: { zh: '知识点管理', en: 'KP Management' },
  editKp: { zh: '编辑知识点', en: 'Edit KP' },
  kpName: { zh: '知识点名称', en: 'KP Name' },
  kpDesc: { zh: '详细描述（Markdown / Ctrl+V 贴图）', en: 'Description (Markdown / Ctrl+V paste image)' },
  pdfLink: { zh: 'PDF 链接', en: 'PDF Link' },
  pdfTitle: { zh: '标题（如：课程讲义）', en: 'Title (e.g. Lecture Notes)' },
  videoLink: { zh: '视频链接', en: 'Video Link' },
  videoTitle: { zh: '标题', en: 'Title' },
  videoPlaceholder: { zh: 'B站/YouTube链接', en: 'Bilibili/YouTube URL' },
  addKp: { zh: '+ 知识点', en: '+ KP' },
  addLesson: { zh: '+ 课时', en: '+ Lesson' },
  done: { zh: '完成', en: 'Done' },
  rename: { zh: '重命名', en: 'Rename' },
  moveUp: { zh: '上移', en: 'Move Up' },
  moveDown: { zh: '下移', en: 'Move Down' },
  preview: { zh: '学生端预览', en: 'Student Preview' },
  noDescription: { zh: '暂无描述', en: 'No description' },
  unnamed: { zh: '未命名', en: 'Unnamed' },
  newKpPlaceholder: { zh: '新知识点名称', en: 'New KP name' },
  aiGenQuestions: { zh: '🤖 AI 生成题目', en: '🤖 AI Generate Qs' },
  importQuestions: { zh: '📄 导入题目', en: '📄 Import Qs' },

  // Subjects
  subjects: {
    Chinese: { zh: '语文', en: 'Chinese' },
    Math: { zh: '数学', en: 'Math' },
    English: { zh: '英语', en: 'English' },
    'Second foreign Language': { zh: '二外', en: '2nd Language' },
    Physics: { zh: '物理', en: 'Physics' },
    Chemistry: { zh: '化学', en: 'Chemistry' },
    Biology: { zh: '生物', en: 'Biology' },
    Humanities: { zh: '人文', en: 'Humanities' },
  },
}

export type Lang = 'zh' | 'en'
export function t(key: string, lang: Lang): string {
  return translations[key]?.[lang] || key
}

const LangContext = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({ lang: 'zh', setLang: () => {} })

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>('zh')

  useEffect(() => {
    const saved = localStorage.getItem('selfpass-lang') as Lang | null
    if (saved === 'zh' || saved === 'en') setLangState(saved)
  }, [])

  const setLang = (l: Lang) => {
    setLangState(l)
    localStorage.setItem('selfpass-lang', l)
  }

  return <LangContext.Provider value={{ lang, setLang }}>{children}</LangContext.Provider>
}

export function useLang() {
  return useContext(LangContext)
}

// Export subject name helper
export function subjectName(key: string, lang: Lang): string {
  return translations.subjects?.[key]?.[lang] || key
}
