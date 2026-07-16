const Target = require("../models/Target");
const User = require("../models/User");

const getValidatedMonthYear = (monthInput, yearInput) => {
  const month = Number(monthInput);
  const year = Number(yearInput);

  if (!Number.isInteger(month) || month < 1 || month > 12) {
    const error = new Error("month must be between 1 and 12.");
    error.statusCode = 400;
    throw error;
  }

  if (!Number.isInteger(year) || year < 2000) {
    const error = new Error("year must be a valid 4 digit year.");
    error.statusCode = 400;
    throw error;
  }

  return {
    month,
    year,
  };
};

const formatTargetResponse = target => ({
  id: target._id.toString(),
  userId: target.userId?._id
    ? target.userId._id.toString()
    : target.userId.toString(),
  username: target.userId?.username || "",
  userEmail: target.userId?.email || "",
  month: target.month,
  year: target.year,
  amount: target.amount,
  setById: target.setBy?._id ? target.setBy._id.toString() : target.setBy.toString(),
  setByName: target.setBy?.username || null,
});

const populateTarget = query =>
  query.populate("userId", "username email").populate("setBy", "username");

const saveTarget = async (req, res, next) => {
  try {
    const { userId, month: monthInput, year: yearInput, amount } = req.body;

    if (!userId || amount === undefined || amount === null) {
      const error = new Error("userId and amount are required.");
      error.statusCode = 400;
      throw error;
    }

    const { month, year } = getValidatedMonthYear(monthInput, yearInput);
    const parsedAmount = Number(amount);

    if (Number.isNaN(parsedAmount) || parsedAmount < 0) {
      const error = new Error("amount must be a valid positive number.");
      error.statusCode = 400;
      throw error;
    }

    const user = await User.findById(userId);

    if (!user) {
      const error = new Error("Selected user not found.");
      error.statusCode = 404;
      throw error;
    }

    const savedTarget = await populateTarget(
      Target.findOneAndUpdate(
        {
          userId,
          month,
          year,
        },
        {
          amount: parsedAmount,
          setBy: req.auth.userId,
          userId,
          month,
          year,
        },
        {
          new: true,
          runValidators: true,
          upsert: true,
        }
      )
    );

    res.status(200).json({
      success: true,
      message: "Target saved successfully.",
      data: formatTargetResponse(savedTarget),
    });
  } catch (error) {
    next(error);
  }
};

const getTargets = async (req, res, next) => {
  try {
    const targets = await populateTarget(
      Target.find().sort({ year: -1, month: -1, createdAt: -1 })
    );

    res.status(200).json({
      success: true,
      message: "Targets fetched successfully.",
      data: targets.map(formatTargetResponse),
    });
  } catch (error) {
    next(error);
  }
};

const getMyTarget = async (req, res, next) => {
  try {
    const now = new Date();
    const fallbackMonth = now.getMonth() + 1;
    const fallbackYear = now.getFullYear();
    const { month, year } = getValidatedMonthYear(
      req.query.month || fallbackMonth,
      req.query.year || fallbackYear
    );

    const target = await populateTarget(
      Target.findOne({
        month,
        userId: req.auth.userId,
        year,
      })
    );

    res.status(200).json({
      success: true,
      message: target
        ? "Target fetched successfully."
        : "No target found for this month.",
      data: target ? formatTargetResponse(target) : null,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getMyTarget,
  getTargets,
  saveTarget,
};
