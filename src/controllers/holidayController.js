const mongoose = require("mongoose");

const Holiday = require("../models/Holiday");

const getHolidayDate = (dateInput) => {
  const normalizedDate = String(dateInput || "").trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate)) {
    const error = new Error("holidayDate must use YYYY-MM-DD format.");
    error.statusCode = 400;
    throw error;
  }

  const [year, month, day] = normalizedDate.split("-").map(Number);
  const holidayDate = new Date(Date.UTC(year, month - 1, day));

  if (
    holidayDate.getUTCFullYear() !== year ||
    holidayDate.getUTCMonth() !== month - 1 ||
    holidayDate.getUTCDate() !== day
  ) {
    const error = new Error("holidayDate must be a valid date.");
    error.statusCode = 400;
    throw error;
  }

  return holidayDate;
};

const formatHolidayResponse = (holiday) => ({
  createdAt: holiday.createdAt,
  holidayDate: new Date(holiday.holidayDate).toISOString().slice(0, 10),
  id: holiday._id.toString(),
  name: holiday.name,
});

const getHolidays = async (req, res, next) => {
  try {
    const holidays = await Holiday.find().sort({ holidayDate: 1 });

    res.status(200).json({
      success: true,
      message: "Holidays fetched successfully.",
      data: holidays.map(formatHolidayResponse),
    });
  } catch (error) {
    next(error);
  }
};

const saveHoliday = async (req, res, next) => {
  try {
    const { holidayDate: holidayDateInput, name } = req.body;
    const holidayDate = getHolidayDate(holidayDateInput);
    const holidayName = String(name || "").trim();

    if (!holidayName) {
      const error = new Error("name is required.");
      error.statusCode = 400;
      throw error;
    }

    const holiday = await Holiday.findOneAndUpdate(
      { holidayDate },
      {
        $set: {
          holidayDate,
          name: holidayName,
          createdBy: req.auth.userId,
        },
      },
      {
        new: true,
        runValidators: true,
        upsert: true,
      }
    );

    res.status(200).json({
      success: true,
      message: "Holiday saved successfully.",
      data: formatHolidayResponse(holiday),
    });
  } catch (error) {
    next(error);
  }
};

const deleteHoliday = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      const error = new Error("Holiday id must be valid.");
      error.statusCode = 400;
      throw error;
    }

    const holiday = await Holiday.findByIdAndDelete(id);

    if (!holiday) {
      const error = new Error("Holiday not found.");
      error.statusCode = 404;
      throw error;
    }

    res.status(200).json({
      success: true,
      message: "Holiday deleted successfully.",
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  deleteHoliday,
  getHolidays,
  saveHoliday,
};
