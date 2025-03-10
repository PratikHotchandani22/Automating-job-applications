SUPABASE_RESUME_TABLE = "resume_data"
JOB_DETAILS_TABLE_NAME = "job_info"

IDENTIFY_DETAILS_FROM_RESUME_PROMPT_old = (
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
"Please make sure the output is a well-formed list and only include the information provided in the resume text. Each sentence should be informative and capture the essence of the section. Just provide the output directly, dont provide any other sentence like here is the output you want.. "
)

IDENTIFY_DETAILS_FROM_RESUME_PROMPT = """ 
You are a professional AI model tasked with extracting specific sections and their content from a resume. The resume will be provided to you in free text format. Your job is to identify key sections and extract their corresponding content, returning the information as a list of sentences formatted as strings.

Here is the resume text:

<resume>
{{RESUME_TEXT}}
</resume>

Identify and extract the following sections from the resume:

1. Name: The full name of the individual.
2. Contact Information: Including email, phone number, LinkedIn, and GitHub details.
3. Education: For each degree, include:
   - University/Institution name
   - Degree
   - GPA (if available)
   - Location
   - Duration of the study (start year - end year)
   - Relevant courses listed
4. Experience: For each experience entry, include:
   - Job title
   - Company name
   - Location
   - Duration (start date - end date)
   - All bullet points
5. Projects: For each project, include:
   - Project name
   - Technologies used
   - All bullet points 
6. Achievements: Any professional awards or recognitions
7. Technical Skills: List of technical skills including programming languages, libraries, and tools
8. Mentorship: All the bullet points mentioned under Mentorship

Format your response as a list of strings from the resume. Each sentence should start with a category label in all caps, followed by a colon and a space. For example:

NAME: John Doe
CONTACT: Email: john.doe@email.com, Phone: (123) 456-7890, LinkedIn: linkedin.com/in/johndoe
EDUCATION: Master of Science in Computer Science, Stanford University, Stanford, CA, GPA: 3.8, 2018-2020
EXPERIENCE: Software Engineer at Google, Mountain View, CA, June 2020 - Present: Developed machine learning algorithms for image recognition
PROJECT: ChatBot Assistant - Developed an AI-powered chatbot using Python and TensorFlow, improving customer service response times by 40%
ACHIEVEMENT: First place in the 2019 Stanford AI Hackathon
SKILLS: Python, Java, C++, TensorFlow, PyTorch, SQL, Git

Please ensure that:
1. Each sentence starts with the appropriate category label in all caps.
2. Information is concise but comprehensive, capturing the essence of each section.
3. Only information provided in the resume text is included.
4. The output is a well-formed list of sentences.
5. There are no introductory or concluding sentences; only the extracted information should be provided.

Begin extracting and formatting the information from the provided resume text now. Present your output as a list of strings, with each string representing a single piece of information from the resume.
"""

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

#IDENTIFY_DETAILS_FORM_RESUME_MODEL = "claude-3-5-sonnet-20240620"

IDENTIFY_DETAILS_FROM_JOB_MODEL = "gpt-4o-mini"

SUMMARIZE_JOB_DESCRIPTION_MODEL = "gpt-4o-mini"

PROVIDING_SUGGESTIONS_MODEL = "claude-3-5-sonnet-20240620"

#COVER_LETTER_GENERATION_MODEL = "gpt-4o-mini"

COVER_LETTER_GENERATION_MODEL = "claude-3-5-sonnet-20240620"

SUGGESTIONS_JOB_BASED_ON_RESUME_old = """
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

SUGGESTIONS_JOB_BASED_ON_RESUME = """
You are an expert resume writer specializing in tailoring work experiences to specific job descriptions. Your task is to analyze a job description and a candidate's current work experience, identify gaps, and refactor the work experience to better align with the job requirements.

First, carefully review the following job description:

<job_description>
{{JOB_DESCRIPTION}}
</job_description>

Next, examine the candidate's current work experience:

<work_experience>
{{WORK_EXPERIENCE}}
</work_experience>

To complete this task effectively, follow these steps:

1. Analyze the job description and the candidate's current work experience.
2. Identify gaps between the job requirements and the candidate's experience.
3. Refactor the work experience to better align with the job requirements.
4. Review and refine the refactored experience.

Before presenting the final refactored experience, complete your analysis inside <resume_analysis> tags to break down your thought process for each step. This will ensure a thorough and well-reasoned approach to the task. It's OK for this section to be quite long.

In your analysis, be sure to:
a. List key skills, qualifications, and responsibilities required for the position.
b. Compare each point from the work experience to the job requirements.
c. Identify gaps and areas for improvement.
d. Plan specific modifications for each work experience point.

Important: The refactored experience must be directly related to and based on the candidate's current work experience. Avoid adding drastically different elements; instead, enhance the existing experience to address identified gaps.

After your analysis, present your refactored work experience in the following format:

<refactored_experience>
[Include the refactored work experience points here, maintaining a similar structure and length to the original work experience]
</refactored_experience>

<explanation>
[Provide a brief explanation of the major changes made and how they address the requirements of the job description]
</explanation>

Remember to use specific, action-oriented language and quantify achievements where possible. The refactored experience should effectively position the candidate for the specific job they are applying for, without fabricating information or adding vague, meaningless statements.
"""

COVER_LETTER_GENERATION_PROMP_old = """
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

COVER_LETTER_GENERATION_PROMPT_old2 = """
Act as a professional cover letter crafter. Your task is to draft a **highly personalized and engaging cover letter** based on the inputs provided: resume_text and job_description_text.

1. **Focus on Alignment with the Role:**  
   - Identify the four most important qualities, skills, or qualifications mentioned in the job description. Use these as the foundation to craft a **specific and tailored narrative** that highlights my strengths, experiences, and unique value to the role.  
   - Use **clear and precise examples** of how I have successfully applied these skills in relevant past experiences, avoiding vague or filler language.

2. **Address Company-Specific Challenges:**  
   - Analyze the job description to identify **key challenges or pain points** the role seeks to address. Clearly articulate how my skills, experiences, and problem-solving abilities position me as the **ideal candidate** to tackle these challenges.  
   - If any required skills or experiences are not present, emphasize my **eagerness to learn** and **demonstrated ability to adapt quickly** by referencing examples from my resume or relevant projects.  
   - Include a brief mention of industry or role-related trends (if applicable) to demonstrate a **forward-looking approach.**

3. **Demonstrate Enthusiasm, Learning Interest, and Cultural Fit:**  
   - Reflect the company’s values and culture, explaining why I am excited about joining the organization and how this aligns with my personal and professional goals.  
   - Showcase my **interest in learning new skills** and **growing within the role**, backed by examples of my **fast learning abilities** and **curiosity** in past projects or experiences.  
   - Express genuine enthusiasm for contributing to the company’s mission and team while maintaining a tone of **confidence and professionalism**.

4. **Compelling Structure and Tone:**  
   - Begin with an **attention-grabbing introduction** that conveys my excitement for the role and highlights what I bring to the table.  
   - Use the body paragraphs to illustrate my top skills, accomplishments, and how they address the company’s specific needs while **showcasing my eagerness to grow and learn.**  
   - Conclude with a summary of my value, a **thank-you to the hiring manager**, and a **call-to-action** for the next step (e.g., an interview).  

5. **Avoid Resume Repetition:**  
   - Do not copy directly from my resume. Instead, present my experiences in an **engaging, story-like manner** that demonstrates my impact and suitability for the role.  
   - Highlight transferable skills and learning interest in areas where my experience might not align perfectly with the job description.

6. **Formatting and Style:**  
   - Use a **cheerful, enthusiastic, and professional tone** that feels genuine and enjoyable to read.  
   - Ensure the letter is **concise, clear, and skimmable**, keeping it brief enough to read at a glance.  
   - **Bold the most important keywords and phrases**, especially those related to the specific skills, qualities, and learning interest mentioned in the job description.

Inputs provided will be in the following format:  
"resume_text": "",  
"job_description_text": ""  
"""

COVER_LETTER_GENERATION_PROMPT = """
Act as a professional cover letter crafter. Your task is to draft a **short, engaging, and skimmable cover letter** based on the inputs provided: resume_text and job_description_text. The goal is to create a letter that can be read in **60 seconds or less**, using **bullet points** to highlight key strengths and avoid long paragraphs. The tone should be **professional yet approachable**, with a touch of enthusiasm.

### Key Guidelines:

1. **Focus on Role Alignment:**  
   - Identify the **top 3-4 skills or qualifications** from the job description and align them with my experiences.  
   - Use **specific examples** of how I’ve applied these skills successfully in the past, avoiding vague or filler language.

2. **Address Challenges and Value:**  
   - Highlight how I can solve the company’s **key challenges or pain points**, as inferred from the job description.  
   - If I lack certain skills, emphasize my **eagerness to learn** and provide examples of my adaptability or fast learning from past experiences.  

3. **Showcase Enthusiasm and Fit:**  
   - Reflect the company’s values and explain why I’m excited about joining the team.  
   - Mention my interest in learning, growth, and contributing to the company’s mission.  
   - Include my GitHub portfolio link: **https://pratikhotchandani22.github.io/portfolio/**.

4. **Structure and Tone:**  
   - Start with a **brief, attention-grabbing introduction** that conveys excitement for the role.  
   - Use **bullet points** in the body to showcase skills, accomplishments, and how they address the company’s needs.  
   - Conclude with a short summary of my value, a **thank-you**, and a clear **call-to-action** (e.g., request for an interview).  

5. **Avoid Resume Repetition:**  
   - Do not copy directly from my resume but present experiences in a way that demonstrates impact and suitability for the role.  
   - Highlight transferable skills where applicable.

6. **Formatting:**  
   - Keep it concise and easy to skim with bullet points instead of long paragraphs.  
   - Use a cheerful, confident tone while remaining professional.  

Inputs provided will be in the following format:  
"resume_text": "",  
"job_description_text": ""
"""

COVER_LETTER_GENERATION_PROMPT_ANTHROPIC = """
You are a professional cover letter crafter. Your task is to create a short, engaging, and skimmable cover letter based on the provided resume and job description. The cover letter should be readable in 60 seconds or less, using bullet points to highlight key strengths and avoid long paragraphs. The tone should be professional yet approachable, with a touch of enthusiasm.

First, carefully read and analyze the following inputs:

<resume>
{{RESUME_TEXT}}
</resume>

<job_description>
{{JOB_DESCRIPTION_TEXT}}
</job_description>

Now, follow these steps to craft the cover letter:

1. Analyze the job description to identify the top 3-4 skills or qualifications required for the role.

2. Review the resume to find specific examples that demonstrate these skills or qualifications.

3. Identify any key challenges or pain points mentioned in the job description that the candidate could address.

4. Note any company values or mission statements in the job description.

5. Craft the cover letter using the following structure:

   a. Brief, attention-grabbing introduction (1-2 sentences)
   b. 3-4 bullet points highlighting key skills and experiences aligned with the job requirements
   c. 1-2 bullet points addressing how the candidate can solve company challenges or add value
   d. 1 bullet point showcasing enthusiasm for the role and company fit
   e. Brief conclusion with a thank-you and call-to-action

6. Incorporate the following elements:
   - Specific examples of how the candidate has applied relevant skills successfully
   - Emphasis on eagerness to learn if certain skills are lacking
   - Mention of the candidate's GitHub portfolio link: https://pratikhotchandani22.github.io/portfolio/
   - A brief description of the candidate's personal qualities that align with the company culture and job requirements

7. Ensure the cover letter adheres to these guidelines:
   - Keep it concise and easy to skim
   - Use a cheerful, confident tone while remaining professional
   - Avoid directly copying from the resume
   - Highlight transferable skills where applicable

8. After drafting the cover letter, review it to ensure it can be read in 60 seconds or less.

Present your final cover letter draft within <cover_letter> tags. Do not include any explanations or comments outside of these tags.
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

RESUME_SUMMARY_PROMPT = """
Here is the candidate's experience:

<candidate_experience>
{{CANDIDATE_EXPERIENCE}}
</candidate_experience>

Here is the job description:

<job_description>
{{JOB_DESCRIPTION}}
</job_description>

You are an expert resume writer specializing in creating tailored summaries for data scientists, applied AI engineers, and machine learning engineers. Your task is to create a personalized and effective resume summary based on the information provided above.

Please follow these steps to create an effective resume summary:

1. Perform a detailed analysis of the job requirements and the candidate's qualifications. Wrap your analysis inside <detailed_analysis> tags:

<detailed_analysis>
a. Job Analysis:
   - List key job requirements (technical skills, experience, domain knowledge)
   - Identify main responsibilities
   - Note any unique challenges or pain points mentioned
   - Provide specific quotes from the job description for each point

b. Candidate Analysis:
   - Match the candidate's skills and experience to job requirements
   - Identify relevant projects or achievements
   - List specific quantifiable achievements from the candidate's experience
   - Note how the candidate's experience aligns with company needs
   - Provide specific quotes from the candidate's experience for each point

c. Unique Selling Points:
   - Identify 3-5 unique selling points of the candidate based on their experience and the job requirements

d. Summary Brainstorming:
   - Draft a strong opening statement
   - Select 2-3 key technical skills most relevant to the job
   - Choose a notable, quantifiable achievement
   - Identify how the candidate addresses a specific pain point
   - Show how the candidate's experience aligns with company needs

e. Draft Multiple Summaries:
   - Create 3 different versions of the resume summary
   - For each version, count the number of lines to ensure it's within 2-3 lines
   - Select the best version that meets all criteria

f. Ensure Conciseness:
   - Review your selected draft and identify ways to condense information
   - Prioritize the most impactful points to fit within 2-3 lines
   - Count the final number of lines to confirm it meets the requirement
</detailed_analysis>

2. Based on your analysis, create a personalized resume summary that meets the following criteria:
   - Begins with a strong opening statement about the candidate's experience and primary expertise
   - Highlights 2-3 key technical skills most relevant to the job
   - Includes a notable, quantifiable achievement
   - Addresses a specific pain point or challenge from the job description
   - Demonstrates alignment with company needs
   - Is concise (2-3 lines, absolutely no more than 3 lines)
   - Does not mention the company name directly

Present your final resume summary within <resume_summary> tags.

3. Provide a brief explanation of how each element of the summary addresses the job requirements and company needs. Enclose this explanation in <explanation> tags.

Your output should follow this structure:

<resume_summary>
[Concise 2-3 line summary tailored to the job description and candidate experience]
</resume_summary>

<explanation>
- Opening statement: [How it showcases relevant experience]
- Key skills: [Why these skills were chosen]
- Notable achievement: [How it demonstrates value]
- Addressing pain point: [How the candidate solves a company problem]
- Alignment with needs: [How the candidate fits the role]
</explanation>
"""

RESUME_SUMMARY_MODEL = "claude-3-5-sonnet-20240620"

COLD_EMAILS_MESSAGES_MODEL = "claude-3-5-sonnet-20240620"

COLD_EMAILS_MESSAGES_PROMPT = """

You are an AI assistant specialized in crafting personalized cold emails and LinkedIn messages for job applications. Your task is to analyze a job description and resume, then create tailored communications for a hiring manager and a recruiter.

Here is the job description for the position:

<job_description>
{{JOB_DESCRIPTION}}
</job_description>

Here is the applicant's resume:

<resume>
{{RESUME}}
</resume>

Before composing the emails and LinkedIn messages, please conduct a detailed analysis of the job description and resume. Wrap this analysis inside <application_analysis> tags. In your analysis:

1. List key requirements from the job description.
2. Extract and list key skills mentioned in the job description.
3. Identify matching qualifications from the resume.
4. Create a side-by-side comparison of job requirements and resume qualifications.
5. Identify any gaps between the job requirements and the applicant's qualifications.
6. Brainstorm ways to address these gaps in the emails/messages.
7. Extract the company name from the job description.
8. Identify the company's values or culture from the job description.
9. Brainstorm potential value propositions for each email (hiring manager and recruiter).
10. Identify unique selling points for:
    a) The hiring manager email
    b) The recruiter email

After your analysis, create two separate emails and two LinkedIn messages following these guidelines:

For Emails:

1. Subject Line:
   - For hiring manager: Highlight value proposition and relevance to team needs.
   - For recruiter: State target position and key qualification.

2. Greeting: Use "Dear Hiring Manager," or "Dear Recruiter," as appropriate.

3. Opening Paragraph:
   - Hiring manager: Introduce yourself and demonstrate company knowledge.
   - Recruiter: State position interest and key qualifications.

4. Body Paragraph(s):
   - Highlight 2-3 relevant skills or experiences aligning with job requirements.
   - Hiring manager: Focus on specific achievements and potential contributions.
   - Recruiter: Emphasize qualification match to job requirements.

5. Closing Paragraph:
   - Express enthusiasm for contributing to the company.
   - Include a clear call-to-action (e.g., request a brief call or meeting).

6. Signature: Professional sign-off, full name, and contact information.

Keep each email concise (150-200 words) and tailored to the recipient type.

For LinkedIn Messages:

1. Craft three 300-character messages for the hiring manager, highlighting key value propositions and expressing interest in the role.
2. Craft three 300-character messages for the recruiter, emphasizing top qualifications and stating interest in the position.
3. Select the best message for each recipient.

Present your response in the following format:

<cold_email_hiring_manager>
Outline:
[Brief outline of the email structure]

Email:
Subject: [Subject line for hiring manager]

[Full body of the email for hiring manager]
</cold_email_hiring_manager>

<cold_email_recruiter>
Outline:
[Brief outline of the email structure]

Email:
Subject: [Subject line for recruiter]

[Full body of the email for recruiter]
</cold_email_recruiter>

<linkedin_message_hiring_manager>
Option 1: [300-character LinkedIn message for hiring manager]
Option 2: [300-character LinkedIn message for hiring manager]
Option 3: [300-character LinkedIn message for hiring manager]

Selected message: [Copy the best message here]
</linkedin_message_hiring_manager>

<linkedin_message_recruiter>
Option 1: [300-character LinkedIn message for recruiter]
Option 2: [300-character LinkedIn message for recruiter]
Option 3: [300-character LinkedIn message for recruiter]

Selected message: [Copy the best message here]
</linkedin_message_recruiter>

Begin by analyzing the job description and resume, then proceed to craft both emails and LinkedIn messages.

"""

JOB_ANALYSIS_SUGGESTION_PROMPT = """
You are an expert AI resume optimization consultant. Your task is to refactor a given resume to perfectly align with a specific job description. This process will enhance the resume's chances of passing Applicant Tracking System (ATS) screening and impressing human recruiters.

First, let's review the job description and the candidate's current resume:

<job_description>
{{JOB_DESCRIPTION}}
</job_description>

<original_resume>
{{ORIGINAL_RESUME}}
</original_resume>

Please follow these steps to optimize the resume:

1. Analyze the Job Description
Examine the job description and extract key information. Wrap your analysis in <job_description_breakdown> tags, including:
- Exact job title and company name
- 10-15 most critical keywords and phrases
- Required technical skills
- Required soft skills
- Experience requirements
- Educational requirements
- Any unique or specific requirements

For each point, quote specific phrases from the job description. Rank the importance of each element on a scale of 1-5, with 5 being the most important.

2. Evaluate the Current Resume
Review the provided resume and identify its strengths and weaknesses. Wrap your evaluation in <resume_evaluation> tags, including:
- Current strengths that align with the job description (list separately with a numerical rating 1-5)
- Missing keywords or skills (list separately with a numerical rating 1-5)
- Experience descriptions that could be better aligned with the role
- Overall formatting and structure issues
- Areas where qualifications are present but not optimally phrased

Provide specific examples from the resume and suggest improvements for each point.

3. Perform Gap Analysis
Analyze the gaps between the job requirements and the candidate's qualifications. Wrap your analysis in <gap_analysis> tags, including:
- Skills or experiences mentioned in the job description but missing from the resume
- Qualifications present but not highlighted effectively
- Areas where experience needs to be reframed to better match job requirements

For each gap, provide a specific suggestion for addressing it in the refactored resume, including example phrasing where appropriate. Quantify the severity of each gap on a scale of 1-5, with 5 being the most severe. Then, brainstorm 2-3 potential solutions for each identified gap.

4. Refactor the Resume
Based on your analysis, refactor the resume as follows:

a) Rewrite the professional summary:
<professional_summary_analysis>
- Clearly state alignment with the exact position
- Include 3-4 strongest qualifications directly addressing key job requirements
- Incorporate 2-3 primary keywords naturally
- Maintain a confident, professional tone
</professional_summary_analysis>

b) Refactor Mentorship description:
<mentorship>
- Focus on soft skills relevant to the role
- Emphasize responsibilities and mentorship skills most relevant to the target job
- Replace generic language with specific terminology from the job description
- Transform passive descriptions into active statements with quantifiable results
- Naturally integrate keywords from the job description
- Ensure all information remains truthful and directly related to the candidate's actual work history
</mentorship>

c) Refactor work experience descriptions:
<work_experience_analysis>
- Focus only on experiences and projects relevant to the role
- Emphasize responsibilities and achievements most relevant to the target job
- Replace generic language with specific terminology from the job description
- Transform passive descriptions into active statements with quantifiable results
- Naturally integrate keywords from the job description
- Follow the format: [Action Verb] + [Task/Responsibility] + [Result/Impact]
- Ensure all information remains truthful and directly related to the candidate's actual work history

Consider these guidelines for creating effective resume bullet points:
1. Use powerful action verbs to start each bullet point
2. Clearly state the task or responsibility performed
3. Quantify or qualify the outcome or impact of the work
4. Incorporate exact keywords and phrases from the job description
5. Prioritize relevance to the target job
6. Maintain consistency in formatting and verb tenses
</work_experience_analysis>

d) Optimize the skills section:
<skills_analysis>
- Prioritize skills directly matching job requirements
- Add relevant skills from the job description that are possessed but not listed
- Organize skills into categories mirroring the job description structure
- Remove skills irrelevant to this specific position
</skills_analysis>

5. ATS Optimization
Provide specific suggestions for ATS optimization in <ats_optimization> tags:
- Optimal keyword density and placement
- Any other technical considerations to maximize ATS performance

6. Human Readability Check
Ensure the refactored resume remains readable and appealing to human recruiters. Wrap your check in <human_readability> tags:
- Natural and not obviously keyword-stuffed
- Compelling for human readers
- Honest and authentic to the actual experience
- Professionally formatted and concise

7. Output the Refactored Resume
Provide the refactored resume in the following format:

<refactored_resume>
<professional_summary>
[Professional Summary content]
</professional_summary>

<skills>
[Skills content, organized by categories]
</skills>

<work_experience>
[Work Experience content, including relevant projects]
</work_experience>

<projects>
[Any standalone projects not included in Work Experience]
</projects>

<education>
[Education details]
</education>

<mentorship>
[Mentorship details]
</mentorship>

[Additional Sections as Needed]
</refactored_resume>

8. List Missing Keywords or Skills
List any keywords or skills from the job description that are not present in the original resume but should be considered for inclusion if the candidate possesses them. Wrap this list in <missing_keywords_skills> tags.

Remember to only include the sections that are present in the original resume and relevant to the job description. Ensure that all information is accurate and truthful to the original resume while optimizing for the target position."""

JOB_ANALYSIS_SUGGESTION_MODEL = "claude-3-5-sonnet-20240620"