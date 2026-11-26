# C4.2. Bounded reads

Public listing, staff queue and the organization inbox use bounded PostgreSQL queries and keyset pagination. Published queries are indexed by organization and opportunity, review queues by state and opportunity, and interest by organization-authorized opportunity and item ID. Responses return at most 20 records. Applicant disclosures exclude unrelated account data. Existing in-app notification writes deduplicate by receipt.

The disposable benchmark seeds 500 publication records, 500 review queue entries and 120 applicant records against one synthetic organization. Measurements use local Fastify, PostgreSQL and three samples per lane. Each response returned 20 records. These measurements describe the disposable environment only. Sustained capacity, hosted latency and resource utilization remain unmeasured.

| Read | Median | Range | JSON bytes |
| --- | ---: | ---: | ---: |
| Public organization listings | 43 ms | 42–43 ms | 19,010 |
| Staff review queue | 17 ms | 17–18 ms | 7,073 |
| Organization interest inbox | 170 ms | 50–188 ms | 5,706 |
