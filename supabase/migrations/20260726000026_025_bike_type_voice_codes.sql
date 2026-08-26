CREATE SEQUENCE IF NOT EXISTS bike_m_voice_code_seq START WITH 1;
CREATE SEQUENCE IF NOT EXISTS bike_f_voice_code_seq START WITH 1;

WITH numbered AS (
    SELECT
        id,
        CASE WHEN LOWER(type) = 'fat' THEN 'f' ELSE 'm' END
            || ROW_NUMBER() OVER (
                PARTITION BY CASE WHEN LOWER(type) = 'fat' THEN 'f' ELSE 'm' END
                ORDER BY voice_code, model, id
            ) AS new_voice_code
    FROM bikes
)
UPDATE bikes
SET voice_code = numbered.new_voice_code
FROM numbered
WHERE bikes.id = numbered.id;

DO $$
DECLARE
    mtb_count BIGINT;
    fat_count BIGINT;
BEGIN
    SELECT COUNT(*) INTO mtb_count FROM bikes WHERE LOWER(type) <> 'fat' OR type IS NULL;
    SELECT COUNT(*) INTO fat_count FROM bikes WHERE LOWER(type) = 'fat';

    IF mtb_count > 0 THEN
        PERFORM setval('bike_m_voice_code_seq', mtb_count, TRUE);
    ELSE
        PERFORM setval('bike_m_voice_code_seq', 1, FALSE);
    END IF;

    IF fat_count > 0 THEN
        PERFORM setval('bike_f_voice_code_seq', fat_count, TRUE);
    ELSE
        PERFORM setval('bike_f_voice_code_seq', 1, FALSE);
    END IF;
END;
$$;

ALTER TABLE bikes
ALTER COLUMN voice_code DROP DEFAULT;

CREATE OR REPLACE FUNCTION assign_bike_voice_code()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.voice_code IS NULL OR BTRIM(NEW.voice_code) = '' THEN
        IF LOWER(NEW.type) = 'fat' THEN
            NEW.voice_code = 'f' || nextval('bike_f_voice_code_seq');
        ELSE
            NEW.voice_code = 'm' || nextval('bike_m_voice_code_seq');
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bikes_assign_voice_code ON bikes;
CREATE TRIGGER bikes_assign_voice_code
BEFORE INSERT ON bikes
FOR EACH ROW
EXECUTE FUNCTION assign_bike_voice_code();
