# B4: Compliance report

Boomi process **PatchPilot B4 - Compliance Report**. It reads `public.compliance_log` in Supabase (query Q6) and returns the audit report the Compliance page shows.

## Endpoint
`GET https://c01-sg.integrate.boomi.com/ws/simple/getPatchpilotcompliance?client_name=<name>&from=YYYY-MM-DD`
(Basic auth, shared web server user. No body.)

## Request and response
It always answers HTTP 200 with JSON:

| Case | Body |
|---|---|
| OK | `{"client_name":"Acme Retail","from":"2026-10-01","items":[{compliance_log_id, cve_id, package, priority, detected_at, fixed_at, time_to_fix_minutes, jira_key, pr_url, status}]}`. `items` is `[]` when there are no rows. Timestamps are `YYYY-MM-DDTHH:MM:SSZ` (UTC). |
| No `client_name` | `{"ok":false,"error":"invalid_request","message":"client_name is required"}` |
| Bad or missing `from` | `{"ok":false,"error":"invalid_request","message":"from must be YYYY-MM-DD"}` |
| DB error | `{"ok":false,"error":"internal_error","message":"compliance_log query failed: <Boomi error>"}` |

Note: the backend leaves out `from` when it has none, and B4 then answers `invalid_request`. The backend should always send `from`.

## Flow
WSS listener (no input; query params arrive as DPPs `query_client_name` and `query_from`) → Groovy validate → Decision `DDP_VALID`.
- false → Return "Reply invalid_request".
- true → Branch:
  1. Try/Catch → DB V2 Get Q6 → Groovy collects the rows into DPP `DPP_ROWS` → Stop. On Catch, Set Properties puts the error message into `DPP_DB_ERROR` → Stop.
  2. Groovy builds the report (or the error body) → Return "Reply 200".

The source lives in the Boomi workspace: `scripts/gen_b4.py`, `scripts/b4_*.groovy`, and `scripts/gen_supabase.py` (profiles and Q1–Q6 operations).

## Components (folder `PatchPilot`)
| Component | ID |
|---|---|
| Process `PatchPilot B4 - Compliance Report` | `02c7d703-b8a8-439d-b392-4aa6501fcab7` |
| WSS op `PatchPilot_B4_Compliance_Listener_Operation` | `35031e92-8472-4da9-acc5-dd37eeedab1a` |
| Connection `PatchPilot_Supabase_Connection` (DB V2, PostgreSQL) | `80e35ad3-9e44-48ba-ab42-4940912ce654` |
| Op `PatchPilot_Supabase_Q6_Report_Operation` (Standard Get) | `c53154b9-f738-4073-8132-197e3ebaeb65` |
| Profile `PatchPilot_Supabase_Q6_Report_Request_Profile` | `96707c23-f540-4fd3-9943-f495b26ca8df` |
| Profile `PatchPilot_Supabase_Q6_Report_Response_Profile` | `71010bbe-d392-4136-8696-1bf82d07ab38` |

The Q1–Q5 operations for B2 exist but are not wired into any process. See the report to the Lead, or `gen_supabase.py`.

## GUI step: database password (owner only)
Open `PatchPilot_Supabase_Connection` in the Boomi GUI, enter the Supabase database password, save, and click **Test Connection**. The JDBC URL and user are already set. After that, **never push this connection from the workspace again**: a push overwrites the stored password.

## Status and test results (Oct 28)
- **Live.** It uses the PostgreSQL JDBC driver from Custom Library `PatchPilot_PostgreSQL_JDBC_Library` (`0afaa4b6-8df0-45a5-b1ac-9bc452d444c6`, `postgresql-42.7.4.jar`, deployed to the environment). Atom Cloud ships no PostgreSQL driver. Without it, every DB step fails with `Failed Loading the class`.
- **DB V2 quirk:** named `$params` and insert keys must be **table column names**. `$from` failed with `Keys Provided in Input Request is not matching the Request Profile`, so Q6 now uses `$detected_at` (value `YYYY-MM-DD 00:00:00`). Timestamps must be `yyyy-mm-dd hh:mm:ss`.
- To free a Standard connector licence for Supabase, B1 is undeployed until the backend is live. The training account allows 3 connections.
- Live test: `?client_name=Acme%20Retail&from=2026-10-01` returned the rows B2 wrote, e.g. `log_fnd_e2e_03` (`KAN-10`, `status: fixed`, `fixed_at` set). The invalid-`from` and missing-`client_name` cases return `invalid_request`.
