
CREATE OR REPLACE FUNCTION public.find_matches()
RETURNS void
LANGUAGE plpgsql
AS $function$
BEGIN
  -- Insert matches between flights and requests
  INSERT INTO matches (flight_id, request_id, traveler_id, shipper_id, match_score, status)
  SELECT
    f.id as flight_id,
    r.id as request_id,
    f.user_id as traveler_id,
    r.user_id as shipper_id,
    GREATEST(0, LEAST(100, (
      -- Route match: 60 points
      CASE WHEN f.from_code = r.from_code AND f.to_code = r.to_code THEN 60
           WHEN f.from_city = r.from_city AND f.to_city = r.to_city THEN 50
           ELSE 0 END
      +
      -- Date proximity: up to 20 points
      CASE WHEN f.flight_date = r.needed_by THEN 20
           WHEN ABS(f.flight_date - r.needed_by) <= 2 THEN 15
           WHEN ABS(f.flight_date - r.needed_by) <= 7 THEN 10
           ELSE 5 END
      +
      -- Weight capacity: up to 20 points
      CASE WHEN f.available_kg >= r.weight_kg THEN 20
           WHEN f.available_kg >= r.weight_kg * 0.8 THEN 10
           ELSE 0 END
      -
      -- Expectation mismatch: shipper needs Shop & Ship but traveler doesn't offer it
      CASE WHEN r.requires_purchase = true AND f.delivery_type IS DISTINCT FROM 'both' THEN 25
           ELSE 0 END
    ))) as match_score,
    'pending' as status
  FROM flights f
  JOIN shipment_requests r ON (
    (f.from_code = r.from_code AND f.to_code = r.to_code)
    OR (f.from_city = r.from_city AND f.to_city = r.to_city)
  )
  WHERE
    f.status = 'active'
    AND r.status = 'open'
    AND f.user_id != r.user_id
    AND f.flight_date >= CURRENT_DATE
    AND (r.needed_by IS NULL OR f.flight_date <= r.needed_by + 7)
    AND f.available_kg >= r.weight_kg * 0.5
    AND NOT EXISTS (
      SELECT 1 FROM matches m
      WHERE m.flight_id = f.id
      AND m.request_id = r.id
      AND m.status != 'rejected'
    );
END;
$function$;
