export function exportTrainingSummary(training = {}) {
  const totalRuns = training.totalRuns || 0;
  const victories = training.victories || 0;
  return {
    totalRuns,
    victories,
    winRate: totalRuns ? victories / totalRuns : 0,
    averageTime: totalRuns ? (training.totalTime || 0) / totalRuns : 0,
    recentRuns: (training.recentRuns || []).slice(-10),
    bestWeapons: rankedStats(training.weaponStats || {}),
    bestDifficulties: rankedStats(training.difficultyStats || {}),
    bestMatrix: rankedMatrix(training.matrix || {}, "best"),
    worstMatrix: rankedMatrix(training.matrix || {}, "worst"),
    profileStats: rankedStats(training.profileStats || {}),
    strategyStats: rankedStrategy(training.strategyStats || {}),
    deathWindows: (training.deathWindows || []).slice(-6),
    recentFailures: (training.recentRuns || []).filter((run) => !run.victory).slice(-6).map((run) => run.deathReason),
    nextRecommendation: recommendNext(training),
    adjustments: training.adjustments || {},
  };
}

function rankedStats(stats) {
  return Object.entries(stats)
    .map(([id, value]) => ({
      id,
      runs: value.runs || 0,
      wins: value.wins || 0,
      winRate: value.runs ? value.wins / value.runs : 0,
      averageTime: value.runs ? (value.time || 0) / value.runs : 0,
    }))
    .sort((a, b) => b.winRate - a.winRate || b.averageTime - a.averageTime)
    .slice(0, 8);
}

function rankedMatrix(matrix, mode) {
  return Object.entries(matrix)
    .map(([key, value]) => {
      const [profile, difficultyId, weaponId] = key.split("|");
      return {
        key,
        profile,
        difficultyId,
        weaponId,
        runs: value.runs || 0,
        wins: value.wins || 0,
        earlyDeaths: value.earlyDeaths || 0,
        winRate: value.runs ? (value.wins || 0) / value.runs : 0,
        averageWave: value.runs ? (value.survivalWaveTotal || 0) / value.runs : 0,
        averageTime: value.runs ? (value.totalTime || 0) / value.runs : 0,
      };
    })
    .filter((entry) => entry.runs > 0)
    .sort((a, b) => mode === "worst"
      ? b.earlyDeaths - a.earlyDeaths || a.winRate - b.winRate || a.averageWave - b.averageWave
      : b.winRate - a.winRate || b.averageWave - a.averageWave || b.averageTime - a.averageTime)
    .slice(0, 8);
}

function recommendNext(training) {
  const worst = rankedMatrix(training.matrix || {}, "worst")[0];
  const best = rankedMatrix(training.matrix || {}, "best")[0];
  return {
    learned: training.recommendations || null,
    avoid: worst ? { profile: worst.profile, difficultyId: worst.difficultyId, weaponId: worst.weaponId, reason: "matrix_early_deaths" } : null,
    prefer: best ? { profile: best.profile, difficultyId: best.difficultyId, weaponId: best.weaponId, reason: "matrix_best_result" } : null,
  };
}

function rankedStrategy(stats) {
  return Object.entries(stats)
    .map(([id, value]) => ({
      id,
      runs: value.runs || 0,
      wins: value.wins || 0,
      averageWave: value.runs ? (value.totalWave || 0) / value.runs : 0,
      averageRisk: value.runs ? (value.totalRisk || 0) / value.runs : 0,
    }))
    .sort((a, b) => b.runs - a.runs || b.averageRisk - a.averageRisk)
    .slice(0, 8);
}
