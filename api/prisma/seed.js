const { PrismaClient, FeatureType, PetsPolicy } = require("@prisma/client");

const prisma = new PrismaClient();

const boroughNeighborhoods = {
  Manhattan: [
    "Battery Park City",
    "Bowery",
    "Chelsea",
    "Chinatown",
    "East Harlem",
    "East Village",
    "Financial District",
    "Flatiron",
    "Gramercy",
    "Greenwich Village",
    "Hamilton Heights",
    "Harlem",
    "Hell's Kitchen",
    "Inwood",
    "Kips Bay",
    "Lenox Hill",
    "Little Italy",
    "Lower East Side",
    "Morningside Heights",
    "Murray Hill",
    "NoHo",
    "NoMad",
    "SoHo",
    "Tribeca",
    "Two Bridges",
    "Upper East Side",
    "Upper West Side",
    "Washington Heights",
    "West Village",
  ],
  Brooklyn: [
    "Bushwick",
    "Bedford-Stuyvesant",
    "Boerum Hill",
    "Brooklyn Heights",
    "Carroll Gardens",
    "Clinton Hill",
    "Cobble Hill",
    "Crown Heights",
    "Downtown Brooklyn",
    "DUMBO",
    "East New York",
    "Flatbush",
    "Fort Greene",
    "Gowanus",
    "Greenpoint",
    "Kensington",
    "Midwood",
    "Park Slope",
    "Prospect Heights",
    "Prospect Lefferts Gardens",
    "Red Hook",
    "Sunset Park",
    "Williamsburg",
  ],
  Queens: [
    "Astoria",
    "Bayside",
    "Bellerose",
    "Briarwood",
    "College Point",
    "Corona",
    "Elmhurst",
    "Far Rockaway",
    "Flushing",
    "Forest Hills",
    "Fresh Meadows",
    "Jackson Heights",
    "Jamaica",
    "Kew Gardens",
    "Long Island City",
    "Maspeth",
    "Middle Village",
    "Rego Park",
    "Ridgewood",
    "Sunnyside",
    "Woodside",
  ],
  Bronx: [
    "Allerton",
    "Belmont",
    "Concourse",
    "Fordham",
    "Kingsbridge",
    "Morris Park",
    "Mott Haven",
    "Parkchester",
    "Pelham Bay",
    "Riverdale",
    "Soundview",
    "Throgs Neck",
    "University Heights",
    "Wakefield",
    "Woodlawn",
  ],
  "Staten Island": [
    "Arrochar",
    "Clifton",
    "Grant City",
    "Great Kills",
    "New Dorp",
    "Port Richmond",
    "Rosebank",
    "St. George",
    "Stapleton",
    "Tottenville",
    "West Brighton",
    "Westerleigh",
  ],
};

const unitFeatures = [
  "Balcony",
  "City View",
  "Private Patio",
  "Storage",
  "Terrace",
  "Dishwasher",
  "Washer/Dryer",
  "Hardwood Floors",
  "Central Air",
  "Stainless Steel Appliances",
  "Microwave",
  "Renovated Kitchen",
  "Renovated Bathroom",
  "High Ceilings",
  "Floor-to-Ceiling Windows",
  "Smart Thermostat",
  "Walk-in Closet",
  "Home Office Nook",
];

const buildingFeatures = [
  "Doorman",
  "Elevator",
  "Gym",
  "Roof Deck",
  "Package Room",
  "Bike Storage",
  "Parking",
  "Laundry Room",
  "Concierge",
  "Resident Lounge",
  "Children's Playroom",
  "Co-working Space",
  "Pet Spa",
  "Pool",
  "Sauna",
  "Virtual Doorman",
];

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
];

const listingSeeds = [
  {
    title: "Bright 1BR near Jefferson L",
    address: "148 Bleecker Street",
    price: 2650,
    beds: 1,
    baths: 1,
    borough: "Brooklyn",
    neighborhood: "Bushwick",
    petsPolicy: PetsPolicy.ALLOWED,
    unitFeatures: ["Dishwasher", "Hardwood Floors"],
    buildingFeatures: ["Roof Deck", "Bike Storage"],
    subwayLines: ["L", "M"],
  },
  {
    title: "Ridgewood 2BR with natural light",
    price: 2780,
    beds: 2,
    baths: 1,
    borough: "Queens",
    neighborhood: "Ridgewood",
    petsPolicy: PetsPolicy.CASE_BY_CASE,
    unitFeatures: ["Dishwasher", "Washer/Dryer"],
    buildingFeatures: ["Package Room"],
    subwayLines: ["M", "L"],
  },
  {
    title: "Williamsburg 1BR with gym access",
    price: 2800,
    beds: 1,
    baths: 1,
    borough: "Brooklyn",
    neighborhood: "Williamsburg",
    petsPolicy: PetsPolicy.ALLOWED,
    unitFeatures: ["Balcony", "Hardwood Floors"],
    buildingFeatures: ["Gym", "Doorman", "Elevator"],
    subwayLines: ["L", "G"],
  },
  {
    title: "Astoria studio with balcony",
    price: 2300,
    beds: 0,
    baths: 1,
    borough: "Queens",
    neighborhood: "Astoria",
    petsPolicy: PetsPolicy.CATS_ONLY,
    unitFeatures: ["Balcony", "Dishwasher"],
    buildingFeatures: ["Elevator"],
    subwayLines: ["N", "W"],
  },
  {
    title: "Chelsea 1BR full-service building",
    price: 3950,
    beds: 1,
    baths: 1,
    borough: "Manhattan",
    neighborhood: "Chelsea",
    petsPolicy: PetsPolicy.DOGS_ONLY,
    unitFeatures: ["Washer/Dryer", "Central Air"],
    buildingFeatures: ["Doorman", "Gym", "Package Room"],
    subwayLines: ["A", "C", "E"],
  },
  {
    title: "Riverdale 2BR with parking",
    price: 2450,
    beds: 2,
    baths: 1,
    borough: "Bronx",
    neighborhood: "Riverdale",
    petsPolicy: PetsPolicy.NOT_ALLOWED,
    unitFeatures: ["Hardwood Floors", "Walk-in Closet"],
    buildingFeatures: ["Parking", "Elevator"],
    subwayLines: ["1"],
  },
  {
    title: "Greenpoint 1BR with rooftop lounge",
    address: "77 Eagle Street",
    price: 3325,
    beds: 1,
    baths: 1,
    borough: "Brooklyn",
    neighborhood: "Greenpoint",
    petsPolicy: PetsPolicy.ALLOWED,
    unitFeatures: ["Dishwasher", "High Ceilings"],
    buildingFeatures: ["Roof Deck", "Resident Lounge", "Elevator"],
    subwayLines: ["G"],
  },
  {
    title: "Long Island City studio corner unit",
    address: "23 Jackson Avenue",
    price: 2990,
    beds: 0,
    baths: 1,
    borough: "Queens",
    neighborhood: "Long Island City",
    petsPolicy: PetsPolicy.CATS_ONLY,
    unitFeatures: ["City View", "Stainless Steel Appliances"],
    buildingFeatures: ["Doorman", "Gym", "Package Room"],
    subwayLines: ["7", "E"],
  },
  {
    title: "Upper West Side 2BR classic",
    address: "215 West 84th Street",
    price: 4650,
    beds: 2,
    baths: 1,
    borough: "Manhattan",
    neighborhood: "Upper West Side",
    petsPolicy: PetsPolicy.CASE_BY_CASE,
    unitFeatures: ["Hardwood Floors", "Dishwasher"],
    buildingFeatures: ["Elevator", "Laundry Room"],
    subwayLines: ["1", "B", "C"],
  },
  {
    title: "Astoria 1BR with terrace",
    address: "31-44 29th Street",
    price: 2875,
    beds: 1,
    baths: 1,
    borough: "Queens",
    neighborhood: "Astoria",
    petsPolicy: PetsPolicy.ALLOWED,
    unitFeatures: ["Terrace", "Washer/Dryer"],
    buildingFeatures: ["Bike Storage", "Virtual Doorman"],
    subwayLines: ["N", "W"],
  },
  {
    title: "Park Slope 2BR near Prospect Park",
    address: "512 7th Avenue",
    price: 3890,
    beds: 2,
    baths: 2,
    borough: "Brooklyn",
    neighborhood: "Park Slope",
    petsPolicy: PetsPolicy.DOGS_ONLY,
    unitFeatures: ["Dishwasher", "Walk-in Closet"],
    buildingFeatures: ["Elevator", "Package Room", "Gym"],
    subwayLines: ["F", "G", "R"],
  },
  {
    title: "Murray Hill 1BR renovated",
    address: "140 East 39th Street",
    price: 3520,
    beds: 1,
    baths: 1,
    borough: "Manhattan",
    neighborhood: "Murray Hill",
    petsPolicy: PetsPolicy.ALLOWED,
    unitFeatures: ["Renovated Kitchen", "Central Air"],
    buildingFeatures: ["Doorman", "Laundry Room", "Concierge"],
    subwayLines: ["4", "5", "6"],
  },
];

async function seedLookups() {
  for (const boroughName of Object.keys(boroughNeighborhoods)) {
    await prisma.borough.upsert({
      where: { name: boroughName },
      update: {},
      create: { name: boroughName },
    });
  }

  const boroughs = await prisma.borough.findMany();
  const boroughByName = Object.fromEntries(boroughs.map((b) => [b.name, b]));

  for (const [boroughName, neighborhoods] of Object.entries(boroughNeighborhoods)) {
    for (const neighborhoodName of neighborhoods) {
      await prisma.neighborhood.upsert({
        where: {
          boroughId_name: {
            boroughId: boroughByName[boroughName].id,
            name: neighborhoodName,
          },
        },
        update: {},
        create: {
          name: neighborhoodName,
          boroughId: boroughByName[boroughName].id,
        },
      });
    }
  }

  await prisma.feature.createMany({
    data: unitFeatures.map((name) => ({ name, featureType: FeatureType.UNIT })),
    skipDuplicates: true,
  });

  await prisma.feature.createMany({
    data: buildingFeatures.map((name) => ({ name, featureType: FeatureType.BUILDING })),
    skipDuplicates: true,
  });

  await prisma.subwayLine.createMany({
    data: subwayLines.map((lineCode) => ({ lineCode })),
    skipDuplicates: true,
  });
}

async function seedListings() {
  const [boroughs, neighborhoods, features, lines] = await Promise.all([
    prisma.borough.findMany(),
    prisma.neighborhood.findMany(),
    prisma.feature.findMany(),
    prisma.subwayLine.findMany(),
  ]);

  const boroughByName = Object.fromEntries(boroughs.map((b) => [b.name, b.id]));
  const neighborhoodByKey = Object.fromEntries(
    neighborhoods.map((n) => [`${n.name}|${n.boroughId}`, n.id]),
  );
  const featureByKey = Object.fromEntries(
    features.map((f) => [`${f.featureType}|${f.name}`, f.id]),
  );
  const lineByCode = Object.fromEntries(lines.map((line) => [line.lineCode, line.id]));

  for (const listing of listingSeeds) {
    const boroughId = boroughByName[listing.borough];
    const neighborhoodId = neighborhoodByKey[`${listing.neighborhood}|${boroughId}`];

    const existing = await prisma.listing.findFirst({
      where: {
        title: listing.title,
        boroughId,
        neighborhoodId,
      },
      select: { id: true },
    });

    const listingRecord = existing
      ? await prisma.listing.update({
          where: { id: existing.id },
          data: {
            address: listing.address ?? null,
          },
        })
      : await prisma.listing.create({
          data: {
            title: listing.title,
            address: listing.address ?? null,
            price: listing.price,
            beds: listing.beds,
            baths: listing.baths,
            boroughId,
            neighborhoodId,
            petsPolicy: listing.petsPolicy,
            isActive: true,
          },
        });

    const allFeatures = [
      ...listing.unitFeatures.map((name) => ({ type: FeatureType.UNIT, name })),
      ...listing.buildingFeatures.map((name) => ({ type: FeatureType.BUILDING, name })),
    ];

    for (const f of allFeatures) {
      const featureId = featureByKey[`${f.type}|${f.name}`];
      if (!featureId) continue;

      await prisma.listingFeature.upsert({
        where: {
          listingId_featureId: {
            listingId: listingRecord.id,
            featureId,
          },
        },
        update: {},
        create: {
          listingId: listingRecord.id,
          featureId,
        },
      });
    }

    for (const lineCode of listing.subwayLines) {
      let subwayLineId = lineByCode[lineCode];

      if (!subwayLineId) {
        const createdLine = await prisma.subwayLine.create({ data: { lineCode } });
        subwayLineId = createdLine.id;
        lineByCode[lineCode] = subwayLineId;
      }

      await prisma.listingSubwayLine.upsert({
        where: {
          listingId_subwayLineId: {
            listingId: listingRecord.id,
            subwayLineId,
          },
        },
        update: {},
        create: {
          listingId: listingRecord.id,
          subwayLineId,
        },
      });
    }
  }
}

async function main() {
  await seedLookups();
  await seedListings();
}

main()
  .then(async () => {
    await prisma.$disconnect();
    console.log("Seed completed.");
  })
  .catch(async (err) => {
    console.error("Seed failed:", err);
    await prisma.$disconnect();
    process.exit(1);
  });
