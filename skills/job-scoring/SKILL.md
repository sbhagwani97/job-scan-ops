---
name: job-scoring
description: Rubric and output schema for scoring a job posting 1-5 against the user's CV and requirements. Use when evaluating job descriptions for fit, or when explaining a job-scan score.
---

# Job scoring rubric

Score each posting against `job-scan/cv/cv.md`, `job-scan/cv/cv.profile.yml` and `job-scan/profile.yml`. Produce ONE holistic score from 1.0 to 5.0 (one decimal).

## Anchors
| Score | Meaning |
|---|---|
| 5.0 | Near-perfect. Meets all must-haves, nearly all core requirements with direct evidence in the CV, right seniority, right location, no red flags. |
| 4.0-4.9 | Strong. Meets all must-haves and most core requirements. Minor gaps the candidate could close quickly. Worth applying. |
| 3.0-3.9 | Plausible. Meaningful gaps in core skills or seniority, or a location/terms mismatch that is negotiable. |
| 2.0-2.9 | Weak. Large skill or seniority gap, or different domain. |
| 1.0-1.9 | Wrong job. Different field, or clearly unqualified/overqualified. |

## What to weigh (in this order)
1. **Core requirements vs. evidence**: only credit skills the CV actually shows. Do not assume.
2. **Seniority and years of experience**: compare the posting's ask to `cv.profile.yml`.
3. **Domain and responsibilities**: does the day-to-day match the candidate's track record?
4. **Location, work model, and logistics**: city, remote policy, visa/right-to-work, language.
5. **Nice-to-haves and compensation** (if stated): small adjustments only.

## Hard caps (apply AFTER forming the score)
- A **must_have** from the profile is clearly violated or the posting makes it impossible (e.g. "no visa sponsorship" when sponsorship is a must-have): `knockout: true`, `score` max 2.5.
- A **deal_breaker** is present: `knockout: true`, `score` max 2.0.
- Salary stated and clearly below `salary_min`: `knockout: true`, `score` max 3.0.
- If a requirement is merely *not mentioned*, it is NOT a violation. Note it in `gaps` as "unknown: ...".

## Discipline
- Be skeptical and consistent. Most postings should land between 2 and 4. A 4+ must be earned with specific evidence.
- Never inflate a score because the company is prestigious.
- If the description is empty or truncated to the point of being unscorable, return `score: null` with `rationale: "insufficient description"`; the caller will refetch.

## Output schema (JSON, one object per job)
```json
{
  "id": "<job id, copied exactly>",
  "score": 4.2,
  "knockout": false,
  "knockoutReason": "",
  "rationale": "2-3 sentences: why this score, citing CV evidence.",
  "matched": ["Python 5y (CV: Acme backend)", "Kubernetes"],
  "gaps": ["Go (required, not in CV)", "unknown: visa sponsorship"]
}
```
