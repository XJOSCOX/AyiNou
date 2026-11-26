# C4.5 performance and candidate recall

Latest, Closing soon, type, country and Haitian department use private publication keys backed by B-tree indexes. GIN supports normalized keyword search. A read inspects at most 128 candidates per page, plus one continuation row. The backend uses one discovery RPC per read; there is no refresh polling or external processing. Saved lookups use an owner and keyset index.

The ranking is deliberately page-local. An exhaustive ranking could elevate a strong match on a later page. A country, type, department, or keyword filter can narrow the cohort before matching. No production capacity or exhaustive recall claim follows from disposable testing.

## Disposable measurements

The local stack used mixed opportunities across seven types, Haitian and international locations, all three modes, and valid, expired and suppressed publications. The API timing includes loopback HTTP, Auth and database access. Bytes are serialized JSON sizes.

| Opportunities | Latest | Keyword | Closing and filters | For You | Saved | 3 concurrent reads | Indexed Latest SQL |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000 | 207 ms | 105 ms | 58 ms | 203 ms | 16 ms | 221 ms | 0.067 ms |
| 10,000 | 228 ms | 228 ms | 219 ms | 212 ms | 17 ms | 224 ms | 0.067 ms |
| 50,000 | 208–232 ms | 208–227 ms | 210–233 ms | 232–234 ms | 19–20 ms | 250 ms | 0.235 ms |
| 100,000 | 207–217 ms | 213–225 ms | 207–221 ms | 204–244 ms | 15–19 ms | 221 ms | 0.088 ms |

Latest response size was 11,119 bytes, keyword 10,896 bytes, filtered 10,869–10,874 bytes, For You 8,684 bytes and Saved 956 bytes. `EXPLAIN (ANALYZE, BUFFERS)` used `c45_latest` for the indexed key query at all four sizes. SQL times cover only the indexed key projection. With one or two serial samples per cell, no percentile is reported.

For a single employment preference, the first 12 results matched a reference that enumerated all valid matching fixture listings, giving 100% first-page recall in those cohorts. That fixture does not establish recall for strongly skewed, multi-signal, or historically revised publication populations. Concurrency here is three simultaneous reads. The separate lifecycle test verifies immediately subsequent reads after consent withdrawal and organizational invalidation. It does not establish revocation latency for a request that started before the state change. Hosted Supabase received no load test.
