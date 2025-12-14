# Explainability UI - Quick Start Guide

## How to Access

1. Open the Resume Intelligence Dashboard
2. Click on any completed run in the Runs table
3. In the detail drawer that opens, click the **"Explain"** tab
4. Explore the 5 sub-tabs to understand what happened

## 5-Second Overview

**What it does:** Shows you exactly why the AI made each decision when tailoring your resume.

**Why it matters:** You can trust the system, learn from it, and improve your resume over time.

## The 5 Tabs Explained (30 seconds each)

### 1. Overview 📊
**What:** Quick summary of the job and how well your resume matches.

**Look for:**
- The coverage percentage (higher = better)
- Number of covered requirements
- Job summary

**Use when:** You want a quick understanding before diving into details.

---

### 2. Requirements 📋
**What:** Every requirement the AI identified in the job description, and whether you have it.

**Look for:**
- ✓ Green checkmark = You have this (good!)
- ⚠ Yellow warning = You don't have this (gap!)
- Must-have vs Nice-to-have badges

**Use when:** 
- Preparing for an interview (study the covered ones)
- Identifying skill gaps to fill
- Understanding why you were/weren't selected

**Pro Tip:** Use the filter buttons to show only covered or uncovered requirements.

---

### 3. Changes ✏️
**What:** Side-by-side comparison of your original bullets vs. the tailored version.

**Look for:**
- Before/After arrows showing transformations
- Yellow highlighted keywords (these are important!)
- "Rewrite Intent" explaining why it was changed
- Relevance scores and evidence tiers

**Use when:**
- You want to see exactly what changed
- Learning how to write better resume bullets
- Understanding why certain bullets were selected

**Pro Tip:** Study the modified bullets to see how the AI emphasizes relevant keywords.

---

### 4. Selection Strategy 🎯
**What:** Behind-the-scenes look at how bullets were chosen.

**Look for:**
- The 4 factors: Relevance, Evidence, Redundancy, Budget
- Configuration settings (word limits, thresholds)
- Cache hit/miss status (shows efficiency)

**Use when:**
- You're curious about the algorithm
- Debugging why certain bullets weren't included
- Understanding performance metrics

**Pro Tip:** Check if caches hit - this makes future runs faster!

---

### 5. Keywords 🔑
**What:** All important terms extracted from the job description.

**Look for:**
- Color-coded importance (red = most critical)
- Type labels (tool, domain, soft skill)
- Progress bars showing importance level
- Evidence snippets from the job

**Use when:**
- Writing a cover letter (copy these terms!)
- Preparing for an interview
- Updating your LinkedIn profile
- Answering "Why are you a good fit?" questions

**Pro Tip:** Click any keyword to copy it to your clipboard!

---

## Common Questions

### Q: Why does the coverage percentage matter?
**A:** Higher coverage means your resume matches more job requirements. Aim for:
- 70%+ = Strong match
- 50-70% = Good match with some gaps
- <50% = May need more relevant experience

### Q: What if I see "Not Covered" requirements?
**A:** This means the AI couldn't find relevant experience. You can:
1. Add relevant experience to your master resume
2. Reframe existing bullets to be more relevant
3. Acknowledge the gap and prepare to address it in interviews

### Q: Why were some of my best bullets excluded?
**A:** Common reasons:
- Not relevant to this specific job (e.g., web dev experience for ML role)
- Budget limit reached (resume can't be too long)
- Redundant with other selected bullets
- Low evidence quality (no metrics or specifics)

### Q: Can I override the AI's decisions?
**A:** Not directly in this UI (yet!). However, you can:
1. Adjust your master resume bullets
2. Run the system again
3. Use the insights to manually edit the generated resume

### Q: Why do some keywords have higher importance?
**A:** The AI analyzes:
- How often the term appears in the job description
- Where it appears (title, requirements, nice-to-haves)
- Context (is it required or just mentioned?)

### Q: What does "Evidence Tier" mean?
**A:** Quality assessment of your bullet points:
- **High:** Strong action verbs, metrics, specific tools/technologies
- **Medium:** Some specifics but could be stronger
- **Low:** Vague or lacking concrete details

---

## Power User Tips

### Tip 1: Compare Multiple Runs
Look at the Keywords tab across different jobs you've applied to. Common keywords = skills you should emphasize in your profile.

### Tip 2: Build Your Interview Prep
1. Go to Requirements tab
2. Copy all covered requirements
3. Prepare a STAR story for each one
4. You now have your interview talking points!

### Tip 3: Improve Your Master Resume
If bullets keep getting excluded across multiple jobs:
- They may be too vague (add metrics!)
- They may be outdated (consider removing)
- They may need stronger action verbs

### Tip 4: Keyword Research
Compare keywords across similar roles. If "Kubernetes" shows up in every ML role, that's a skill worth learning!

### Tip 5: Track Your Growth
Save the coverage percentages over time. If you're consistently improving, your master resume is getting stronger!

---

## What to Do Next

After reviewing the Explainability UI:

### If coverage is good (>70%):
1. ✓ Download the tailored resume
2. ✓ Copy important keywords to your cover letter
3. ✓ Review covered requirements for interview prep
4. ✓ Apply with confidence!

### If coverage is medium (50-70%):
1. Check uncovered requirements
2. Decide if you can honestly address them
3. Consider adding relevant experience to master resume
4. Rerun if you made changes

### If coverage is low (<50%):
1. This might not be the best fit role
2. Review what's missing - are these learnable skills?
3. Consider whether to apply anyway (maybe the role description is aspirational)
4. Focus applications on roles with better matches

---

## Troubleshooting

### "No Explainability Data Available"
**Solution:** 
- Wait for the run to complete (must reach "DONE" status)
- Check that backend is running
- If old run, try creating a new one

### "Loading..." Forever
**Solution:**
- Check browser console for errors
- Verify backend server is online
- Try refreshing the page

### Keywords not highlighting in job description
**Solution:**
- This is normal for some keywords
- Highlighting only works for exact matches
- Partial matches may not be highlighted

### Requirements show as uncovered but I have the skill
**Solution:**
- The AI uses semantic matching, not exact keyword matching
- Consider rephrasing bullets to be more explicit
- Include the specific technology/tool name if it's not there

---

## Feedback & Support

If you encounter issues or have suggestions:
1. Check the EXPLAINABILITY.md documentation
2. Review backend logs for errors
3. Report bugs with:
   - Run ID
   - Tab you were viewing
   - Expected vs actual behavior

---

## Summary

The Explainability UI makes AI decisions transparent by showing:
- ✓ What requirements were found
- ✓ Which ones you match
- ✓ What changed and why
- ✓ How the selection algorithm works
- ✓ What keywords matter most

Use it to **trust** the system, **learn** from it, and **improve** over time.

**Next Step:** Open a run and explore each tab! 🚀
