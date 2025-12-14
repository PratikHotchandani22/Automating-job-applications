# Resume Intelligence - Explainability Features

## Overview

The Explainability UI provides transparent insights into how the AI system tailors your resume for each job application. This document explains the features and data visualizations available in the **Explain** tab of the Run Detail view.

## Features

### 1. Overview Tab

**Purpose:** Provides a high-level summary of the job and processing results.

**Key Information:**
- **Job Metadata:** Title, company, platform, experience requirements
- **Coverage Analysis:** Visual representation of requirement coverage
  - Must-have vs nice-to-have requirements
  - Percentage of requirements covered by your resume
  - Coverage breakdown with visual circle chart
- **Processing Pipeline:** Shows all stages of the resume intelligence pipeline
  - Job Extraction → Rubric Analysis → Evidence Scoring → Relevance Matching → Bullet Selection → Content Tailoring → PDF Generation

**Use Case:** Quick understanding of job requirements and how well your experience matches.

---

### 2. Requirements Tab

**Purpose:** Detailed breakdown of all job requirements and their match status.

**Key Information:**
- **Requirement Cards:** Each requirement shows:
  - **Type Badge:** "Must-have" (red) or "Nice-to-have" (blue)
  - **Weight:** Importance score (1-5)
  - **Status:** ✓ Covered or ⚠ Not Covered
  - **JD Evidence:** Direct quotes from the job description
  - **Matching Bullets:** Resume bullets that address this requirement
  - **Coverage Reason:** Why a requirement is not covered (if applicable)

**Coverage Reasons:**
- `not_covered` - No matching experience found in resume
- `no_supporting_bullet_found` - Experience exists but no strong supporting bullet
- `blocked_by_budget_or_redundancy` - Budget limit reached or redundant with other bullets

**Use Case:** 
- Identify gaps in your resume for this specific role
- Understand which of your experiences are most relevant
- Prepare for interviews by focusing on covered requirements

---

### 3. Changes Tab

**Purpose:** Side-by-side comparison of original and tailored resume bullets.

**Key Information:**

#### Included Bullets Section
- **Role Context:** Shows which role/company each bullet is from
- **Change Status:** "Modified" or "Unchanged" badge
- **Requirements Coverage:** Lists which requirements (R1, R2, etc.) this bullet addresses
- **Before/After Comparison:**
  - **Original:** Your baseline resume bullet
  - **Tailored:** Modified version with highlighted keywords
  - **Arrow indicator** shows the transformation
- **Rewrite Intent:** Explanation of why/how the bullet was modified
- **Metrics:**
  - Relevance Score: Semantic similarity to job requirements (0-100%)
  - Evidence Tier: Quality of the bullet (high/medium/low)

#### Excluded Bullets Section
- **Bullet Text:** Original text of excluded bullets
- **Exclusion Reasons:**
  - `not_selected` - Not relevant to this job
  - `budget_exceeded` - Resume word limit reached
  - `redundant` - Similar content already included
  - `low_evidence` - Evidence quality below threshold

**Keyword Highlighting:**
Important keywords from the job description are highlighted in yellow in the tailored bullets.

**Use Case:**
- See exactly what changed and why
- Understand which experiences were prioritized
- Learn how to better write resume bullets for future applications

---

### 4. Selection Strategy Tab

**Purpose:** Explains the algorithm and configuration used to select resume bullets.

**Key Information:**

#### Selection Factors
1. **Relevance Score (🎯)**
   - Semantic similarity using embeddings
   - Measures how well your bullet matches job requirements

2. **Evidence Quality (⭐)**
   - Presence of metrics, action verbs, and technical details
   - Higher quality bullets are preferred

3. **Redundancy Check (🔄)**
   - Avoids selecting similar bullets
   - Ensures diverse representation of skills

4. **Budget Management (📊)**
   - Maintains optimal resume length (550-700 words)
   - Balances bullet count across sections

#### Configuration Settings
- **Target Resume Length:** 550-700 words
- **Experience Bullets:** 8-10 bullets
- **Project Bullets:** 2-3 bullets
- **Must-Have Min Relevance:** 35% threshold
- **Redundancy Threshold:** 92% similarity blocks duplicate content

#### Performance Metrics
- **Rubric Analysis Time:** How long it took to analyze the job description
- **Evidence Cache:** Whether bullet scores were reused (HIT) or computed fresh (MISS)
- **Embedding Cache:** Whether relevance embeddings were reused
- **Embedding Model:** Which AI model was used (e.g., text-embedding-3-large)

**Use Case:**
- Understand the optimization process
- See why certain bullets were preferred over others
- Verify the system is using cached data efficiently

---

### 5. Keywords Tab

**Purpose:** Displays all keywords extracted from the job description with importance rankings.

**Key Information:**

#### Keyword Cards
Each keyword shows:
- **Term:** The keyword or phrase
- **Type:** Classification (tool, domain, soft skill)
- **Importance:** Visual bar showing priority (1-5 scale)
- **Color Coding:**
  - Red border (5) - Critical keywords
  - Orange border (4) - Very important
  - Yellow border (3) - Important
  - Green border (2) - Moderately important
  - Blue border (1) - Least important
- **JD Evidence:** Where this keyword appears in the job description

#### Full Job Description
- Complete job description text with keywords highlighted
- Scrollable container for easy reading
- Keywords highlighted in yellow for quick scanning

**Use Case:**
- Quick reference for important terms to mention in interviews
- Copy keywords for cover letters or LinkedIn updates
- Understand the technical stack and domain focus

---

## Data Flow

### How Artifacts are Generated

1. **Job Extraction Stage**
   - Input: Raw HTML from job posting
   - Output: `job_extracted.txt` - Clean text of job description

2. **Rubric Analysis Stage**
   - Input: Job description text
   - Output: `jd_rubric.json` - Structured requirements and keywords
   - Contains: 12-20 requirements, 10-20 keywords with importance scores

3. **Evidence Scoring Stage**
   - Input: Master resume bullets
   - Output: `evidence_scores.json` - Quality scores for each bullet
   - Cached based on resume hash for efficiency

4. **Embeddings Stage**
   - Input: Resume bullets + Job requirements
   - Output: 
     - `jd_requirement_embeddings.json` - Vector embeddings of requirements
     - Resume bullet embeddings (cached)
     - `relevance_matrix.json` - Similarity scores between bullets and requirements

5. **Selection Stage**
   - Input: Rubric + Evidence scores + Relevance matrix + Budget constraints
   - Output: `selection_plan.json` - Which bullets to include/exclude and why

6. **Tailoring Stage**
   - Input: Selection plan + Baseline resume + Job requirements
   - Output: 
     - `baseline_resume.json` - Original resume state
     - `tailored.json` - Full tailored resume with explainability data
     - `final_resume.json` - Final processed resume

7. **Metadata**
   - `meta.json` - Hashes, timings, cache status, and configuration

---

## Technical Details

### Artifact URLs

All artifacts are served via the backend `/download/:runId/:file` endpoint:
- `/download/{runId}/jd_rubric.json`
- `/download/{runId}/selection_plan.json`
- `/download/{runId}/tailored.json`
- `/download/{runId}/baseline_resume.json`
- `/download/{runId}/final_resume.json`
- `/download/{runId}/job_extracted.txt`
- `/download/{runId}/meta.json`

### Component Architecture

```
RunDetailDrawer
  └─ RunExplainView
      ├─ Overview Tab
      ├─ Requirements Tab
      ├─ Changes Tab
      ├─ Selection Strategy Tab
      └─ Keywords Tab
```

### Data Fetching

The `RunExplainView` component:
1. Reads artifact URLs from `run.artifacts`
2. Fetches JSON/text files asynchronously
3. Parses and combines data for visualization
4. Updates UI with loading states

### Styling

All explainability styles are in `index.css` under the `EXPLAINABILITY VIEW STYLES` section:
- Dark theme with cyan/green accent colors
- Responsive grid layouts
- Visual indicators (badges, progress bars, highlights)
- Smooth animations and transitions

---

## User Benefits

### For Job Seekers

1. **Transparency:** See exactly why decisions were made
2. **Learning:** Understand what makes strong resume bullets
3. **Confidence:** Know your resume is optimized for the role
4. **Interview Prep:** Use coverage analysis to prepare answers
5. **Continuous Improvement:** Learn from what works and what doesn't

### For Power Users

1. **Debugging:** Identify why certain bullets weren't selected
2. **Optimization:** Adjust master resume based on selection patterns
3. **Performance Monitoring:** Track cache hits and processing times
4. **Audit Trail:** Complete history of what changed and why

---

## Future Enhancements

Potential additions to the Explainability UI:

1. **Comparative Analysis:** Compare multiple runs side-by-side
2. **Skill Gap Analysis:** Identify missing skills across multiple applications
3. **Bullet Performance Dashboard:** Track which bullets get selected most often
4. **Keyword Trends:** Show common keywords across multiple job applications
5. **Export Reports:** Generate PDF reports of the explainability analysis
6. **Interactive Editing:** Allow users to manually adjust selections and see impact
7. **A/B Testing:** Compare different versions of resume bullets
8. **Natural Language Explanations:** Add plain English summaries of technical decisions

---

## Troubleshooting

### No Data Showing in Explain Tab

**Possible Causes:**
1. Run hasn't completed yet - Wait for run to reach "DONE" status
2. Backend artifacts missing - Check that all files exist in `runs/{runId}/` directory
3. Backend offline - Verify backend server is running
4. CORS issues - Check browser console for network errors

**Solutions:**
- Refresh the run status
- Check backend logs for errors
- Verify artifact files exist on disk
- Retry the run if necessary

### Missing Requirements or Keywords

**Possible Causes:**
1. Job description was too short or incomplete
2. Rubric stage failed or produced empty output
3. Schema validation removed invalid entries

**Solutions:**
- Check `job_extracted.txt` to verify job text was captured correctly
- Review `jd_rubric.json` for validation errors
- Check backend logs for rubric stage errors

### No Bullet Changes Shown

**Possible Causes:**
1. Selection plan is empty
2. Baseline resume not saved
3. Final resume missing

**Solutions:**
- Check that `selection_plan.json`, `baseline_resume.json`, and `final_resume.json` all exist
- Verify run completed successfully (status = "DONE")
- Check backend logs for tailoring stage errors

---

## API Reference

### Artifact Schema

#### jd_rubric.json
```json
{
  "version": "jd_rubric_v1",
  "job_meta": { "job_title": "...", "company": "...", "platform": "..." },
  "requirements": [
    {
      "req_id": "R1",
      "type": "must" | "nice",
      "weight": 1-5,
      "requirement": "...",
      "jd_evidence": ["..."],
      "category": "ml" | "data" | "cloud" | "mlops" | "leadership" | "domain"
    }
  ],
  "keywords": [
    {
      "term": "...",
      "importance": 1-5,
      "type": "tool" | "domain" | "soft skill",
      "jd_evidence": ["..."]
    }
  ],
  "constraints": { "years_experience_min": 2, "education": [...] },
  "notes": { "summary": "...", "ambiguities": [...] }
}
```

#### selection_plan.json
```json
{
  "version": "selection_plan_v1",
  "run_id": "...",
  "config": { "budgets": {...}, "thresholds": {...}, "weights": {...} },
  "coverage": {
    "must_total": 15,
    "nice_total": 3,
    "must_covered": 7,
    "nice_covered": 0,
    "uncovered_requirements": [
      { "req_id": "R2", "type": "must", "weight": 5, "reason": "not_covered" }
    ]
  },
  "selected_bullets": [
    {
      "bullet_id": "exp_..._bullet_1",
      "matched_requirements": ["R1", "R3"],
      "relevance_score": 0.85,
      "evidence_tier": "high",
      "rewrite_intent": "..."
    }
  ],
  "dropped_bullets": [
    { "bullet_id": "...", "reason": "not_selected" | "budget_exceeded" | "redundant" }
  ]
}
```

#### tailored.json (v3 schema)
```json
{
  "version": "latest_v3",
  "job": { "title": "...", "company": "...", "raw_job_text_hash": "..." },
  "jd_rubric": { "top_keywords": [...], "requirements": [...] },
  "evidence_index": [
    {
      "bullet_id": "...",
      "original_text": "...",
      "detected_skills_tools": [...],
      "has_metric": true
    }
  ],
  "mapping": [
    {
      "req_id": "R1",
      "bullet_ids": ["..."],
      "keyword_insertions": ["..."],
      "updated_bullets": [
        { "bullet_id": "...", "from": "...", "to": "..." }
      ]
    }
  ],
  "final_resume": { "header": {...}, "experience": [...], "projects": [...], "skills": {...} }
}
```

---

## Conclusion

The Explainability UI transforms the black-box nature of AI resume tailoring into a transparent, educational, and trustworthy experience. By providing detailed insights into every decision, users can:
- Trust the system's recommendations
- Learn how to write better resume content
- Make informed decisions about their job applications
- Debug and optimize their master resume over time

This feature represents a significant step forward in AI explainability for career tools.
