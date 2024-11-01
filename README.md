# Automating-job-applications
This repository will contain code that automates my process of applying for jobs.

Workflow:
1. Select resume / upload resume
2. Provide job posting url (from glassdoor)
3. Scrapes the job posting
4. Uses LLM to convert the unstructured job description to a structured job description (Using Groq api, model: llama-3.1-8b-instant)
5. Prepares a summary of the job posting / Identifying the key contenders (Using Groq api, model: llama-3.1-8b-instant)
6. Prepares embnedding of the job description (Using Open AI api, model: text-embedding-3-small)
7. Finds similarity percentage of the resume embedding with job description embedding (using cosine similarity)
8. Identifies the best resume if multiple resumes are selected
9. Provides a list of suggestions to update the resume so as to have optimal resume as per the job description (Using Groq api, model: llama3-70b-8192)
10. Prepares a cover letter (Using Groq api, model: llama3-70b-8192)
