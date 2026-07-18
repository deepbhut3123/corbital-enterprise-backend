const express = require("express");

const {
  createValueEntry,
  deleteValueEntry,
  getValueEntries,
  updateValueEntry,
} = require("../controllers/valueEntryController");
const { requireAuth } = require("../middlewares/authMiddleware");

const router = express.Router();

router.get("/", requireAuth, getValueEntries);
router.post("/", requireAuth, createValueEntry);
router.put("/:id", requireAuth, updateValueEntry);
router.delete("/:id", requireAuth, deleteValueEntry);

module.exports = router;
