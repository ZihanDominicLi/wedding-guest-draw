export type QuizDefinitionQuestion = {
  prompt: string;
  options: unknown[];
  correctOption: number | null;
};

export function validateQuizDefinition(questions: QuizDefinitionQuestion[]): string[] {
  const errors: string[] = [];
  if (questions.length < 1 || questions.length > 10) errors.push("题目数量必须为 1-10 题");
  questions.forEach((question, index) => {
    if (!question.prompt.trim()) errors.push(`第 ${index + 1} 题题目不能为空`);
    if (question.options.length < 2 || question.options.length > 8) errors.push(`第 ${index + 1} 题需要 2-8 个选项`);
    if (question.correctOption !== null && (question.correctOption < 0 || question.correctOption >= question.options.length)) errors.push(`第 ${index + 1} 题正确答案无效`);
  });
  return errors;
}

export function validateQuizForPublish(questions: QuizDefinitionQuestion[]): void {
  const errors = validateQuizDefinition(questions);
  if (errors.length) throw new Error(errors[0]);
  const unanswered = questions.findIndex((question) => question.correctOption === null);
  if (unanswered >= 0) throw new Error(`第 ${unanswered + 1} 题还没有设置正确答案`);
}
