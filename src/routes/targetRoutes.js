const express = require("express");

const {
  deleteTarget,
  getMyTarget,
  getTargets,
  saveTarget,
} = require("../controllers/targetController");
const { requireAdmin, requireAuth } = require("../middlewares/authMiddleware");

const router = express.Router();

router.get("/me", requireAuth, getMyTarget);
router.get("/", requireAuth, requireAdmin, getTargets);
router.post("/", requireAuth, requireAdmin, saveTarget);
router.delete("/:id", requireAuth, requireAdmin, deleteTarget);

module.exports = router;
