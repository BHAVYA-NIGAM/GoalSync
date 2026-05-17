const Goal = require("../models/Goal");
const User = require("../models/User");
const logAudit = require("../utils/auditLogger");
const { getCycleWindow } = require("../utils/windowUtils");

const getTeamGoals = async (req, res) => {
  const teamMembers = await User.find({
    department: req.user.department,
    role: "Employee"
  }).select("_id name email department");
  const memberIds = teamMembers.map((member) => member._id);
  const goals = await Goal.find({ ownerId: { $in: memberIds } })
    .populate("ownerId", "name email department")
    .populate("managerId", "name email department")
    .sort({ createdAt: -1 });

  const pendingApprovals = goals.filter((goal) => goal.status === "Submitted").length;
  const completedCheckins = goals.filter((goal) => goal.checkins.length > 0).length;

  res.json({
    teamMembers,
    goals,
    summary: {
      totalGoals: goals.length,
      pendingApprovals,
      completedCheckins
    }
  });
};

const addManagerComment = async (req, res) => {
  const goal = await Goal.findById(req.params.id).populate("ownerId", "department");

  if (!goal) {
    return res.status(404).json({ message: "Goal not found" });
  }

  if (goal.ownerId?.department && goal.ownerId.department !== req.user.department) {
    return res.status(403).json({ message: "You can only comment on goals from your department" });
  }

  goal.managerComment = req.body.comment || "";
  await goal.save();

  await logAudit(req.user._id, "MANAGER_COMMENT_ADDED", null, {
    goalId: goal._id,
    comment: goal.managerComment
  });

  res.json({ message: "Comment added successfully", goal });
};

const addCheckinComment = async (req, res) => {
  const goal = await Goal.findById(req.params.id).populate("ownerId", "name department");

  if (!goal) {
    return res.status(404).json({ message: "Goal not found" });
  }

  if (goal.ownerId?.department !== req.user.department) {
    return res.status(403).json({ message: "You can only review goals from your department" });
  }

  const currentQuarter = getCycleWindow().key;
  const latestQuarter = ["Q4", "Q3", "Q2", "Q1"].find((quarter) =>
    goal.checkins.some((item) => item.quarter === quarter)
  );
  const quarterToUse = ["Q1", "Q2", "Q3", "Q4"].includes(currentQuarter) ? currentQuarter : latestQuarter;

  if (!quarterToUse) {
    return res.status(400).json({ message: "No employee check-in is available to review yet" });
  }

  const structuredComment = [
    `Discussion Summary: ${req.body.summary || ""}`,
    `Manager Feedback: ${req.body.comment || ""}`,
    `Next Steps: ${req.body.nextStep || ""}`
  ].join("\n");

  const checkinIndex = goal.checkins.findIndex((item) => item.quarter === quarterToUse);

  if (checkinIndex === -1) {
    goal.checkins.push({
      quarter: quarterToUse,
      achievement: goal.actuals,
      status: goal.progressStatus,
      comment: "",
      managerComment: structuredComment,
      score: goal.progressScore,
      updatedAt: new Date()
    });
  } else {
    goal.checkins[checkinIndex].managerComment = structuredComment;
    goal.checkins[checkinIndex].updatedAt = new Date();
  }

  goal.managerComment = structuredComment;
  await goal.save();

  await logAudit(req.user._id, "MANAGER_CHECKIN_COMMENT_ADDED", null, {
    goalId: goal._id,
    employee: goal.ownerId?.name || "",
    quarter: quarterToUse,
    comment: structuredComment
  });

  res.json({ message: "Check-in feedback saved successfully", goal });
};

module.exports = { getTeamGoals, addManagerComment, addCheckinComment };
