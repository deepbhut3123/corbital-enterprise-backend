const express = require("express");

const healthRoutes = require("./healthRoutes");
const authRoutes = require("./authRoutes");
const targetRoutes = require("./targetRoutes");
const valueEntryRoutes = require("./valueEntryRoutes");
const attendanceRoutes = require("./attendanceRoutes");
const cronRoutes = require("./cronRoutes");
const holidayRoutes = require("./holidayRoutes");
const reportRoutes = require("./reportRoutes");

const router = express.Router();

router.use("/health", healthRoutes);
router.use("/auth", authRoutes);
router.use("/targets", targetRoutes);
router.use("/value-entries", valueEntryRoutes);
router.use("/attendance", attendanceRoutes);
router.use("/cron", cronRoutes);
router.use("/holidays", holidayRoutes);
router.use("/reports", reportRoutes);

module.exports = router;
