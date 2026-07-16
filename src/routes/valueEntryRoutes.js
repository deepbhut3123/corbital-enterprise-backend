const express = require("express");

const {
  createValueEntry,
  getValueEntries,
} = require("../controllers/valueEntryController");
const { requireAuth } = require("../middlewares/authMiddleware");

const router = express.Router();

router.get("/", requireAuth, getValueEntries);
router.post("/", requireAuth, createValueEntry);

module.exports = router;
