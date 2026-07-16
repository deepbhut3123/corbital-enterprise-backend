const connectDB = require("../src/config/db");
const app = require("../src/app");

let cachedConnectionPromise;

const ensureDatabaseConnection = async () => {
  if (!cachedConnectionPromise) {
    cachedConnectionPromise = connectDB().catch((error) => {
      cachedConnectionPromise = null;
      throw error;
    });
  }

  await cachedConnectionPromise;
};

module.exports = async (req, res) => {
  await ensureDatabaseConnection();
  return app(req, res);
};
