const Attendance = require("../models/Attendance");
const Holiday = require("../models/Holiday");
const User = require("../models/User");

const ATTENDANCE_TIMEZONE = "Asia/Kolkata";
const ONE_MINUTE_MS = 60 * 1000;

const getDatePartValue = (parts, type) =>
  Number(parts.find(part => part.type === type)?.value || 0);

const getIndiaDateParts = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ATTENDANCE_TIMEZONE,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  return {
    day: getDatePartValue(parts, "day"),
    hour: getDatePartValue(parts, "hour"),
    minute: getDatePartValue(parts, "minute"),
    month: getDatePartValue(parts, "month"),
    weekday: parts.find(part => part.type === "weekday")?.value || "",
    year: getDatePartValue(parts, "year"),
  };
};

const getAttendanceDate = (year, month, day) =>
  new Date(Date.UTC(year, month - 1, day));

const createHolidayAttendanceEntries = async (date = new Date()) => {
  const { day, month, weekday, year } = getIndiaDateParts(date);

  const attendanceDate = getAttendanceDate(year, month, day);
  const holiday = await Holiday.findOne({ holidayDate: attendanceDate });
  const isSunday = weekday === "Sun";

  if (!isSunday && !holiday) {
    return { created: 0, skipped: true };
  }

  const holidayName = holiday?.name || "Sunday";

  const users = await User.find({}, "_id");

  if (!users.length) {
    return {
      created: 0,
      holidayDate: new Date(attendanceDate).toISOString().slice(0, 10),
      holidayName,
      skipped: false,
    };
  }

  const operations = users.map(user => ({
    updateOne: {
      filter: {
        attendanceDate,
        userId: user._id,
      },
      update: {
        $setOnInsert: {
          attendanceDate,
          logs: [],
          totalMinutes: 0,
          userId: user._id,
        },
      },
      upsert: true,
    },
  }));

  const result = await Attendance.bulkWrite(operations, { ordered: false });

  return {
    created: result.upsertedCount || 0,
    holidayDate: new Date(attendanceDate).toISOString().slice(0, 10),
    holidayName,
    skipped: false,
  };
};

const startHolidayAttendanceJob = () => {
  const runJob = async () => {
    const { hour, minute } = getIndiaDateParts();

    if (hour !== 0 || minute !== 35) {
      return;
    }

    try {
      const result = await createHolidayAttendanceEntries();

      if (result.skipped) {
        console.log("Holiday attendance job skipped because today is not Sunday or a holiday.");
        return;
      }

      console.log(
        `Holiday attendance job created ${result.created} entries for ${result.holidayName}.`
      );
    } catch (error) {
      console.error("Holiday attendance job failed:", error.message);
    }
  };

  runJob();

  return setInterval(runJob, ONE_MINUTE_MS);
};

module.exports = {
  createHolidayAttendanceEntries,
  startHolidayAttendanceJob,
};

