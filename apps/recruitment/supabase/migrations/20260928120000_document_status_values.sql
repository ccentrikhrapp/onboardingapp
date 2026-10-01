-- New pre-offer document outcomes (run before 20260928120100 — enum values must be committed before use):
--   not_applicable   the system worked out this document doesn't apply to this candidate (e.g. a fresher's previous-employer papers)
--   reason_approved  "Cannot provide" + reason, and the reason was accepted
--   na_accepted      "Not applicable" accepted by the reviewer
alter type document_status add value if not exists 'not_applicable';
alter type document_status add value if not exists 'reason_approved';
alter type document_status add value if not exists 'na_accepted';
