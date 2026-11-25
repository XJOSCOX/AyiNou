# C3.3 Matching performance

The member query traverses the existing partial published-revision index using an opportunity ID keyset and reads at most 96 distinct opportunity candidates plus one continuation probe. It checks the shortlisted rows against native scope, catalog, capacity and application history. The organizer query assesses a bounded cohort of at most 96 consenting accounts using a partial consent index. It keeps project and opportunity fixed, applies privacy and eligibility before disclosure, and serves at most three pages of up to eight public projections. A separate partial application index serves remaining capacity checks. Only the current result page is ordered, and re-evaluation reflects current eligibility.

The launch decision must consider that bounded-window sampling does not guarantee exhaustive recall or a global best match. No external infrastructure, model inference, caches, or additional per-candidate HTTP calls are used. Synthetic measurements and planner evidence are collected locally. Local results do not establish production capacity.

### Disposable benchmark

The final run used 121 structured opportunities, three timed HTTP reads per endpoint at each population, and a separate PostgreSQL `EXPLAIN (ANALYZE, BUFFERS)` for each plan.

| Bulk synthetic profiles | Recommendation median (range), ms | Discovery median (range), ms | Consent cohort, ms | Published shortlist, ms | Discovery RPC, ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1,000 | 1,140 (1,098–1,158) | 1,036 (1,006–1,064) | 0.066 | 0.142 | 1,049.806 |
| 10,000 | 1,104 (1,061–1,226) | 1,170 (1,003–1,220) | 0.089 | 0.148 | 1,119.602 |
| 50,000 | 1,071 (1,033–1,089) | 987 (958–1,013) | 0.078 | 0.127 | 1,049.930 |

Recommendation responses were 3,247 bytes and discovery responses were 687 bytes. The consent cohort plan used an index-only scan for 96 rows and three shared buffer hits at each size. The publication shortlist read 97 rows including the continuation probe. Full discovery still took roughly one second. These measurements cover warm local single-request latency with seeded data. They provide no concurrent throughput or production latency estimate.
