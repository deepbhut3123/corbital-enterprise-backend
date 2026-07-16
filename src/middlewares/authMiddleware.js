const { verifyAuthToken } = require("../utils/jwt");

const decodeOptionalAuth = (req, res, next) => {
  try {
    const authorizationHeader = req.headers.authorization || "";

    if (!authorizationHeader.startsWith("Bearer ")) {
      return next();
    }

    const token = authorizationHeader.slice(7).trim();
    req.auth = verifyAuthToken(token);
    return next();
  } catch (error) {
    error.statusCode = 401;
    error.message = "Invalid or expired token.";
    return next(error);
  }
};

const requireAuth = (req, res, next) => {
  try {
    const authorizationHeader = req.headers.authorization || "";

    if (!authorizationHeader.startsWith("Bearer ")) {
      const error = new Error("Authorization token is required.");
      error.statusCode = 401;
      throw error;
    }

    const token = authorizationHeader.slice(7).trim();
    req.auth = verifyAuthToken(token);
    return next();
  } catch (error) {
    if (!error.statusCode) {
      error.statusCode = 401;
      error.message = "Invalid or expired token.";
    }

    return next(error);
  }
};

const requireAdmin = (req, res, next) => {
  const roleId = String(req.auth?.roleId || "").trim().toLowerCase();

  if (roleId !== "1" && roleId !== "admin") {
    const error = new Error("Only admin can access this resource.");
    error.statusCode = 403;
    return next(error);
  }

  return next();
};

module.exports = {
  decodeOptionalAuth,
  requireAdmin,
  requireAuth,
};
