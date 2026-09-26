import type { QuizDefinitionQuestion } from "./config";

export const defaultQuizTitle = "你真的了解我们吗？";

export const defaultQuizQuestions: QuizDefinitionQuestion[] = [
  { prompt: "新娘的名字是？", options: ["邓廷月", "邓婷月", "邓婷日", "邓月"], correctOption: null },
  { prompt: "新郎的名字是？", options: ["帅博闻", "师博文", "帅博文", "丑博闻"], correctOption: null },
  { prompt: "两人在一起多少年了？", options: ["3 年", "5 年", "6 年", "7 年以上"], correctOption: null },
  { prompt: "新郎新娘是什么阶段的同学？", options: ["初中", "高中", "大学", "博士"], correctOption: null },
  { prompt: "如果周末只能选择一件事，新人最可能选择什么？", options: ["骑车", "做饭", "打游戏", "看书"], correctOption: null },
  { prompt: "两个人是谁先主动的？", options: ["新郎", "新娘", "两个人一起", "到现在也没说清楚"], correctOption: null },
  { prompt: "两个人的领证时间距离哪个节气最近？", options: ["立夏", "小满", "芒种", "夏至"], correctOption: null },
];
