-- Auth Database Diagnostics Script
-- Run this to identify email duplication or other auth issues

-- 1. Check for duplicate emails in users table
-- This should return 0 rows if emails are unique
SELECT email, COUNT(*) as count
FROM users
GROUP BY email
HAVING COUNT(*) > 1;

-- 2. Check total number of users
SELECT COUNT(*) as total_users FROM users;

-- 3. List all users (for reference)
SELECT id, email, name, created_at FROM users ORDER BY created_at DESC;

-- 4. Check for stale verification entries (older than 24 hours)
SELECT id, identifier, value, expires_at 
FROM verification 
WHERE created_at < now() - interval '24 hours'
ORDER BY created_at DESC;

-- 5. Check account entries (OAuth accounts)
SELECT a.id, a.provider_id, u.email, a.created_at
FROM account a
LEFT JOIN users u ON a.user_id = u.id
ORDER BY a.created_at DESC;

-- If you need to clean up:/
-- DELETE FROM verification WHERE expires_at < now();
-- DELETE FROM verification WHERE created_at < now() - interval '24 hours';
-- DELETE FROM account WHERE user_id IN (SELECT id FROM users WHERE role = 'contributor' AND email LIKE '%test%');
-- DELETE FROM session WHERE user_id IN (SELECT id FROM users WHERE role = 'contributor' AND email LIKE '%test%'); 
-- DELETE FROM users WHERE role = 'contributor' AND email LIKE '%test%';
