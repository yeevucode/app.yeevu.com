# Innovation Backlog

## Scan Data Filter & Bulk Delete

**Idea:** A filter + bulk delete tool in the admin dashboard for managing scan event records.

**UX:**
- Search input in a "Scan Data" management section
- Filter matches against `auth_status` (type "anonymous") and `user_email` (type an email)
- Shows count of matching rows ("847 records match")
- "Delete matching" button with a confirmation step before executing

**Examples:**
- Type `anonymous` → deletes all `auth_status = 'anonymous'` scan events
- Type a user email → deletes all scans for that specific user
- Optionally scope by age (e.g. "older than 30 days") to preserve recent data

**Scope:** `scan_events` table only (not `project_saves`)

**API:** New `DELETE /api/admin/scans` endpoint accepting `{ filter, olderThanDays? }`

**Why not yet:** Low urgency while user volume is small; revisit when table grows noisy.
