-- Run on the STAGING Mautic database right after any copy from live, before staging starts.
-- Replaces every contact address with an owner test address so staging can never reach a real
-- person. NOT RUN YET. Replace <owner-test-local> and <owner-test-domain> first.
-- Table/column names are Mautic 5 defaults; check the table prefix in staging's local.php.
UPDATE leads
   SET email     = CONCAT('<owner-test-local>+c', id, '@<owner-test-domain>'),
       phone     = NULL,
       mobile    = NULL,
       firstname = CONCAT('Test', id),
       lastname  = 'Contact'
 WHERE email IS NOT NULL;
-- Nothing should be queued from live.
DELETE FROM message_queue;
-- Check: must print 0.
SELECT COUNT(*) AS non_test_contacts FROM leads
 WHERE email IS NOT NULL AND email NOT LIKE '%@<owner-test-domain>';
