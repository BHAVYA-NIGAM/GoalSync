const { validationResult } = require("express-validator");
const Goal = require("../models/Goal");
const User = require("../models/User");
const Notification = require("../models/Notification");
const logAudit = require("../utils/auditLogger");
const { sendEmail, buildEmailTemplate, buildAppLink } = require("../utils/emailService");
const { sendTeamsNotification } = require("../utils/teamsService");
const { getScoreFromGoal } = require("../utils/scoreUtils");
const { canSubmitCheckin, getCycleWindow } = require("../utils/windowUtils");

const defaultEditAccess = () => ({
  status: "none",
  requestedByManagerId: null,
  requestedAt: null,
  requestComment: "",
  grantedByAdminId: null,
  grantedAt: null,
  expiresAt: null
});

const ensureEditAccess = (goal) => {
  if (!goal.editAccess) {
    goal.editAccess = defaultEditAccess();
  }

  return goal.editAccess;
};

const isEditAccessActiveForManager = (goal, user) => {
  const access = ensureEditAccess(goal);

  if (user.role !== "Manager") {
    return false;
  }
  const expiresAt = access.expiresAt ? new Date(access.expiresAt) : null;
  const isExpired = expiresAt ? expiresAt.getTime() <= Date.now() : true;

  return (
    access.status === "granted" &&
    !isExpired &&
    String(access.requestedByManagerId || "") === String(user._id)
  );
};

const normalizeEditAccess = (goal) => {
  ensureEditAccess(goal);

  const expiresAt = goal.editAccess.expiresAt ? new Date(goal.editAccess.expiresAt) : null;
  if (goal.editAccess.status === "granted" && expiresAt && expiresAt.getTime() <= Date.now()) {
    goal.editAccess.status = "expired";
  }

  return goal;
};

const buildGoalPageLink = (role, goalId) => {
  const page =
    role === "Manager"
      ? "manager-dashboard.html"
      : role === "Admin"
        ? "admin-dashboard.html"
        : role === "Employee"
          ? "goal-create.html"
          : "employee-dashboard.html";

  return `/public/pages/${page}?goalId=${goalId}&openGoal=true`;
};

const createGoalNotification = async ({ userId, title, message, type = "info", role, goalId }) => {
  await Notification.create({
    userId,
    title,
    message,
    type,
    link: goalId ? buildGoalPageLink(role, goalId) : "",
    entityType: goalId ? "goal" : "",
    entityId: goalId ? String(goalId) : ""
  });
};

const {
  isWithinRange,
  validateGoalRules,
  enforceExactHundredPercent
} = require("../services/GoalService");

const getGoals = async (req, res) => {
  let filter = {};

  if (req.user.role === "Employee") {
    filter = { ownerId: req.user._id };
  }

  if (req.user.role === "Manager") {
    const departmentUsers = await User.find({
      department: req.user.department,
      role: "Employee"
    }).select("_id");
    filter = { ownerId: { $in: departmentUsers.map((user) => user._id) } };
  }

  const goals = await Goal.find(filter)
    .populate("ownerId", "name email department")
    .populate("managerId", "name email department")
    .sort({ createdAt: -1 });

  goals.forEach((goal) => normalizeEditAccess(goal));

  res.json({
    goals,
    currentWindow: getCycleWindow()
  });
};

const getGoalDetails = async (req, res) => {
  const goal = await Goal.findById(req.params.id)
    .populate("ownerId", "name email department")
    .populate("managerId", "name email department")
    .populate("editAccess.requestedByManagerId", "name email")
    .populate("editAccess.grantedByAdminId", "name email");

  if (!goal) {
    return res.status(404).json({ message: "Goal not found" });
  }

  normalizeEditAccess(goal);

  if (req.user.role === "Employee" && String(goal.ownerId._id) !== String(req.user._id)) {
    return res.status(403).json({ message: "You can only view your own goals" });
  }

  if (req.user.role === "Manager" && goal.ownerId?.department !== req.user.department) {
    return res.status(403).json({ message: "You can only view goals from your department" });
  }

  const relatedOwnerId = goal.primaryOwnerId || goal.ownerId._id;
  const assignedEmployees = await Goal.find({
    title: goal.title,
    $or: [
      { primaryOwnerId: relatedOwnerId },
      { ownerId: relatedOwnerId },
      { _id: goal._id }
    ]
  })
    .populate("ownerId", "name department")
    .select("ownerId status weightage actuals progressStatus sharedGoal");

  res.json({
    goal,
    assignedEmployees: assignedEmployees.map((item) => ({
      employeeName: item.ownerId?.name || "",
      department: item.ownerId?.department || "",
      weightage: item.weightage,
      status: item.status,
      actuals: item.actuals,
      progressStatus: item.progressStatus,
      sharedGoal: item.sharedGoal
    }))
  });
};

const createGoal = async (req, res) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const ownerId = req.user._id;
  const message = await validateGoalRules(req.body, ownerId);
  if (message) {
    return res.status(400).json({ message });
  }

  const goal = await Goal.create({
    cycleId: req.body.cycleId || "2026",
    ownerId,
    managerId: req.user.managerId || req.user._id,
    thrustArea: req.body.thrustArea,
    title: req.body.title,
    description: req.body.description,
    uom: req.body.uom,
    target: req.body.target,
    deadline: req.body.deadline || null,
    weightage: req.body.weightage,
    status: "Draft",
    sharedGoal: false
  });

  await logAudit(req.user._id, "GOAL_CREATED", null, goal.toObject());

  await createGoalNotification({
    userId: req.user.managerId || req.user._id,
    title: "New Draft Goal Created",
    message: `${req.user.name} created draft goal "${goal.title}".`,
    type: "info",
    role: "Manager",
    goalId: goal._id
  });

  res.status(201).json({ message: "Goal created successfully", goal });
};

const updateGoal = async (req, res) => {
  const goal = await Goal.findById(req.params.id);

  if (!goal) {
    return res.status(404).json({ message: "Goal not found" });
  }

  if (String(goal.ownerId) !== String(req.user._id)) {
    return res.status(403).json({ message: "You can only update your own goals" });
  }

  if (goal.sharedGoal) {
    const before = goal.toObject();
    goal.weightage = req.body.weightage ?? goal.weightage;
    await goal.save();
    await logAudit(req.user._id, "GOAL_UPDATED", before, goal.toObject());
    await createGoalNotification({
      userId: req.user.managerId || req.user._id,
      title: "Shared Goal Weightage Updated",
      message: `${req.user.name} updated weightage for "${goal.title}".`,
      type: "info",
      role: "Manager",
      goalId: goal._id
    });
    return res.json({ message: "Goal updated successfully", goal });
  } else {
    if (goal.locked || goal.status === "Approved") {
      return res.status(400).json({ message: "Approved goals are locked" });
    }

    const message = await validateGoalRules(req.body, req.user._id, goal._id);
    if (message) {
      return res.status(400).json({ message });
    }

    const before = goal.toObject();
    goal.thrustArea = req.body.thrustArea ?? goal.thrustArea;
    goal.title = req.body.title ?? goal.title;
    goal.description = req.body.description ?? goal.description;
    goal.uom = req.body.uom ?? goal.uom;
    goal.target = req.body.target ?? goal.target;
    goal.deadline = req.body.deadline ?? goal.deadline;
    goal.weightage = req.body.weightage ?? goal.weightage;
    await goal.save();
    await logAudit(req.user._id, "GOAL_UPDATED", before, goal.toObject());
    await createGoalNotification({
      userId: req.user.managerId || req.user._id,
      title: "Draft Goal Updated",
      message: `${req.user.name} updated draft goal "${goal.title}".`,
      type: "info",
      role: "Manager",
      goalId: goal._id
    });
    return res.json({ message: "Goal updated successfully", goal });
  }
};

const deleteGoal = async (req, res) => {
  const goal = await Goal.findById(req.params.id);

  if (!goal) {
    return res.status(404).json({ message: "Goal not found" });
  }

  if (String(goal.ownerId) !== String(req.user._id)) {
    return res.status(403).json({ message: "You can only delete your own goals" });
  }

  if (goal.status !== "Draft" || goal.locked) {
    return res.status(400).json({ message: "Only draft goals can be deleted" });
  }

  await Goal.findByIdAndDelete(goal._id);
  await logAudit(req.user._id, "GOAL_DELETED", goal.toObject(), null);

  res.json({ message: "Goal deleted successfully" });
};

const submitAllGoals = async (req, res) => {
  const goals = await Goal.find({ ownerId: req.user._id, status: { $in: ["Draft", "Rework"] } });

  if (!goals.length) {
    return res.status(400).json({ message: "No draft goals available for submission" });
  }

  const totalWeightage = goals.reduce((sum, goal) => sum + Number(goal.weightage), 0);
  if (totalWeightage !== 100) {
    return res.status(400).json({ message: "Total weightage must equal exactly 100%" });
  }

  for (const goal of goals) {
    goal.status = "Submitted";
    goal.submissionComment = req.body.comment || "";
    await goal.save();
  }

  await createGoalNotification({
    userId: req.user.managerId || req.user._id,
    title: "Goals Submitted",
    message: `${req.user.name} submitted goals for approval.`,
    type: "info",
    role: "Manager",
    goalId: goals[0]?._id
  });

  const manager = await User.findById(req.user.managerId);
  if (manager) {
    const reviewLink = buildGoalPageLink("Manager", goals[0]?._id);
    const email = buildEmailTemplate({
      heading: "Goals Submitted For Review",
      preview: `${req.user.name} submitted goals for your approval.`,
      message: `${req.user.name} submitted goals for your approval. Open the linked goal to review the full set and continue the workflow.`,
      ctaLabel: "Review Goals",
      ctaUrl: reviewLink,
      metaLines: [`Employee: ${req.user.name}`, `Submitted goals: ${goals.length}`]
    });

    await sendEmail({
      to: manager.email,
      subject: "GoalSync goal submission",
      html: email.html,
      text: email.text
    });

    await sendTeamsNotification(
      "GoalSync Goal Submission",
      `${req.user.name} submitted goals for your approval.`,
      buildAppLink(reviewLink)
    );
  }

  await logAudit(req.user._id, "GOALS_SUBMITTED", null, { goalCount: goals.length });

  res.json({ message: "Goals submitted successfully" });
};

const approveGoal = async (req, res) => {
  const goal = await Goal.findById(req.params.id).populate("ownerId managerId");

  if (!goal) {
    return res.status(404).json({ message: "Goal not found" });
  }

  if (!["Manager", "Admin"].includes(req.user.role)) {
    return res.status(403).json({ message: "Only managers or admins can approve goals" });
  }

  if (req.user.role === "Manager" && goal.ownerId?.department !== req.user.department) {
    return res.status(403).json({ message: "You can only approve goals from your department" });
  }

  if (goal.locked || goal.status === "Approved") {
    return res.status(400).json({ message: "Approved goals can only be changed by Admin" });
  }

  if (!isWithinRange(req.body.weightage ?? goal.weightage, 0, 100)) {
    return res.status(400).json({ message: "Weightage must be between 0% and 100%" });
  }

  if (req.body.target !== undefined && (isNaN(Number(req.body.target)) || Number(req.body.target) < 0)) {
    return res.status(400).json({ message: "Target must be a valid number >= 0" });
  }

  const weightageMessage = await validateGoalRules({ weightage: req.body.weightage ?? goal.weightage }, goal.ownerId._id, goal._id);
  if (weightageMessage && !weightageMessage.includes("Maximum 8 goals")) {
    return res.status(400).json({ message: weightageMessage });
  }

  const enforceHundredMsg = await enforceExactHundredPercent(goal.ownerId._id, goal._id, req.body.weightage ?? goal.weightage);
  if (enforceHundredMsg) {
    return res.status(400).json({ message: enforceHundredMsg });
  }

  const before = goal.toObject();
  goal.target = req.body.target ?? goal.target;
  goal.weightage = req.body.weightage ?? goal.weightage;
  goal.managerComment = req.body.comment || "";
  goal.status = "Approved";
  goal.locked = true;
  goal.editAccess = defaultEditAccess();
  await goal.save();

  await createGoalNotification({
    userId: goal.ownerId._id,
    title: "Goal Approved",
    message: `Your goal "${goal.title}" has been approved.`,
    type: "success",
    role: "Employee",
    goalId: goal._id
  });

  const employeeGoalLink = buildGoalPageLink("Employee", goal._id);
  const approvalEmail = buildEmailTemplate({
    heading: "Goal Approved",
    preview: `Your goal "${goal.title}" has been approved.`,
    message: `Your goal "${goal.title}" has been approved. You can open it directly to review the final target and continue quarterly tracking.`,
    ctaLabel: "Open Approved Goal",
    ctaUrl: employeeGoalLink,
    metaLines: [`Goal: ${goal.title}`, `Manager: ${goal.managerId?.name || "GoalSync"}`]
  });

  await sendEmail({
    to: goal.ownerId.email,
    subject: "Goal approved",
    html: approvalEmail.html,
    text: approvalEmail.text
  });

  await sendTeamsNotification(
    "Goal Approved",
    `${goal.title} has been approved for ${goal.ownerId.name}.`,
    buildAppLink(employeeGoalLink)
  );

  await logAudit(req.user._id, "GOAL_APPROVED", before, goal.toObject());

  res.json({ message: "Goal approved successfully", goal });
};

const rejectGoal = async (req, res) => {
  const goal = await Goal.findById(req.params.id).populate("ownerId");

  if (!goal) {
    return res.status(404).json({ message: "Goal not found" });
  }

  if (req.user.role === "Manager" && goal.ownerId?.department !== req.user.department) {
    return res.status(403).json({ message: "You can only review goals from your department" });
  }

  if (req.user.role === "Manager" && (goal.locked || goal.status === "Approved")) {
    return res.status(400).json({ message: "Approved goals can only be changed by Admin" });
  }

  const before = goal.toObject();
  const actionType = req.body.action === "return_rework" ? "Rework" : "Rejected";

  goal.status = actionType;
  goal.locked = false;
  goal.managerComment = req.body.comment || "";
  await goal.save();

  await createGoalNotification({
    userId: goal.ownerId._id,
    title: actionType === "Rework" ? "Goal Returned for Rework" : "Goal Rejected",
    message: `${goal.title} needs your action.`,
    type: "warning",
    role: "Employee",
    goalId: goal._id
  });

  const reworkLink = buildGoalPageLink("Employee", goal._id);
  const reviewEmail = buildEmailTemplate({
    heading: actionType === "Rework" ? "Goal Returned For Rework" : "Goal Rejected",
    preview: `${goal.title} needs your action.`,
    message: `Your goal "${goal.title}" was marked as ${actionType}. Open GoalSync to review the comments and make the required updates.`,
    ctaLabel: "Open Goal",
    ctaUrl: reworkLink,
    metaLines: goal.managerComment ? [`Manager note: ${goal.managerComment}`] : []
  });

  await sendEmail({
    to: goal.ownerId.email,
    subject: `Goal ${actionType.toLowerCase()}`,
    html: reviewEmail.html,
    text: reviewEmail.text
  });

  await logAudit(req.user._id, "GOAL_REJECTED", before, goal.toObject());

  res.json({ message: `Goal ${actionType.toLowerCase()} successfully`, goal });
};

const unlockGoal = async (req, res) => {
  const goal = await Goal.findById(req.params.id);

  if (!goal) {
    return res.status(404).json({ message: "Goal not found" });
  }

  const before = goal.toObject();
  goal.locked = false;
  goal.status = "Rework";
  goal.editAccess = defaultEditAccess();
  await goal.save();

  await logAudit(req.user._id, "GOAL_UNLOCKED", before, goal.toObject());

  res.json({ message: "Goal unlocked successfully", goal });
};

const updateGoalByAdmin = async (req, res) => {
  const goal = await Goal.findById(req.params.id);

  if (!goal) {
    return res.status(404).json({ message: "Goal not found" });
  }

  const before = goal.toObject();
  const payload = req.body;

  if (payload.target !== undefined && (isNaN(Number(payload.target)) || Number(payload.target) < 0)) {
    return res.status(400).json({ message: "Target must be a valid number >= 0" });
  }

  if (payload.weightage !== undefined) {
    const message = await validateGoalRules(
      {
        weightage: payload.weightage,
        target: payload.target ?? goal.target
      },
      goal.ownerId,
      goal._id
    );

    if (message) {
      return res.status(400).json({ message });
    }
  }

  goal.thrustArea = payload.thrustArea ?? goal.thrustArea;
  goal.title = payload.title ?? goal.title;
  goal.description = payload.description ?? goal.description;
  goal.uom = payload.uom ?? goal.uom;
  goal.target = payload.target ?? goal.target;
  goal.deadline = payload.deadline ?? goal.deadline;
  goal.weightage = payload.weightage ?? goal.weightage;
  goal.progressStatus = payload.progressStatus ?? goal.progressStatus;

  if (payload.status) {
    goal.status = payload.status;
    goal.locked = payload.status === "Approved";
  }

  if (payload.clearEditAccess) {
    goal.editAccess = defaultEditAccess();
  }

  await goal.save();
  await logAudit(req.user._id, "ADMIN_GOAL_UPDATED", before, goal.toObject());

  res.json({ message: "Goal updated successfully", goal });
};

const reviewGoalByManager = async (req, res) => {
  const goal = await Goal.findById(req.params.id).populate("ownerId", "department");

  if (!goal) {
    return res.status(404).json({ message: "Goal not found" });
  }

  if (goal.ownerId?.department !== req.user.department) {
    return res.status(403).json({ message: "You can only review goals from your department" });
  }

  normalizeEditAccess(goal);
  const hasGrantedAccess = isEditAccessActiveForManager(goal, req.user);

  if ((goal.locked || goal.status === "Approved") && !hasGrantedAccess) {
    return res.status(400).json({ message: "Approved goals are locked for manager edits" });
  }

  const nextWeightage = req.body.weightage ?? goal.weightage;
  const nextTarget = req.body.target ?? goal.target;
  const nextStatus = req.body.status ?? goal.status;

  const allowedStatuses = hasGrantedAccess
    ? ["Draft", "Submitted", "Rejected", "Rework", "Approved"]
    : ["Draft", "Submitted", "Rejected", "Rework"];
  if (!allowedStatuses.includes(nextStatus)) {
    return res.status(400).json({ message: "Managers can only save pre-approval statuses" });
  }

  const validationMessage = await validateGoalRules(
    {
      weightage: nextWeightage,
      target: nextTarget
    },
    goal.ownerId._id,
    goal._id
  );

  if (validationMessage && !validationMessage.includes("Maximum 8 goals")) {
    return res.status(400).json({ message: validationMessage });
  }

  if (nextStatus === "Approved") {
    const enforceHundredMsg = await enforceExactHundredPercent(goal.ownerId._id, goal._id, nextWeightage);
    if (enforceHundredMsg) {
      return res.status(400).json({ message: enforceHundredMsg });
    }
  }

  const before = goal.toObject();
  goal.target = nextTarget;
  goal.weightage = nextWeightage;
  goal.status = nextStatus;
  goal.managerComment = req.body.comment || goal.managerComment;

  if (hasGrantedAccess) {
    goal.editAccess.status = "expired";
  }

  await goal.save();

  await createGoalNotification({
    userId: goal.ownerId._id,
    title: "Goal Updated by Manager",
    message: `${goal.title} was updated during manager review.`,
    type: "info",
    role: "Employee",
    goalId: goal._id
  });

  await logAudit(req.user._id, "MANAGER_GOAL_REVIEW_UPDATED", before, goal.toObject());

  res.json({ message: "Goal review updated successfully", goal });
};

const updateGoalStatus = async (req, res) => {
  const goal = await Goal.findById(req.params.id).populate("ownerId", "department");

  if (!goal) {
    return res.status(404).json({ message: "Goal not found" });
  }

  const { status } = req.body;
  const allowedStatuses = ["Draft", "Submitted", "Approved", "Rejected", "Rework", "Completed"];

  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({ message: "Invalid status selected" });
  }

  if (req.user.role === "Manager") {
    const sameDepartment = goal.ownerId?.department === req.user.department;

    if (!sameDepartment) {
      return res.status(403).json({ message: "You can only update status for your department goals" });
    }

    if (goal.locked || goal.status === "Approved") {
      return res.status(400).json({ message: "Approved goals can only be changed by Admin" });
    }

    if (!["Draft", "Submitted", "Rejected", "Rework"].includes(status)) {
      return res.status(400).json({ message: "Managers can only set pre-approval statuses" });
    }
  }

  const before = goal.toObject();
  goal.status = status;

  if (req.user.role === "Admin") {
    goal.locked = status === "Approved";
  }

  await goal.save();
  await logAudit(req.user._id, "GOAL_STATUS_UPDATED", before, goal.toObject());

  res.json({ message: "Goal status updated successfully", goal });
};

const assignEmployeesToExistingGoal = async (req, res) => {
  const sourceGoal = await Goal.findById(req.params.id).populate("ownerId", "department name").populate("managerId", "department");

  if (!sourceGoal) {
    return res.status(404).json({ message: "Source goal not found" });
  }

  const assignments = Array.isArray(req.body.assignments) ? req.body.assignments : [];

  if (!assignments.length) {
    return res.status(400).json({ message: "Please add at least one employee assignment" });
  }

  const ownerDepartment = sourceGoal.ownerId?.department || "";

  if (req.user.role === "Manager" && ownerDepartment !== req.user.department) {
    return res.status(403).json({ message: "You can only share goals inside your own department" });
  }

  const createdGoals = [];

  for (const assignment of assignments) {
    const employee = await User.findById(assignment.employeeId);

    if (!employee) {
      continue;
    }

    if (employee.department !== ownerDepartment) {
      return res.status(400).json({ message: "All assigned employees must belong to the same department as the source goal" });
    }

    if (req.user.role === "Manager" && employee.department !== req.user.department) {
      return res.status(403).json({ message: "Managers can only assign within their own department" });
    }

    const message = await validateGoalRules(
      {
        weightage: assignment.weightage,
        target: sourceGoal.target
      },
      employee._id
    );

    if (message) {
      return res.status(400).json({ message: `${employee.name}: ${message}` });
    }

    const existingGoal = await Goal.findOne({
      ownerId: employee._id,
      primaryOwnerId: sourceGoal.primaryOwnerId || sourceGoal.ownerId,
      title: sourceGoal.title
    });

    if (existingGoal) {
      existingGoal.weightage = assignment.weightage;
      await existingGoal.save();
      await createGoalNotification({
        userId: employee._id,
        title: "Shared Goal Updated",
        message: `The shared goal "${sourceGoal.title}" has been updated and assigned to you.`,
        type: "info",
        role: "Employee",
        goalId: existingGoal._id
      });
      createdGoals.push(existingGoal);
      continue;
    }

    const sharedGoal = await Goal.create({
      cycleId: sourceGoal.cycleId,
      ownerId: employee._id,
      managerId: employee.managerId || sourceGoal.managerId?._id || req.user._id,
      thrustArea: sourceGoal.thrustArea,
      title: sourceGoal.title,
      description: sourceGoal.description,
      uom: sourceGoal.uom,
      target: sourceGoal.target,
      deadline: sourceGoal.deadline,
      weightage: assignment.weightage,
      status: sourceGoal.status === "Approved" ? "Approved" : "Draft",
      sharedGoal: true,
      primaryOwnerId: sourceGoal.primaryOwnerId || sourceGoal.ownerId?._id || sourceGoal.ownerId,
      locked: sourceGoal.status === "Approved"
    });

    createdGoals.push(sharedGoal);

    await createGoalNotification({
      userId: employee._id,
      title: "Shared Goal Assigned",
      message: `The shared goal "${sourceGoal.title}" has been assigned to you.`,
      type: "info",
      role: "Employee",
      goalId: sharedGoal._id
    });
  }

  await logAudit(req.user._id, "EXISTING_GOAL_SHARED", null, {
    sourceGoalId: sourceGoal._id,
    assignedCount: createdGoals.length
  });

  res.status(201).json({ message: "Employees assigned to existing goal successfully", goals: createdGoals });
};

const saveActuals = async (req, res) => {
  const goal = await Goal.findById(req.params.id);

  if (!goal) {
    return res.status(404).json({ message: "Goal not found" });
  }

  if (String(goal.ownerId) !== String(req.user._id)) {
    return res.status(403).json({ message: "You can only update your own goal actuals" });
  }

  if (!canSubmitCheckin()) {
    return res.status(400).json({ message: "Achievement updates are only allowed during active check-in windows" });
  }

  if (req.body.achievement !== undefined && (isNaN(Number(req.body.achievement)) || Number(req.body.achievement) < 0)) {
    return res.status(400).json({ message: "Achievement must be a valid number >= 0" });
  }

  const before = goal.toObject();
  goal.actuals = Number(req.body.achievement || 0);
  goal.progressStatus = req.body.status || goal.progressStatus;
  goal.progressScore = getScoreFromGoal(goal, goal.actuals, req.body.completedDate);
  await goal.save();

  if (goal.sharedGoal && goal.primaryOwnerId) {
    await Goal.updateMany(
      { primaryOwnerId: goal.primaryOwnerId, title: goal.title },
      {
        $set: {
          actuals: goal.actuals,
          progressStatus: goal.progressStatus,
          progressScore: goal.progressScore
        }
      }
    );
  }

  await logAudit(req.user._id, "GOAL_ACTUALS_UPDATED", before, goal.toObject());

  await createGoalNotification({
    userId: goal.managerId,
    title: "Achievement Updated",
    message: `${req.user.name} updated actuals for "${goal.title}".`,
    type: "info",
    role: "Manager",
    goalId: goal._id
  });

  res.json({ message: "Actual achievement saved", goal });
};

const submitCheckin = async (req, res) => {
  const goal = await Goal.findById(req.params.id);

  if (!goal) {
    return res.status(404).json({ message: "Goal not found" });
  }

  if (String(goal.ownerId) !== String(req.user._id)) {
    return res.status(403).json({ message: "You can only submit your own check-ins" });
  }

  if (!canSubmitCheckin()) {
    return res.status(400).json({ message: "Check-ins are only allowed during active quarterly windows" });
  }

  if (req.body.achievement !== undefined && (isNaN(Number(req.body.achievement)) || Number(req.body.achievement) < 0)) {
    return res.status(400).json({ message: "Achievement must be a valid number >= 0" });
  }

  const currentWindow = getCycleWindow();
  const score = getScoreFromGoal(goal, req.body.achievement, req.body.completedDate);
  const existingIndex = goal.checkins.findIndex((item) => item.quarter === currentWindow.key);
  const record = {
    quarter: currentWindow.key,
    achievement: Number(req.body.achievement || 0),
    status: req.body.status || "Not Started",
    comment: req.body.comment || "",
    managerComment: "",
    score,
    updatedAt: new Date()
  };

  if (existingIndex >= 0) {
    goal.checkins[existingIndex] = record;
  } else {
    goal.checkins.push(record);
  }

  goal.actuals = record.achievement;
  goal.progressStatus = record.status;
  goal.progressScore = score;

  await goal.save();
  await logAudit(req.user._id, "GOAL_CHECKIN_SUBMITTED", null, record);

  await createGoalNotification({
    userId: goal.managerId,
    title: "Quarterly Check-In Submitted",
    message: `${req.user.name} submitted a check-in for "${goal.title}".`,
    type: "info",
    role: "Manager",
    goalId: goal._id
  });

  await sendTeamsNotification(
    "GoalSync Check-In Submitted",
    `${req.user.name} submitted a check-in for ${goal.title}.`,
    `${process.env.APP_URL}${buildGoalPageLink("Manager", goal._id)}`
  );

  res.json({ message: "Check-in submitted successfully", goal });
};

const requestManagerEditAccess = async (req, res) => {
  const goal = await Goal.findById(req.params.id).populate("ownerId managerId");

  if (!goal) {
    return res.status(404).json({ message: "Goal not found" });
  }

  if (req.user.role !== "Manager") {
    return res.status(403).json({ message: "Only managers can request access" });
  }

  if (goal.ownerId?.department !== req.user.department) {
    return res.status(403).json({ message: "You can only request access for your department goals" });
  }

  if (!(goal.locked || goal.status === "Approved")) {
    return res.status(400).json({ message: "Access is only needed for approved goals" });
  }

  normalizeEditAccess(goal);

  if (goal.editAccess.status === "pending") {
    return res.status(400).json({ message: "An admin access request is already pending" });
  }

  if (isEditAccessActiveForManager(goal, req.user)) {
    return res.status(400).json({ message: "Access is already active for this goal" });
  }

  const before = goal.toObject();
  goal.editAccess.status = "pending";
  goal.editAccess.requestedByManagerId = req.user._id;
  goal.editAccess.requestedAt = new Date();
  goal.editAccess.requestComment = req.body.comment || "";
  goal.editAccess.grantedByAdminId = null;
  goal.editAccess.grantedAt = null;
  goal.editAccess.expiresAt = null;
  await goal.save();

  const admins = await User.find({ role: "Admin" }).select("_id");
  if (admins.length) {
    await Notification.insertMany(
      admins.map((admin) => ({
        userId: admin._id,
        title: "Manager Requested Edit Access",
        message: `${req.user.name} requested 24-hour edit access for "${goal.title}".`,
        type: "warning",
        link: buildGoalPageLink("Admin", goal._id),
        entityType: "goal",
        entityId: String(goal._id)
      }))
    );
  }

  await logAudit(req.user._id, "MANAGER_EDIT_ACCESS_REQUESTED", before, goal.toObject());

  res.json({ message: "Admin access request sent successfully", goal });
};

const approveManagerEditAccess = async (req, res) => {
  const goal = await Goal.findById(req.params.id).populate("ownerId");

  if (!goal) {
    return res.status(404).json({ message: "Goal not found" });
  }

  normalizeEditAccess(goal);

  if (goal.editAccess.status !== "pending" || !goal.editAccess.requestedByManagerId) {
    return res.status(400).json({ message: "No pending access request exists for this goal" });
  }

  const before = goal.toObject();
  const grantedAt = new Date();
  const expiresAt = new Date(grantedAt.getTime() + 24 * 60 * 60 * 1000);

  goal.editAccess.status = "granted";
  goal.editAccess.grantedByAdminId = req.user._id;
  goal.editAccess.grantedAt = grantedAt;
  goal.editAccess.expiresAt = expiresAt;
  await goal.save();

  await createGoalNotification({
    userId: goal.editAccess.requestedByManagerId,
    title: "Admin Approved Goal Edit Access",
    message: `You can edit "${goal.title}" until ${expiresAt.toLocaleString("en-IN")}.`,
    type: "success",
    role: "Manager",
    goalId: goal._id
  });

  await createGoalNotification({
    userId: goal.ownerId._id,
    title: "Goal Access Granted",
    message: `Admin approved temporary manager edit access for "${goal.title}".`,
    type: "info",
    role: "Employee",
    goalId: goal._id
  });

  await logAudit(req.user._id, "ADMIN_GRANTED_MANAGER_EDIT_ACCESS", before, goal.toObject());

  res.json({ message: "24-hour edit access granted", goal });
};

const pushSharedGoals = async (req, res) => {
  const { employeeIds, thrustArea, title, description, uom, target, weightage, deadline, primaryOwnerId } = req.body;

  if (!Array.isArray(employeeIds) || !employeeIds.length) {
    return res.status(400).json({ message: "At least one employee is required" });
  }

  if (weightage !== undefined && (isNaN(Number(weightage)) || Number(weightage) < 10)) {
    return res.status(400).json({ message: "Weightage must be a valid number and at least 10%" });
  }

  if (target !== undefined && (isNaN(Number(target)) || Number(target) < 0)) {
    return res.status(400).json({ message: "Target must be a valid number >= 0" });
  }

  const primaryOwner = await User.findById(primaryOwnerId || employeeIds[0]);
  const goals = [];

  for (const employeeId of employeeIds) {
    const employee = await User.findById(employeeId);
    if (!employee) {
      continue;
    }

    if (req.user.role === "Manager") {
      const belongsToManager =
        String(employee.managerId) === String(req.user._id) && employee.department === req.user.department;

      if (!belongsToManager) {
        return res.status(403).json({ message: "You can only assign shared goals to your own department team" });
      }
    }

    const message = await validateGoalRules({ weightage }, employeeId);
    if (message && !message.includes("Maximum 8 goals")) {
      return res.status(400).json({ message });
    }

    const enforceHundredMsg = await enforceExactHundredPercent(employeeId, null, weightage);
    if (enforceHundredMsg) {
      return res.status(400).json({ message: `For ${employee.name}: ${enforceHundredMsg}` });
    }

    goals.push({
      cycleId: "2026",
      ownerId: employee._id,
      managerId: employee.managerId || req.user._id,
      thrustArea,
      title,
      description,
      uom,
      target,
      weightage,
      deadline: deadline || null,
      status: "Approved",
      sharedGoal: true,
      primaryOwnerId: primaryOwner ? primaryOwner._id : employee._id,
      locked: true
    });
  }

  const createdGoals = await Goal.insertMany(goals);

  for (const goal of createdGoals) {
    await createGoalNotification({
      userId: goal.ownerId,
      title: "Shared Goal Assigned",
      message: `A shared goal "${title}" has been assigned to you.`,
      type: "info",
      role: "Employee",
      goalId: goal._id
    });
  }

  await logAudit(req.user._id, "SHARED_GOALS_PUSHED", null, {
    count: createdGoals.length,
    title
  });

  res.status(201).json({ message: "Shared goals assigned successfully", goals: createdGoals });
};

module.exports = {
  getGoals,
  getGoalDetails,
  createGoal,
  updateGoal,
  deleteGoal,
  submitAllGoals,
  approveGoal,
  rejectGoal,
  unlockGoal,
  updateGoalByAdmin,
  reviewGoalByManager,
  updateGoalStatus,
  assignEmployeesToExistingGoal,
  saveActuals,
  submitCheckin,
  requestManagerEditAccess,
  approveManagerEditAccess,
  pushSharedGoals
};
