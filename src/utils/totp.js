const crypto = require("crypto");

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

const base32Encode = (buffer) => {
  let bits = 0;
  let value = 0;
  let output = "";

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
};

const base32Decode = (input) => {
  const normalized = String(input || "")
    .toUpperCase()
    .replace(/=+$/g, "")
    .replace(/[^A-Z2-7]/g, "");

  let bits = 0;
  let value = 0;
  const bytes = [];

  for (const char of normalized) {
    const index = BASE32_ALPHABET.indexOf(char);

    if (index === -1) {
      continue;
    }

    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
};

const buildCounterBuffer = (counter) => {
  const buffer = Buffer.alloc(8);
  const high = Math.floor(counter / 0x100000000);
  const low = counter >>> 0;

  buffer.writeUInt32BE(high, 0);
  buffer.writeUInt32BE(low, 4);

  return buffer;
};

const generateTotpCode = (secret, time = Date.now(), step = 30, digits = 6) => {
  const counter = Math.floor(time / 1000 / step);
  const key = base32Decode(secret);
  const hmac = crypto
    .createHmac("sha1", key)
    .update(buildCounterBuffer(counter))
    .digest();

  const offset = hmac[hmac.length - 1] & 15;
  const binary =
    ((hmac[offset] & 127) << 24) |
    ((hmac[offset + 1] & 255) << 16) |
    ((hmac[offset + 2] & 255) << 8) |
    (hmac[offset + 3] & 255);

  return String(binary % 10 ** digits).padStart(digits, "0");
};

const verifyTotpToken = (token, secret, window = 1) => {
  const normalizedToken = String(token || "").replace(/\s+/g, "");

  if (!/^\d{6}$/.test(normalizedToken) || !secret) {
    return false;
  }

  for (let offset = -window; offset <= window; offset += 1) {
    const time = Date.now() + offset * 30000;

    if (generateTotpCode(secret, time) === normalizedToken) {
      return true;
    }
  }

  return false;
};

const generateAuthenticatorSecret = (size = 20) =>
  base32Encode(crypto.randomBytes(size));

const generateOtpAuthUrl = ({ issuer, accountName, secret }) =>
  `otpauth://totp/${encodeURIComponent(`${issuer}:${accountName}`)}?secret=${encodeURIComponent(
    secret
  )}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;

module.exports = {
  generateAuthenticatorSecret,
  generateOtpAuthUrl,
  verifyTotpToken,
};
