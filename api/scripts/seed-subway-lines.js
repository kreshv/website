const path = require("path");
const dotenv = require("dotenv");
const { PrismaClient } = require("@prisma/client");

const envFile = process.env.USE_LOCAL_ENV === "1" ? ".env.local" : ".env";
dotenv.config({ path: path.resolve(__dirname, "..", envFile) });

const prisma = new PrismaClient();

const subwayLines = [
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "J",
  "L",
  "M",
  "N",
  "Q",
  "R",
  "S",
  "W",
  "Z",
  "SI",
  "SIR",
];

async function main() {
  await prisma.subwayLine.createMany({
    data: subwayLines.map((lineCode) => ({ lineCode })),
    skipDuplicates: true,
  });

  const count = await prisma.subwayLine.count();
  console.log(`Subway lines seeded. Current total lines: ${count}`);
}

main()
  .catch((error) => {
    console.error("seed-subway-lines failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
