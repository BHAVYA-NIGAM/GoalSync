const express = require("express");
const { body } = require("express-validator");
const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");
const {
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
} = require("../controllers/goalController");

const router = express.Router();

router.use(authMiddleware);

router.get("/", getGoals);
router.get("/:id/details", getGoalDetails);

router.post(
  "/",
  roleMiddleware("Employee"),
  [
    body("thrustArea").notEmpty().withMessage("Thrust area is required"),
    body("title").notEmpty().withMessage("Goal title is required"),
    body("description").notEmpty().withMessage("Description is required"),
    body("uom").notEmpty().withMessage("UoM type is required"),
    body("target").isNumeric().withMessage("Target must be numeric"),
    body("weightage").isNumeric().withMessage("Weightage must be numeric")
  ],
  createGoal
);

router.put("/:id", roleMiddleware("Employee"), updateGoal);
router.delete("/:id", roleMiddleware("Employee"), deleteGoal);
router.post("/submit-all", roleMiddleware("Employee"), submitAllGoals);
router.post("/:id/approve", roleMiddleware("Manager", "Admin"), approveGoal);
router.post("/:id/reject", roleMiddleware("Manager", "Admin"), rejectGoal);
router.post("/:id/unlock", roleMiddleware("Admin"), unlockGoal);
router.post("/:id/request-access", roleMiddleware("Manager"), requestManagerEditAccess);
router.post("/:id/grant-access", roleMiddleware("Admin"), approveManagerEditAccess);
router.post("/:id/status", roleMiddleware("Manager", "Admin"), updateGoalStatus);
router.put("/:id/admin-update", roleMiddleware("Admin"), updateGoalByAdmin);
router.put("/:id/review", roleMiddleware("Manager"), reviewGoalByManager);
router.post("/:id/share-existing", roleMiddleware("Manager", "Admin"), assignEmployeesToExistingGoal);
router.post("/:id/actuals", roleMiddleware("Employee"), saveActuals);
router.post("/:id/checkin", roleMiddleware("Employee"), submitCheckin);
router.post("/shared/push", roleMiddleware("Manager", "Admin"), pushSharedGoals);

module.exports = router;
