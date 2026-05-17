const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");
const { getTeamGoals, addManagerComment, addCheckinComment } = require("../controllers/managerController");

const router = express.Router();

router.use(authMiddleware, roleMiddleware("Manager", "Admin"));

router.get("/team-goals", getTeamGoals);
router.post("/team-goals/:id/comment", addManagerComment);
router.post("/team-goals/:id/checkin-comment", addCheckinComment);

module.exports = router;
