-- Normalize history device_id values to lowercase for consistent ordering and comparisons
UPDATE task_description_history
SET device_id = lower(device_id)
WHERE device_id IS NOT NULL
  AND device_id != lower(device_id);

UPDATE file_selection_history
SET device_id = lower(device_id)
WHERE device_id IS NOT NULL
  AND device_id != lower(device_id);
