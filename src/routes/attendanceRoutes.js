const express = require("express");

const {
  createAttendanceAction,
  getAttendanceRecords,
  getMyAttendanceRecords,
  updateAttendanceRecord,
} = require("../controllers/attendanceController");
const { requireAdmin, requireAuth } = require("../middlewares/authMiddleware");

const router = express.Router();

router.get("/me", requireAuth, getMyAttendanceRecords);
router.get("/", requireAuth, requireAdmin, getAttendanceRecords);
router.post("/", requireAuth, createAttendanceAction);
router.put("/:id", requireAuth, requireAdmin, updateAttendanceRecord);

module.exports = router;
