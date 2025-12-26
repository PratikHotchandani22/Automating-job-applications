# Resume Upload Feature Setup Guide

This document explains how to set up and use the resume upload feature that extracts structured data from Word (.docx) and PDF files.

## Overview

The resume upload feature allows users to upload their master resume in Word or PDF format. The system will:
1. Parse the file to extract raw text
2. Use OpenAI GPT-4o-mini to extract structured data (header, summary, skills, work experience, projects, awards, links)
3. Save the parsed data to the Convex database in the `masterResumes` and `resumeBullets` tables

## Architecture

### Components

1. **Frontend (Settings Page)**: File upload UI component
2. **API Route (`/api/parse-resume`)**: Parses Word/PDF files to text
3. **Convex Action (`resumeExtraction.extractResumeData`)**: Uses LLM to extract structured data and saves to database

### Data Flow

```
User Uploads File
    ↓
Frontend sends file to /api/parse-resume
    ↓
API route parses file (mammoth for .docx, pdf-parse for .pdf)
    ↓
Frontend receives extracted text
    ↓
Frontend calls Convex action extractResumeData
    ↓
Convex action calls OpenAI API to extract structured data
    ↓
Convex action saves to database (masterResumes + resumeBullets)
```

## Setup Instructions

### 1. Install Dependencies

```bash
cd extension-code/dashboard-nextjs
npm install mammoth pdf-parse
npm install --save-dev @types/pdf-parse
```

### 2. Configure Environment Variables

#### Convex Environment Variables

Set the OpenAI API key in your Convex dashboard:

1. Go to your Convex dashboard
2. Navigate to Settings → Environment Variables
3. Add: `OPENAI_API_KEY` = `your-openai-api-key`

Or use the Convex CLI:

```bash
npx convex env set OPENAI_API_KEY your-openai-api-key
```

### 3. Database Schema

The schema has been updated to include a `header` field in the `masterResumes` table:

```typescript
header: {
  fullName?: string;
  email?: string;
  phone?: string;
  address?: string;
  linkedin?: string;
  github?: string;
  portfolio?: string;
  website?: string;
}
```

### 4. Deploy Schema Changes

If you haven't already, push the schema changes to Convex:

```bash
cd extension-code/dashboard-nextjs
npx convex dev
```

This will deploy the updated schema with the new `header` field.

## Usage

1. Navigate to the Settings page in the dashboard
2. Click the "📄 Upload Resume" button
3. Select a Word (.docx) or PDF file
4. The file will be parsed and the data extracted automatically
5. The resume will appear in the Master Resumes list

## Extracted Data Structure

The LLM extracts the following sections:

- **Header**: Name, email, phone, address, LinkedIn, GitHub, portfolio, website
- **Summary**: Professional summary/objective
- **Skills**: Categorized into:
  - Programming languages
  - Frameworks/libraries
  - Tools/cloud technologies
  - Data science/analytics
  - Machine learning/AI
  - Other skills
- **Work Experience**: Company, role, dates, location, bullet points
- **Projects**: Name, dates, tags, bullets, links
- **Education**: Institution, degree, dates, location, GPA, links
- **Awards**: Name, issuer, year, details
- **Mentorship**: Descriptions
- **Links**: Additional URLs not categorized above

Work experience and project bullets are stored in the `resumeBullets` table with:
- `parentType`: "experience" or "project"
- `parentId`: Unique identifier for the work experience/project
- Metadata: company, role, dates, location (for experience) or projectName, dates, tags (for projects)

## Error Handling

- File type validation: Only .docx and .pdf files are accepted
- Parsing errors: Displayed to user with helpful error messages
- LLM extraction errors: Logged and displayed to user
- Database errors: Caught and reported

## Cost Considerations

The feature uses OpenAI's `gpt-4o-mini` model for extraction, which is cost-effective:
- Input: ~$0.15 per 1M tokens
- Output: ~$0.60 per 1M tokens

Average resume extraction costs approximately $0.01-0.05 per resume.

## Future Improvements

- Support for more file formats (e.g., .doc, .txt)
- Batch upload support
- Manual editing of extracted data
- Preview of extracted data before saving
- Validation and error correction suggestions
- Support for other LLM providers (Anthropic, etc.)

