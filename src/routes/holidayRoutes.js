const express = require("express");

const {
  deleteHoliday,
  getHolidays,
  saveHoliday,
} = require("../controllers/holidayController");
const { requireAdmin, requireAuth } = require("../middlewares/authMiddleware");

const router = express.Router();

router.get("/", requireAuth, requireAdmin, getHolidays);
router.post("/", requireAuth, requireAdmin, saveHoliday);
router.delete("/:id", requireAuth, requireAdmin, deleteHoliday);

module.exports = router;
