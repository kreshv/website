ALTER TABLE "Listing"
ADD CONSTRAINT "listing_price_range_check"
CHECK ("price" >= 1500 AND "price" <= 10000);
