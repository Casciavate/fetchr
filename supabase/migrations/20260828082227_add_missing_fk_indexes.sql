
CREATE INDEX IF NOT EXISTS idx_matches_request_id ON public.matches(request_id);
CREATE INDEX IF NOT EXISTS idx_matches_traveler_id ON public.matches(traveler_id);
CREATE INDEX IF NOT EXISTS idx_matches_shipper_id ON public.matches(shipper_id);
CREATE INDEX IF NOT EXISTS idx_matches_cancel_requested_by ON public.matches(cancel_requested_by);
CREATE INDEX IF NOT EXISTS idx_flights_user_id ON public.flights(user_id);
CREATE INDEX IF NOT EXISTS idx_shipment_requests_user_id ON public.shipment_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_match_id ON public.messages(match_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON public.messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_match_declines_user_id ON public.match_declines(user_id);
CREATE INDEX IF NOT EXISTS idx_cancellation_requests_match_id ON public.cancellation_requests(match_id);
CREATE INDEX IF NOT EXISTS idx_cancellation_requests_requested_by ON public.cancellation_requests(requested_by);
