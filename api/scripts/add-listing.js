const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

const envFile = process.env.USE_LOCAL_ENV === "1" ? ".env.local" : ".env";
dotenv.config({ path: path.resolve(__dirname, "..", envFile) });

function getArg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  return process.argv[index + 1] || null;
}

async function main() {
  const fileArg = getArg("--file");
  if (!fileArg) {
    console.error("Missing --file argument.");
    console.error("Usage: npm run add:listing -- --file ./scripts/new-listing.example.json");
    process.exit(1);
  }

  const payloadPath = path.resolve(process.cwd(), fileArg);
  if (!fs.existsSync(payloadPath)) {
    console.error(`Payload file not found: ${payloadPath}`);
    process.exit(1);
  }

  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) {
    console.error("ADMIN_SECRET is missing in api/.env");
    process.exit(1);
  }

  const raw = fs.readFileSync(payloadPath, "utf8");
  const payload = JSON.parse(raw);
  const port = Number(process.env.PORT || 5050);
  const endpoint = process.env.ADMIN_API_URL || `http://127.0.0.1:${port}/api/admin/listings`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-admin-key": adminSecret,
    },
    body: JSON.stringify(payload),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("Request failed:", response.status, response.statusText);
    console.error(JSON.stringify(body, null, 2));
    process.exit(1);
  }

  console.log("Listing created:");
  console.log(JSON.stringify(body.data, null, 2));
}

main().catch((error) => {
  console.error("add-listing failed:", error);
  process.exit(1);
});
