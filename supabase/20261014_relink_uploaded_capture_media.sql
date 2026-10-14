-- 14 Oct 2026 (applied to the live project by Claude via Supabase MCP; 30 rows updated).
-- Every video/voice file uploaded under v4/<org>/<session>/<capture>/ had reached storage, but its captures row
-- still had media_path null (the row was sent before the upload finished and never re-sent), so no other phone
-- could find the file. This links each existing file to its capture. Only fills empty paths; nothing is removed.
-- The app now re-sends the row once its upload finishes (app.js C.uploadMedia / C.relinkMedia).
update captures c set media_path = o.name, updated_at = now()
from storage.objects o
where o.bucket_id = 'swimming-media' and o.name like 'v4/%'
  and c.id = split_part(o.name, '/', 4) and c.media_path is null;
