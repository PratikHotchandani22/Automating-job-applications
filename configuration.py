SUPABASE_RESUME_TABLE = "resume_data"
JOB_DETAILS_TABLE_NAME = "job_info"

IDENTIFY_DETAILS_FROM_RESUME_PROMPT = (
"You are a professional AI model tasked with extracting specific sections and their content from a resume. "
"The resume is provided to you in free text format, and your job is to identify the following sections and extract their corresponding content. "
"You will return the extracted information as a list of sentences, formatted as strings, with each sentence representing a key detail from the resume.\n\n"

"Sections to identify:\n"
"1. **Name**: The full name of the individual.\n"
"2. **Contact Information**: This includes email, phone number, LinkedIn, and GitHub details.\n"
"3. **Education**: For each degree, include:\n"
"   - University/Institution name\n"
"   - Degree\n"
"   - GPA (if available)\n"
"   - Location\n"
"   - Duration of the study (start year - end year)\n"
"   - Relevant courses listed.\n"
"4. **Experience**: For each experience entry, include:\n"
"   - Job title\n"
"   - Company name\n"
"   - Location\n"
"   - Duration (start year - end year)\n"
"   - List of bullet points summarizing responsibilities or achievements.\n"
"5. **Projects**: For each project, include:\n"
"   - Project name\n"
"   - Technologies used\n"
"   - Brief description of the project\n"
"   - Key achievements or impact.\n"
"6. **Achievements**: Any professional awards or recognitions.\n"
"7. **Technical Skills**: List of technical skills including programming languages, libraries, and tools.\n"
"Format your response as a list of strings, where each element in the list is a single sentence summarizing key information from the resume, such as:\n"
"Experienced Senior Machine Learning Engineer with 2.5 years of experience..."
"Education: Master’s in Data Science, relevant coursework: Unsupervised ML, Data Mining..."
"Skills: Python, NLP, Machine Learning, PySpark, Databricks..."
"Project: Developed an NLP model using BERT, achieving 95% accuracy..."
"Experience: Worked at Bose Corporation, leading ML initiatives for customer data..."
"Please make sure the output is a well-formed list and only include the information provided in the resume text. Each sentence should be informative and capture the essence of the section."
)

IDENTIFY_DETAILS_FROM_JOB_PROMPT = """
You are a skilled job application parser. Your task is to extract and organize specific information from a provided job description text, responding only with a JSON dictionary format containing only the requested details. 

The JSON dictionary should have the following keys with values based on the extracted details from the job description. If any detail is not mentioned, use `null` as the value without additional commentary or assumptions.

Please extract and label the following details:

{
    "Company name": null,
    "Position name": null,
    "Seniority level": null,
    "Joining date": null,
    "Team name": null,
    "Location": null,
    "Reference job code: : null, 
    "Salary": null,
    "Hiring Manager": null,
    "Email address to contant" : null,
    "Hybrid or Remote?": null,
    "Company description": null,
    "Team description": null,
    "Job responsibilities": [],
    "Preferred skills": [],
    "Required skills": [],
    "Exceptional skills": [],
    "Technical keywords": [],
    "Necessary experience": null,
    "Bonus experience": null,
    "Job role classifications": [],
    "Company values": [],
    "Benefits": [],
    "Soft skills": [],
    "Visa Sponsorship": null
}

Instructions:
1. Respond only with the JSON dictionary containing the keys listed above.
2. Do not include any commentary, explanations, or assumptions.
3. List multiple items (like skills and responsibilities) as arrays within the JSON dictionary.
4. List all the technical keywords mentioned in the job description.
5. Ensure the JSON is correctly formatted to facilitate easy parsing.


Example job description:
\"\"\"
We are seeking a Senior Software Engineer to join the Artificial Intelligence team at Tech Solutions Corp. The role is based remotely, with an optional hybrid arrangement available from our San Francisco office. The salary range for this position is $120,000 to $150,000 per year. Tech Solutions Corp. specializes in providing cutting-edge AI technologies to various industries. The AI team focuses on developing machine learning models and AI-driven applications. Responsibilities include designing algorithms, conducting experiments, and deploying scalable software solutions. Preferred skills include experience with containerization and cloud services. Required skills are proficiency in Python and experience with TensorFlow. Exceptional skills such as knowledge of reinforcement learning would be appreciated. Keywords: Machine Learning, AI, Python, TensorFlow, Cloud Services, Docker. Required experience includes 5+ years of software development and 3+ years of experience in AI projects. Bonus experience includes contributions to open-source projects. Note: We do not provide visa sponsorships. 

Values: Innovativeness, teamwork, and commitment to excellence.
Benefits: 401(k), health insurance, and remote work options.
Soft skills required: Strong communication skills, problem-solving, and teamwork.

Job role classification: 
- Software Engineer
\"\"\"

Example response:

{
    "Company name": "Tech Solutions Corp",
    "Position name": "Senior Software Engineer",
    "Seniority level": null,
    "Joining date": null,
    "Team name": "Artificial Intelligence",
    "Location": "San Francisco (optional hybrid) / Remote",
    "Salary": "$120,000 to $150,000 per year",
    "Hybrid or Remote?": "Remote (optional hybrid)",
    "Company description": "Tech Solutions Corp. specializes in providing cutting-edge AI technologies to various industries.",
    "Team description": "The AI team focuses on developing machine learning models and AI-driven applications.",
    "Job responsibilities": ["Designing algorithms", "Conducting experiments", "Deploying scalable software solutions"],
    "Preferred skills": ["Experience with containerization", "Cloud services"],
    "Required skills": ["Proficiency in Python", "Experience with TensorFlow"],
    "Exceptional skills": ["Knowledge of reinforcement learning"],
    "Technical keywords": ["Machine Learning", "AI", "Python", "TensorFlow", "Cloud Services", "Docker"],
    "Necessary experience": "5+ years of software development and 3+ years of experience in AI projects",
    "Bonus experience": "Contributions to open-source projects",
    "Job role classifications": ["Software Engineer", "AI Engineer"],
    "Company values": ["Innovativeness", "Teamwork", "Commitment to excellence"],
    "Benefits": ["401(k)", "Health insurance", "Remote work options"],
    "Soft skills": ["Strong communication skills", "Problem-solving", "Teamwork"],
    "Visa Sponsorship": null
}

Please provide the job description text from which you require information.

"""

SUMMARY_PROMPT = """
You are an expert summarizer for job roles. Your task is to clearly and accurately extract all necessary details from the job posting, even if they are embedded in less structured text. Ensure no important detail is overlooked, especially critical application instructions or role-specific information. Summarize the job details provided, addressing the following points in order:

1. **Company Overview:** Summarize what the company does, its primary industry, potential clients, and whether it is product-based or service-based.
2. **Role Name and Reference Job Code:** Identify the role name and any reference job code provided. For the reference job code, look into Application Instruction section of the input. If not specified, explicitly state "Not provided."
3. **Last Date to Apply:** Extract the last date to apply. If not mentioned, state "Not specified."
4. **Joining Date:** Include the joining date if available. Otherwise, state "Not specified."
5. **Team:** Specify the team this role is associated with (e.g., "Data Science and Analytics," "Product Engineering"). If not mentioned, state "Not specified."
6. **Location:** Clearly state the job location, including remote or hybrid work options if mentioned.
7. **Salary:** Include the salary or range if provided. Otherwise, state "Not specified."
8. **Hiring Manager:** Identify the hiring manager's name if mentioned. Otherwise, state "Not provided."
9. **Email Address or Contact Information:** Extract any email address or specific instructions to apply (e.g., mailing address, online form). Ensure this is not missed. Look into Application Instruction section of the input to find the value.
10. **Security Clearance Required:** Note if a security clearance is needed (e.g., "Secret," "TS/SCI"). If not mentioned, state "Not specified."
11. **Visa Sponsorship:** Specify if visa sponsorship is available. Answer with "[Yes, No, N/A]."
12. **Years of Experience Required:** Clearly state the number of years of experience required for the role.
13. **Employment Type:** Specify whether the position is part-time, full-time, or contract-based.
14. **Key Skills:** List the top 5 most important skills and qualifications in order of priority. Exclude universally common skills like Python, SQL, and NLP unless they are explicitly emphasized.
15. **Day-to-Day Responsibilities:** Summarize the main responsibilities as described in the job posting. Avoid hallucinating; include only what is explicitly mentioned.

### **Important Instructions:**
- Pay extra attention to extracting details like the reference job code, email address, and specific application instructions. If any of these details are provided but unclear, ensure they are captured accurately.
- Sort the skills and qualifications by importance, focusing on distinguishing requirements for this role over general ones.
- If a detail is genuinely missing, explicitly state "Not provided" or "Not specified" to ensure clarity.
- Provide the output as a clear and concise summary in a readable format.

"""

EMBEDDING_MODEL = "text-embedding-3-small"

IDENTIFY_DETAILS_FORM_RESUME_MODEL = "gpt-4o-mini"

IDENTIFY_DETAILS_FROM_JOB_MODEL = "gpt-4o-mini"

SUMMARIZE_JOB_DESCRIPTION_MODEL = "gpt-4o-mini"

PROVIDING_SUGGESTIONS_MODEL = "gpt-4o-mini"

COVER_LETTER_GENERATION_MODEL = "gpt-4o-mini"

SUGGESTIONS_JOB_BASED_ON_RESUME_old = """ 
You will receive three inputs: resume_text, job_description_text and rag_text. 
Your task is to analyze all the provided input texts to enhance alignment and improve cosine similarity between resume_text and job_description_text.

1. Start by reviewing job_description_text to identify technical keywords. Compare these keywords against the skills section in resume_text. For each missing keyword, suggest where it should be added in the skills category and provide the answer as a list of necessary additions for each section.

2. Identify specific skills, experience, and responsibilities mentioned in the job description but not present in the resume. 

3. Based on these identified skills, experience, and responsibilities, prepare concise, actionable points that can be seamlessly added to the resume.

4. Ensure all suggestions are tailored to reflect the real work experience and achievements in resume_text. Avoid generic or AI-generated language by closely aligning recommendations with actual experience described in the resume.

5. For each recommendation, specify exactly where the update should be made in resume_text, whether in the skills section, specific bullet points under work experience, or any other relevant section.

6. Only if there is any RAG data provided, provide a header **Best suggestions from RAG data**, and format the response such that all `text` values for the same `category` and `title` are grouped together. Format the response like this:

**category**
   - **title**
     - **text 1**
     - **text 2**
     - **text 3**
     - ...

7. Ensure that all the `text` values for the same category and title are listed under that title, without repeating the category and title for each text.

8. From the actionable points identified in S-T-A-R format, for each point prepare only one line that could be added directly into the resume.

Except for the skills section part, present each suggestion in the S-T-A-R format (Situation, Task, Analysis, Result), ensuring it is clear, relevant, and immediately usable in the resume.

Inputs provided will be in the format as below:
"resume_text" : "",
"job_description_text" : "",
"rag_text" : ""
"""

SUGGESTIONS_JOB_BASED_ON_RESUME = """
Analyze the following inputs:  
- `resume_text`: [Insert resume text]  
- `job_description_text`: [Insert job description text]  
- `rag_text`: [Insert RAG text, if any]  

Perform the following tasks step-by-step:  

### 1. Technical Keyword Analysis  
- Extract technical keywords from `job_description_text` and compare them with the skills section in `resume_text`.  
- Identify only the missing keywords that are not present in the skills section of `resume_text`.  
- Suggest where these missing keywords should be added, providing a list formatted as:  
  - **Skills Section Additions**:  
    - [Missing Skill 1]: Add under [sub-section, if applicable].  
    - [Missing Skill 2]: Add under [sub-section, if applicable]. 

Give only missing keywords in response.
---

### 2. Skill, Experience, and Responsibility Gap Analysis  
- Identify skills, experiences, or responsibilities mentioned in `job_description_text` that are not present in `resume_text`.  

---

### 3. Best Suggestions from RAG Data (if applicable)  
- If `rag_text` is provided, review its `text` values grouped by `category` and `title`. Group all texts under the same `category` and `title` as follows:  
  - **[Category] - [Title]**:  
    - [Grouped RAG text values]  

---

### 4. Cross-reference RAG Data with Missing Skills  
- Match identified gaps from step 2 with the provided `rag_text`. Indicate if the missing skills, experiences, or responsibilities are covered in the RAG data.  

---

### 5. Achievement Framework  
- For each identified gap or enhancement (from steps 2 and 4), draft impactful accomplishment statements using the framework:  
  - "Accomplished [X] as measured by [Y] by doing [Z]."  

- Ensure each statement:  
  1. **Includes quantifiable metrics**: Specify measurable impacts like percentages (e.g., "20% improvement"), reductions (e.g., "40% reduction"), or absolute figures (e.g., "100K+ dataset").  
  2. **Is concise**: Limit each statement to one line, avoiding unnecessary repetition or wordiness.  
  3. **Highlights technical expertise**: Name tools, methods, or frameworks used (e.g., Databricks, Pinecone, OpenAI).  
  4. **Uses actionable verbs**: Start statements with strong action verbs like "Enhanced," "Created," "Streamlined," or "Optimized."  
  5. **Focuses on impact**: Clearly articulate the result or value added (e.g., improved performance, reduced costs, or increased efficiency).  

- Align each statement with real experiences or achievements from `resume_text` and `rag_text`. Ensure the final points stand out to technical reviewers by being clear, impactful, and results-driven.  


---

### 7. Notes  
- Ensure suggestions are tailored and reflect authentic experiences described in `resume_text` or `rag_text`. Avoid generic statements.  
- Dont provide any response from model for this note.
---

**Inputs:**  
`resume_text`: [Insert resume here]  
`job_description_text`: [Insert job description here]  
`rag_text`: [Insert RAG data here]  

**Output:**  
Provide a structured response following the above instructions, ensuring actionable and meaningful recommendations to improve alignment and enhance cosine similarity between the resume and job description.  
"""

COVER_LETTER_GENERATION_PROMPT = """
Act as a professional cover letter crafter. Your task is to draft a highly personalized and engaging cover letter based on the inputs provided: resume_text and job_description_text.

1. **Focus on Alignment with the Role:**  
   - Identify the four most important qualities, skills, or qualifications mentioned in the job description. Use these as the foundation to craft a narrative that highlights my strengths, experiences, and unique value to the role.  
   - Showcase how I have successfully applied these skills in relevant past experiences, using specific examples to make the narrative impactful and engaging.

2. **Address Company-Specific Challenges:**  
   - Analyze the job description to identify key challenges or pain points the role seeks to address. Clearly articulate how my skills, experiences, and problem-solving abilities position me as the ideal candidate to tackle these challenges.  
   - Include a brief mention of industry or role-related trends (if applicable) to demonstrate a forward-looking approach.

3. **Demonstrate Enthusiasm and Cultural Fit:**  
   - Reflect the company’s values and culture, explaining why I am excited about joining the organization and how this aligns with my personal and professional goals.  
   - Express genuine enthusiasm for contributing to the company’s mission and team while maintaining a tone of confidence and professionalism.  

4. **Compelling Structure and Tone:**  
   - Begin with an attention-grabbing introduction that conveys my excitement for the role and highlights what I bring to the table.  
   - Use the body paragraphs to illustrate my top skills, accomplishments, and how they address the company’s specific needs.  
   - Conclude with a summary of my value, a thank-you to the hiring manager, and a call-to-action for the next step (e.g., an interview).  

5. **Avoid Resume Repetition:**  
   - Do not copy directly from my resume. Instead, present my experiences in an engaging, story-like manner that demonstrates my impact and suitability for the role.  

6. **Formatting and Style:**  
   - Use a cheerful, enthusiastic, and professional tone that feels genuine and enjoyable to read.  
   - Ensure the letter is concise, clear, and skimmable, keeping it brief enough to read at a glance.  
   - Bold the most important keywords and phrases, especially those related to the specific skills and qualities mentioned in the job description.

Inputs provided will be in the following format:  
"resume_text": "",  
"job_description_text": ""  

"""

RAG_DATA_STRUCTURNG_PROMPT = """
You are an assistant that formats text data into JSON entries based on specific categories. Each entry contains `category`, `title`, and `text` fields, where `text` may contain multiple sentences or bullet points.

Your task is to:

1. Separate each sentence or bullet point in the `text` field into individual JSON entries.
2. For each entry, retain the original `category` and `title`, while expanding the `text` so that each line has its own JSON object.

Instructions based on `category`:

- **Work Experience**:
   - Expand each task or achievement into a separate `text` entry.
   - Retain metrics, tools, and descriptive elements.

- **Achievements**:
   - Expand each achievement into its own `text` entry with added context where possible.

- **Skills**:
   - List each skill individually, specifying its context or application if relevant.

Expected Output Format:

Return a list of JSON strings where each object has the following format:
{
  "category": "<category>",
  "title": "<title>",
  "text": "<expanded single line of text>"
}
Dont return anything else, for example dont return "Here is the processed output in JSON Format"
For example:

Input:
[
  {
    "category": "Work Experience",
    "title": "Bose",
    "text": "• Collected and curated high-quality language data for competitive and tech review analysis from Reddit via API, enhancing data comprehensiveness by 35% for model evaluation. • Integrated metrics collection in an AI interview assistant, capturing detailed insights on user engagement, feature relevance, and satisfaction scores, informing product sentiment analysis."
  },
  {
    "category": "Skills",
    "title": "Additional Skills",
    "text": "Python, SQL, Databricks"
  }
]

Output:
[
  {
    "category": "Work Experience",
    "title": "Bose",
    "text": "Collected and curated high-quality language data for competitive and tech review analysis from Reddit via API."
  },
  {
    "category": "Work Experience",
    "title": "Bose",
    "text": "Enhanced data comprehensiveness by 35% to improve model evaluation."
  },
  {
    "category": "Work Experience",
    "title": "Bose",
    "text": "Integrated metrics collection in an AI interview assistant."
  },
  {
    "category": "Work Experience",
    "title": "Bose",
    "text": "Captured detailed insights on user engagement, feature relevance, and satisfaction scores to inform product sentiment analysis."
  },
  {
    "category": "Skills",
    "title": "Additional Skills",
    "text": "Python"
  },
  {
    "category": "Skills",
    "title": "Additional Skills",
    "text": "SQL"
  },
  {
    "category": "Skills",
    "title": "Additional Skills",
    "text": "Databricks"
  }
]

Please process the entire `user_prompt` input according to these instructions and return the expanded output in JSON format.
"""

RAG_DATA_STRUCTURING_MODEL = "gpt-4o-mini"

IDENTIFY_JOB_DESCRIPTION_PROMPT = """
Act as a professional job posting analyzer. Your task is to process the provided text and extract all relevant and meaningful information about the job and the company, even if the text includes irrelevant or repetitive content. Filter out any unnecessary data (such as ads, promotional messages, unrelated links, or redundant instructions) and focus only on the details that matter.
Your goal is to ensure no valuable information is missed, specially information related to hiring manager and their contact information.
For the following input, return only the job description section:
"""

IDENTIFY_JOB_DESCRIPTION_MODEL = "gpt-4o-mini"


