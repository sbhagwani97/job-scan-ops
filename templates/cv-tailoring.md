# Tailored CV guide (for /job-scan:apply)

Start from `job-scan/cv/cv.md`. The tailored CV is the same document with a different emphasis, not a rewrite.

## Keep verbatim
- Name, contact details, section names, employers, job titles, dates, locations, education and certifications.
- Every metric and achievement. Do not invent, round up or embellish anything.
- The CV's language.

## Adjust
- Reorder bullets inside each role so the ones matching the posting's top requirements come first.
- Mirror the posting's exact vocabulary only where it is truthful (for example "distributed systems" if the CV already describes distributed work).
- Reorder the skills list so matched skills lead; omit a skill only if it is irrelevant to this role, never if it is a core requirement.
- Trim older or unrelated bullets to keep the CV to 1-2 pages. Keep all roles and dates.
- Tighten wording without changing meaning. No new claims.

## Avoid
- Renaming a title, changing dates, hiding a role, or claiming a skill the CV does not evidence.
- Keyword stuffing or a new summary that contradicts the CV.
- Adding a "tailored for X" line to the CV itself.

## Output
- Write `cv-tailored.md` with the same markdown structure as `cv.md`.
- Render it with `node "<root>/scripts/render-cv-pdf.mjs" "<dir>/cv-tailored.md" "<dir>/cv-tailored.pdf"`.
- Compare it against `cv.md` one last time: same facts, stronger emphasis.
