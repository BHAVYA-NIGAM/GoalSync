const Goal = require("../models/Goal");
const User = require("../models/User");

const isWithinRange = (value, min, max) => {
  const num = Number(value);
  return !isNaN(num) && num >= min && num <= max;
};

const getEmployeeGoalCount = async (ownerId) => {
  return Goal.countDocuments({ ownerId });
};

const getActiveGoalWeightage = async (ownerId, ignoreId = null) => {
  const filter = {
    ownerId,
    status: { $in: ["Draft", "Submitted", "Approved", "Rework", "Completed"] }
  };

  if (ignoreId) {
    filter._id = { $ne: ignoreId };
  }

  const goals = await Goal.find(filter).select("weightage");
  return goals.reduce((sum, goal) => sum + Number(goal.weightage || 0), 0);
};

const validateGoalRules = async (goalData, ownerId, ignoreId = null) => {
  if (goalData.weightage !== undefined) {
    if (!isWithinRange(goalData.weightage, 0, 100)) {
      return "Weightage must be a number between 0% and 100%";
    }
    if (Number(goalData.weightage) < 10) {
      return "Minimum individual goal weightage is 10%";
    }
  }

  if (goalData.target !== undefined) {
    if (isNaN(Number(goalData.target)) || Number(goalData.target) < 0) {
      return "Target must be a valid number >= 0";
    }
  }

  const totalGoals = await getEmployeeGoalCount(ownerId);
  if (!ignoreId && totalGoals >= 8) {
    return "Maximum 8 goals are allowed per employee";
  }

  if (goalData.weightage !== undefined) {
    const usedWeightage = await getActiveGoalWeightage(ownerId, ignoreId);
    const totalWeightage = usedWeightage + Number(goalData.weightage || 0);

    if (totalWeightage > 100) {
      return `Weightage limit exceeded. Only ${Math.max(0, 100 - usedWeightage)}% is available.`;
    }
  }

  return null;
};

const enforceExactHundredPercent = async (ownerId, ignoreId, newWeightage) => {
  const usedWeightage = await getActiveGoalWeightage(ownerId, ignoreId);
  const totalWeightage = usedWeightage + Number(newWeightage || 0);

  if (totalWeightage !== 100) {
    return `Total employee weightage must equal exactly 100%. Current configuration sums to ${totalWeightage}%.`;
  }

  return null;
};

module.exports = {
  isWithinRange,
  getEmployeeGoalCount,
  getActiveGoalWeightage,
  validateGoalRules,
  enforceExactHundredPercent
};
