const express = require("express");

const { downloadSalaryReport } = require("../controllers/reportController");
const { requireAdmin, requireAuth } = require("../middlewares/authMiddleware");

const router = express.Router();

router.get("/salary", requireAuth, requireAdmin, downloadSalaryReport);

module.exports = router;
