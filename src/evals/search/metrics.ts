export type RelevanceJudgment = Record<string, number>;

export type SearchBenchmarkCase = {
  id: string;
  query: string;
  language: "en" | "fr";
  relevance: RelevanceJudgment;
  hardBlocked?: string[];
  tags?: string[];
};

export type SearchCaseMetrics = {
  id: string;
  precisionAtK: number;
  recallAtK: number;
  reciprocalRank: number;
  ndcgAtK: number;
  hardFailLeakage: number;
};

const relevant = (grade: number | undefined) => (grade ?? 0) > 0;

export function evaluateSearchCase(
  testCase: SearchBenchmarkCase,
  rankedGrantIds: string[],
  k = 10,
): SearchCaseMetrics {
  const top = rankedGrantIds.slice(0, k);
  const relevantTotal = Object.values(testCase.relevance).filter(relevant).length;
  const relevantRetrieved = top.filter((id) => relevant(testCase.relevance[id])).length;
  const firstRelevantIndex = rankedGrantIds.findIndex((id) => relevant(testCase.relevance[id]));
  const dcg = top.reduce((sum, id, index) => {
    const grade = testCase.relevance[id] ?? 0;
    return sum + (2 ** grade - 1) / Math.log2(index + 2);
  }, 0);
  const idealGrades = Object.values(testCase.relevance)
    .sort((a, b) => b - a)
    .slice(0, k);
  const idealDcg = idealGrades.reduce(
    (sum, grade, index) => sum + (2 ** grade - 1) / Math.log2(index + 2),
    0,
  );
  const blocked = new Set(testCase.hardBlocked ?? []);
  const blockedInTop = top.filter((id) => blocked.has(id)).length;

  return {
    id: testCase.id,
    precisionAtK:
      relevantTotal === 0
        ? top.length === 0
          ? 1
          : 0
        : top.length === 0
          ? 0
          : relevantRetrieved / top.length,
    recallAtK: relevantTotal === 0 ? 1 : relevantRetrieved / relevantTotal,
    reciprocalRank: firstRelevantIndex < 0 ? 0 : 1 / (firstRelevantIndex + 1),
    ndcgAtK: idealDcg === 0 ? 1 : dcg / idealDcg,
    hardFailLeakage: blockedInTop,
  };
}

export function summarizeSearchBenchmark(rows: SearchCaseMetrics[]) {
  const mean = (key: keyof Omit<SearchCaseMetrics, "id">) =>
    rows.length === 0 ? 0 : rows.reduce((sum, row) => sum + row[key], 0) / rows.length;
  return {
    cases: rows.length,
    precisionAtK: mean("precisionAtK"),
    recallAtK: mean("recallAtK"),
    mrr: mean("reciprocalRank"),
    ndcgAtK: mean("ndcgAtK"),
    hardFailLeakage: rows.reduce((sum, row) => sum + row.hardFailLeakage, 0),
  };
}
