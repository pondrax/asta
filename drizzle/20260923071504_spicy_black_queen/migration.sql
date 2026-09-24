CREATE VIEW "daily_statistics" AS (
  WITH
    dt AS (
      SELECT date_trunc('day', created)::date AS date FROM document_statistics WHERE created IS NOT NULL
      UNION SELECT date_trunc('day', created)::date FROM documents WHERE created IS NOT NULL
      UNION SELECT date_trunc('day', created)::date FROM users WHERE created IS NOT NULL
      UNION SELECT date_trunc('day', created)::date FROM signers WHERE created IS NOT NULL
      UNION SELECT date_trunc('day', created)::date FROM helpdesk WHERE created IS NOT NULL
      UNION SELECT date_trunc('day', created)::date FROM survey_responses WHERE created IS NOT NULL
    ),
    ds AS (
      SELECT
        date_trunc('day', created)::date AS date,
        COALESCE(SUM(value) FILTER (WHERE type = 'signed'), 0)::int          AS signed,
        COALESCE(SUM(value) FILTER (WHERE type = 'verified'), 0)::int        AS verified,
        COALESCE(SUM(value) FILTER (WHERE type = 'new-request'), 0)::int     AS new_request,
        COALESCE(SUM(value) FILTER (WHERE type = 'reset-email'), 0)::int     AS reset_email,
        COALESCE(SUM(value) FILTER (WHERE type = 'reset-passphrase'), 0)::int AS reset_passphrase
      FROM document_statistics
      WHERE created IS NOT NULL
      GROUP BY 1
    ),
    d AS (
      SELECT
        date_trunc('day', created)::date AS date,
        COUNT(*)::int AS documents,
        COALESCE(COUNT(*) FILTER (WHERE status = 'signed'), 0)::int AS doc_signed,
        COALESCE(COUNT(*) FILTER (WHERE status = 'draft'), 0)::int  AS doc_draft,
        COALESCE(COUNT(*) FILTER (WHERE status = 'queue'), 0)::int  AS doc_queue,
        COALESCE(COUNT(*) FILTER (WHERE status = 'failed'), 0)::int AS doc_failed
      FROM documents
      WHERE created IS NOT NULL
      GROUP BY 1
    ),
    u AS (
      SELECT date_trunc('day', created)::date AS date, COUNT(*)::int AS new_users
      FROM users WHERE created IS NOT NULL GROUP BY 1
    ),
    sg AS (
      SELECT date_trunc('day', created)::date AS date, COUNT(*)::int AS new_signers
      FROM signers WHERE created IS NOT NULL GROUP BY 1
    ),
    h AS (
      SELECT
        date_trunc('day', created)::date AS date,
        COUNT(*)::int AS tickets,
        COALESCE(COUNT(*) FILTER (WHERE status = 'completed'), 0)::int AS tickets_completed
      FROM helpdesk WHERE created IS NOT NULL GROUP BY 1
    ),
    sv AS (
      SELECT
        date_trunc('day', created)::date AS date,
        COUNT(*)::int AS surveys,
        ROUND(AVG(rating)::numeric, 2)::text AS avg_rating
      FROM survey_responses WHERE created IS NOT NULL GROUP BY 1
    )
  SELECT
    dt.date,
    COALESCE(ds.signed, 0)            AS signed,
    COALESCE(ds.verified, 0)          AS verified,
    COALESCE(ds.new_request, 0)       AS new_request,
    COALESCE(ds.reset_email, 0)       AS reset_email,
    COALESCE(ds.reset_passphrase, 0)  AS reset_passphrase,
    COALESCE(d.documents, 0)          AS documents,
    COALESCE(d.doc_signed, 0)         AS doc_signed,
    COALESCE(d.doc_draft, 0)          AS doc_draft,
    COALESCE(d.doc_queue, 0)          AS doc_queue,
    COALESCE(d.doc_failed, 0)         AS doc_failed,
    COALESCE(u.new_users, 0)          AS new_users,
    COALESCE(sg.new_signers, 0)       AS new_signers,
    COALESCE(h.tickets, 0)            AS tickets,
    COALESCE(h.tickets_completed, 0)  AS tickets_completed,
    COALESCE(sv.surveys, 0)           AS surveys,
    sv.avg_rating                     AS avg_rating
  FROM dt
  LEFT JOIN ds ON ds.date = dt.date
  LEFT JOIN d  ON d.date  = dt.date
  LEFT JOIN u  ON u.date  = dt.date
  LEFT JOIN sg ON sg.date = dt.date
  LEFT JOIN h  ON h.date  = dt.date
  LEFT JOIN sv ON sv.date = dt.date
  ORDER BY dt.date DESC
);