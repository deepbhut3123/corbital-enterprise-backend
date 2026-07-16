const express = require("express");

const healthRoutes = require("./healthRoutes");
const authRoutes = require("./authRoutes");
const targetRoutes = require("./targetRoutes");
const valueEntryRoutes = require("./valueEntryRoutes");
const attendanceRoutes = require("./attendanceRoutes");

const router = express.Router();

router.use("/health", healthRoutes);
router.use("/auth", authRoutes);
router.use("/targets", targetRoutes);
router.use("/value-entries", valueEntryRoutes);
router.use("/attendance", attendanceRoutes);

module.exports = router;
