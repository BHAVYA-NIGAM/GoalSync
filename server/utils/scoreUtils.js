const getScoreFromGoal = (goal, achievement, completedDate) => {
  const target = Number(goal.target || 0);
  const actual = Number(achievement || 0);

  if (!target && goal.uom !== "Zero-based") {
    return 0;
  }

  switch (goal.uom) {
    case "Numeric Min":
    case "Percentage Min":
      return Math.min((actual / target) * 100, 100);
    case "Numeric Max":
    case "Percentage Max":
      if (actual === 0) {
        return 100;
      }
      return Math.min((target / actual) * 100, 100);
    case "Timeline": {
      if (!goal.deadline || !completedDate) {
        return 0;
      }
      const deadline = new Date(goal.deadline);
      const doneAt = new Date(completedDate);
      return doneAt <= deadline ? 100 : 60;
    }
    case "Zero-based":
      return actual === 0 ? 100 : 0;
    default:
      return 0;
  }
};

module.exports = { getScoreFromGoal };
