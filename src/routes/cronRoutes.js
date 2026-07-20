const express = require("express");

const { createHolidayAttendanceEntries } = require("../jobs/holidayAttendanceJob");

const router = express.Router();

const requireCronSecret = (req, res, next) => {
  const cronSecret = (process.env.CRON_SECRET || "").trim();
  const authorizationHeader = req.get("authorization") || "";

  if (!cronSecret) {
    return res.status(500).json({
      success: false,
      message: "CRON_SECRET is not configured.",
    });
  }

  if (cronSecret && authorizationHeader === `Bearer ${cronSecret}`) {
    return next();
  }

  return res.status(401).json({
    success: false,
    message: "Unauthorized cron request.",
  });
};

router.get("/holiday-attendance", requireCronSecret, async (req, res, next) => {
  try {
    const result = await createHolidayAttendanceEntries();

    res.status(200).json({
      success: true,
      message: result.skipped
        ? "Holiday attendance job skipped because today is not Sunday or a holiday."
        : "Holiday attendance job completed.",
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
