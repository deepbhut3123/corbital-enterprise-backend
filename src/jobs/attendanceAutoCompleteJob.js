const Attendance = require("../models/Attendance");

const ATTENDANCE_ACTIONS = ["check_in", "check_out"];
const ATTENDANCE_TIMEZONE = "Asia/Kolkata";
const ATTENDANCE_TIMEZONE_OFFSET_MINUTES = 330;
const ONE_MINUTE_MS = 60 * 1000;

const getDatePartValue = (parts, type) =>
  Number(parts.find(part => part.type === type)?.value || 0);

const getIndiaDateParts = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ATTENDANCE_TIMEZONE,
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
    year: getDatePartValue(parts, "year"),
  };
};

const getAttendanceDate = (year, month, day) =>
  new Date(Date.UTC(year, month - 1, day));

const parseAutoCompleteTime = value => {
  const normalizedValue = String(value || "").trim();

  if (!normalizedValue) {
    return null;
  }

  const match = normalizedValue.match(/^(\d{2}):(\d{2})$/);

  if (!match) {
    throw new Error("ATTENDANCE_AUTO_COMPLETE_TIME must be in HH:mm format.");
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new Error("ATTENDANCE_AUTO_COMPLETE_TIME must be a valid HH:mm time.");
  }

  return { hour, minute };
};

const createIndiaTimestamp = ({ day, hour, minute, month, year }) =>
  new Date(
    Date.UTC(year, month - 1, day, hour, minute, 0, 0) -
      ATTENDANCE_TIMEZONE_OFFSET_MINUTES * ONE_MINUTE_MS
  );

const calculateTotalMinutes = logs => {
  const sortedLogs = [...logs].sort(
    (left, right) => new Date(left.recordedAt).getTime() - new Date(right.recordedAt).getTime()
  );

  const punchIn = sortedLogs.find(log => log.action === "check_in");
  const punchOut = [...sortedLogs]
    .reverse()
    .find(log => log.action === "check_out");

  if (!punchIn || !punchOut) {
    return 0;
  }

  const totalMilliseconds =
    new Date(punchOut.recordedAt).getTime() -
    new Date(punchIn.recordedAt).getTime();

  return Math.max(Math.round(totalMilliseconds / 60000), 0);
};

const buildCompletionLogs = (logs, recordedAt) => {
  const sortedLogs = [...logs].sort(
    (left, right) => new Date(left.recordedAt).getTime() - new Date(right.recordedAt).getTime()
  );
  const lastLog = [...sortedLogs]
    .reverse()
    .find(log => ATTENDANCE_ACTIONS.includes(log.action));

  if (!lastLog || lastLog.action === "check_out") {
    return null;
  }

  return [
    ...sortedLogs,
    {
      action: "check_out",
      notes: "Auto completed by server.",
      recordedAt,
    },
  ];
};

const autoCompleteStartedAttendance = async (date = new Date()) => {
  const configuredTime = parseAutoCompleteTime(process.env.ATTENDANCE_AUTO_COMPLETE_TIME);

  if (!configuredTime) {
    return { disabled: true, updated: 0 };
  }

  const currentIndiaTime = getIndiaDateParts(date);

  if (
    currentIndiaTime.hour !== configuredTime.hour ||
    currentIndiaTime.minute !== configuredTime.minute
  ) {
    return { skipped: true, updated: 0 };
  }

  const attendanceDate = getAttendanceDate(
    currentIndiaTime.year,
    currentIndiaTime.month,
    currentIndiaTime.day
  );
  const recordedAt = createIndiaTimestamp({
    ...currentIndiaTime,
    hour: configuredTime.hour,
    minute: configuredTime.minute,
  });
  const records = await Attendance.find({
    attendanceDate,
    "logs.0": { $exists: true },
  });

  let updated = 0;

  await Promise.all(
    records.map(async record => {
      const nextLogs = buildCompletionLogs(record.logs, recordedAt);

      if (!nextLogs) {
        return;
      }

      record.logs = nextLogs;
      record.totalMinutes = calculateTotalMinutes(nextLogs);
      await record.save();
      updated += 1;
    })
  );

  return {
    attendanceDate: attendanceDate.toISOString().slice(0, 10),
    disabled: false,
    skipped: false,
    updated,
  };
};

const startAttendanceAutoCompleteJob = () => {
  const configuredTime = parseAutoCompleteTime(process.env.ATTENDANCE_AUTO_COMPLETE_TIME);

  if (!configuredTime) {
    console.log("Attendance auto-complete job disabled.");
    return null;
  }

  const runJob = async () => {
    try {
      const result = await autoCompleteStartedAttendance();

      if (result.skipped || result.disabled) {
        return;
      }

      console.log(
        `Attendance auto-complete job closed ${result.updated} started records for ${result.attendanceDate}.`
      );
    } catch (error) {
      console.error("Attendance auto-complete job failed:", error.message);
    }
  };

  runJob();

  return setInterval(runJob, ONE_MINUTE_MS);
};

module.exports = {
  autoCompleteStartedAttendance,
  startAttendanceAutoCompleteJob,
};
