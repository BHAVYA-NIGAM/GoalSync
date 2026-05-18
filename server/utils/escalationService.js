const cron = require("node-cron");
const Goal = require("../models/Goal");
const User = require("../models/User");
const Escalation = require("../models/Escalation");
const Notification = require("../models/Notification");
const {
  sendEmail,
  buildAppLink,
  buildEmailTemplate,
} = require("./emailService");
const { sendTeamsNotification } = require("./teamsService");

const ESCALATION_TTL_MS = 60 * 60 * 1000;

const getEscalationCutoff = () => new Date(Date.now() - ESCALATION_TTL_MS);

const deleteExpiredEscalations = async () => {
  await Escalation.deleteMany({
    createdAt: { $lt: getEscalationCutoff() },
  });
};

const buildEscalationLink = (user, goalId) => {
  const page =
    user.role === "Admin"
      ? "admin-dashboard.html"
      : user.role === "Manager"
        ? "manager-dashboard.html"
        : goalId
          ? "checkin.html"
          : "employee-dashboard.html";

  return goalId
    ? `/public/pages/${page}?goalId=${goalId}&openGoal=true`
    : `/public/pages/${page}`;
};

const createEscalation = async (
  targetUserId,
  message,
  triggeredBy,
  goalId = null,
) => {
  await deleteExpiredEscalations();

  const existing = await Escalation.findOne({
    targetUserId,
    goalId,
    triggeredBy,
    resolved: false,
    createdAt: { $gte: getEscalationCutoff() },
  });

  let escalation = existing;
  if (!escalation) {
    escalation = await Escalation.create({
      targetUserId,
      goalId,
      triggeredBy,
      message,
    });
  } else if (escalation.retryCount >= 3) {
    return; // Max retries reached
  }

  try {
    await Notification.create({
      userId: targetUserId,
      title: "Escalation Alert",
      message,
      type: "warning",
    });

    const user = await User.findById(targetUserId);

    if (user) {
      const link = buildEscalationLink(user, goalId);
      const email = buildEmailTemplate({
        heading: "Escalation Alert",
        preview: message,
        message,
        ctaLabel: "Review in GoalSync",
        ctaUrl: link,
        metaLines: [`Trigger: ${triggeredBy.replace(/_/g, " ")}`],
      });

      await sendEmail({
        to: user.email,
        subject: "GoalSync Escalation Alert",
        html: email.html,
        text: email.text,
      });

      await sendTeamsNotification(
        "GoalSync Escalation",
        message,
        buildAppLink(link),
      );
    }

    escalation.lastAttempt = new Date();
    await escalation.save();
  } catch (error) {
    escalation.retryCount += 1;
    escalation.lastAttempt = new Date();
    escalation.errorLogs.push(error.message);
    await escalation.save();
  }
};

const runEscalationChecks = async () => {
  await deleteExpiredEscalations();

  const employees = await User.find({ role: "Employee" });

  for (const employee of employees) {
    const goals = await Goal.find({ ownerId: employee._id });

    if (!goals.length) {
      await createEscalation(
        employee._id,
        "No goals have been created or submitted for the current cycle.",
        "goal_not_submitted",
      );
    }

    const pendingGoals = goals.filter((goal) => goal.status === "Submitted");
    if (pendingGoals.length && employee.managerId) {
      await createEscalation(
        employee.managerId,
        `There are ${pendingGoals.length} pending goal approvals for ${employee.name}.`,
        "approval_pending",
      );
    }

    const approvedGoals = goals.filter((goal) => goal.status === "Approved");
    const missingCheckins = approvedGoals.filter(
      (goal) => !goal.checkins.length,
    );
    if (missingCheckins.length) {
      await createEscalation(
        employee._id,
        `You have ${missingCheckins.length} approved goals without a quarterly check-in.`,
        "checkin_incomplete",
      );
    }
  }
};

const startEscalationEngine = () => {
  cron.schedule("*/10 * * * *", async () => {
    try {
      await deleteExpiredEscalations();
      console.log("Expired escalation cleanup completed");
    } catch (error) {
      console.error("Escalation cleanup error:", error.message);
    }
  });

  cron.schedule("0 9 * * 1", async () => {
    try {
      await runEscalationChecks();
      console.log("Escalation check completed");
    } catch (error) {
      console.error("Escalation engine error:", error.message);
    }
  });
};

module.exports = {
  ESCALATION_TTL_MS,
  getEscalationCutoff,
  deleteExpiredEscalations,
  startEscalationEngine,
  runEscalationChecks,
};
