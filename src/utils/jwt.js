const jwt = require("jsonwebtoken");

const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("JWT_SECRET is not defined in environment variables.");
  }

  return secret;
};

const signAuthToken = (payload) => {
  const expiresIn = (process.env.JWT_EXPIRES_IN || "").trim();
  const secret = getJwtSecret();

  if (expiresIn) {
    return jwt.sign(payload, secret, { expiresIn });
  }

  return jwt.sign(payload, secret);
};

const verifyAuthToken = (token) => {
  return jwt.verify(token, getJwtSecret());
};

module.exports = {
  signAuthToken,
  verifyAuthToken,
};
