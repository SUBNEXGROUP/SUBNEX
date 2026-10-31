-- 100b — run right after 100_openai_ads.sql. Safe to run twice. Sends nothing: enabled stays false.
-- Pixel ID: source "SUBNEX Website". Conversion in Ads Manager: "Book a Collection", base event lead_created,
-- customer_action, click window 30 days, view window 1 day.
update subnex_private.oai_config
   set pixel_id = 'Y5LYCUtwkb364pVTgAgeaQ',
       test_email = 'collections+oaitest@subnex.co.uk'
 where singleton;

select enabled, pixel_id, validate_only, test_email, test_validate_only from subnex_private.oai_config;
-- Expected: false | Y5LYCUtwkb364pVTgAgeaQ | true | collections+oaitest@subnex.co.uk | true
