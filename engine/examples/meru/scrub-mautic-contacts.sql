-- Run on the STAGING Mautic database (container stg-meru-mautic-db-1) right after any copy from
-- live, before staging starts. Keeps only the company's internal test contacts mailable: every
-- other contact loses its email and phone. NOT RUN YET.
-- Replace the list with staging's GATEWAY_RECIPIENT_ALLOWLIST (= live's GATEWAY_CAP_EXEMPT_RECIPIENTS),
-- lower-case. Add the table prefix from staging's local.php if it has one.
SET @keep = '<a@example.com>,<b@example.com>';

UPDATE leads
   SET email = NULL, phone = NULL, mobile = NULL,
       firstname = CONCAT('Test', id), lastname = 'Contact'
 WHERE email IS NOT NULL
   AND FIND_IN_SET(LOWER(email), @keep) = 0;

-- Nothing queued from live may go out.
DELETE FROM message_queue;

-- Must print 0 (the same check the deploy guard runs).
SELECT COUNT(*) AS not_on_allowlist FROM leads
 WHERE email IS NOT NULL AND email <> '' AND FIND_IN_SET(LOWER(email), @keep) = 0;
