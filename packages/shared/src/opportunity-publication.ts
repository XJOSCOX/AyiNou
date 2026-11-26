export const opportunityDetailFields = {
  "employment": {
    "employmentType": "full_time part_time temporary contract seasonal",
    "responsibilities": "text",
    "compensation": "money",
    "compensationPeriod": "hour day week month year project",
    "experience": "text?",
    "requiredSkills": "skills?",
    "preferredSkills": "skills?",
    "languages": "text?",
    "qualifications": "text?",
    "benefits": "text?",
    "startDate": "date?",
    "positions": "count?"
  },
  "internship": {
    "duration": "text",
    "learningObjectives": "text",
    "payment": "paid unpaid",
    "compensation": "money?",
    "prerequisites": "text?",
    "supervision": "text",
    "startDate": "date",
    "endDate": "date"
  },
  "scholarship": {
    "sponsor": "text",
    "purpose": "text",
    "academicLevel": "text",
    "subject": "text",
    "funding": "full partial",
    "expenses": "text",
    "eligibility": "text",
    "deadline": "date",
    "awardPeriod": "text",
    "awards": "count?"
  },
  "training": {
    "skillsTaught": "skills",
    "provider": "text",
    "duration": "text",
    "format": "remote on_site hybrid",
    "prerequisites": "text?",
    "payment": "free paid",
    "cost": "money",
    "certificate": "text?",
    "eventId": "uuid?",
    "startsAt": "instant?",
    "endsAt": "instant?"
  },
  "education": {
    "institution": "text",
    "subject": "text",
    "academicLevel": "text",
    "duration": "text",
    "admission": "text",
    "tuition": "money",
    "format": "remote on_site hybrid",
    "deadline": "date",
    "enrollmentDeadline": "date"
  },
  "apprenticeship": {
    "trade": "text",
    "learningObjectives": "text",
    "practicalExperience": "text",
    "supervision": "text",
    "duration": "text",
    "payment": "paid unpaid",
    "compensation": "money?",
    "qualifications": "text?",
    "safeguarding": "text"
  },
  "workshop": {
    "topic": "text",
    "learningObjectives": "text",
    "startsAt": "instant",
    "endsAt": "instant",
    "format": "remote on_site hybrid",
    "capacity": "count",
    "participationRequirements": "text?",
    "eventId": "uuid?"
  }
} as const;
export const opportunityReportReasons = ["fraud","scholarship","impersonation","unlawful_recruitment","exploitation","harassment","unsafe_destination","privacy"] as const;
export const opportunityReviewChecks = ["organization","accuracy","location","financial","application","fraud","safeguarding","destination"] as const;
