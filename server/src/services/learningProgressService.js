const isObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const isId = (value) =>
  typeof value === "string" && value.trim().length > 0 && value.length <= 64;
const isScore = (value) =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= 0 &&
  value <= 100;
const isDate = (value) =>
  value == null ||
  (typeof value === "string" && Number.isFinite(Date.parse(value)));
const unique = (values) => new Set(values).size === values.length;

export const QUIZ_PASS_THRESHOLD = 75;

export function readLearningModules(modules) {
  return modules.map((mod) => ({
    ...mod,
    sections: mod.sections.map((section) => {
      const attempts = section.quizAttempts || [];
      const bestScore = attempts.length
        ? Math.max(...attempts.map((attempt) => attempt.score))
        : (section.bestScore ?? null);
      return {
        ...section,
        quizAttempts: attempts.map((attempt) => ({
          ...attempt,
          passed: attempt.score >= QUIZ_PASS_THRESHOLD,
        })),
        bestScore,
        passed: attempts.length
          ? bestScore >= QUIZ_PASS_THRESHOLD
          : (section.passed ?? false),
      };
    }),
  }));
}

export function storeLearningModules(modules) {
  return modules.map((mod) => ({
    ...mod,
    sections: mod.sections.map((section) => {
      const stored = {
        ...section,
        quizAttempts: section.quizAttempts.map((attempt) => {
          const value = { ...attempt };
          delete value.passed;
          return value;
        }),
      };
      // Preserve summary-only historical progress until its history is understood.
      if (
        stored.quizAttempts.length ||
        (section.bestScore == null && !section.passed)
      ) {
        delete stored.bestScore;
        delete stored.passed;
      }
      return stored;
    }),
  }));
}

export function normalizeLearningInput(modules) {
  // Client summaries are not authoritative; derive them from submitted attempts.
  return readLearningModules(
    modules.map((mod) => ({
      ...mod,
      sections: mod.sections.map((section) => ({
        ...section,
        bestScore: null,
        passed: false,
      })),
    })),
  );
}

export function validLearningProgress(modules) {
  return (
    Array.isArray(modules) &&
    modules.length <= 100 &&
    modules.every(
      (mod) =>
        isObject(mod) &&
        isId(mod.moduleId) &&
        Array.isArray(mod.completedLessons) &&
        mod.completedLessons.length <= 500 &&
        mod.completedLessons.every(isId) &&
        unique(mod.completedLessons) &&
        isDate(mod.startedAt) &&
        isDate(mod.completedAt) &&
        Array.isArray(mod.sections) &&
        mod.sections.length <= 100 &&
        mod.sections.every(
          (section) =>
            isObject(section) &&
            Number.isInteger(section.sectionIndex) &&
            section.sectionIndex >= 0 &&
            (section.bestScore == null || isScore(section.bestScore)) &&
            (section.passed === undefined ||
              typeof section.passed === "boolean") &&
            Array.isArray(section.quizAttempts) &&
            section.quizAttempts.length <= 500 &&
            section.quizAttempts.every(
              (attempt) =>
                isObject(attempt) &&
                isScore(attempt.score) &&
                typeof attempt.passed === "boolean" &&
                isDate(attempt.attemptedAt),
            ),
        ) &&
        unique(mod.sections.map((section) => section.sectionIndex)),
    ) &&
    unique(modules.map((mod) => mod.moduleId))
  );
}
