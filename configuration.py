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
    "Salary": null,
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
You are an expert summarizer for job roles, providing insights into the perfect summary of the job's requirements. Your job is to clearly summarize the top necessary skills, qualifications, and requirements needed for success in this role.

Summarize the job details provided, addressing the following points in order:

1. Company Overview: Provide summary of what the company does, who could be my clients, is it a product based or service based.
2. Role name
3. Team: Specify the team this role is for (e.g., "Data Science and Analytics," "Product Engineering").
4. Location
5. Salary
6. Any security clearance required like (Secret or TS/SCI)? 
7. Visa sponsorship: Indicate if the position offers visa sponsorship. Answer only with "[Yes, No, N/A]".
8. Years of experience required.
9. Employment type: Specify if the position is part-time, full-time, or contract-based.
10. Key skills: List the top 5 skills and qualifications in order of importance. Avoid placing very common skills like Python (and related libraries) or SQL, NLP, as these are assumed to be widely held.
11. What would me my day to day work would look like (dont halucinate, only provide what is given in responsibilities)?

Important instructions:
1. Sort the skills and qualifications from most important to least important based on the job description.
2. Keep the list of skills concise, focusing on distinguishing requirements for this role rather than universally common skills(python, sql, nlp).
3. Ensure the "Top Contender" description is brief, containing only essential keywords to capture the role's core demands.
"""

EMBEDDING_MODEL = "text-embedding-3-small"

IDENTIFY_DETAILS_FORM_RESUME_MODEL = "llama-3.1-8b-instant"

IDENTIFY_DETAILS_FROM_JOB_MODEL = "llama-3.1-8b-instant"

SUMMARIZE_JOB_DESCRIPTION_MODEL = "llama3-70b-8192"

PROVIDING_SUGGESTIONS_MODEL = "llama3-70b-8192"

COVER_LETTER_GENERATION_MODEL = "llama3-70b-8192"

SUGGESTIONS_JOB_BASED_ON_RESUME = """ 
You will receive two inputs: resume_text and job_description_text. 
Your task is to analyze both texts to enhance alignment and improve cosine similarity between resume_text and job_description_text.

1. Start by reviewing job_description_text to identify technical keywords. Compare these keywords against the skills section in resume_text. For each missing keyword, suggest where it should be added in the skills category and provide the answer as a list of necessary additions for each section.

2. Identify specific skills, experience, and responsibilities mentioned in the job description but not present in the resume. 

3. Based on these identified skills, experience, and responsibilities, prepare concise, actionable points that can be seamlessly added to the resume.

4. Ensure all suggestions are tailored to reflect the real work experience and achievements in resume_text. Avoid generic or AI-generated language by closely aligning recommendations with actual experience described in the resume.

5. For each recommendation, specify exactly where the update should be made in resume_text, whether in the skills section, specific bullet points under work experience, or any other relevant section.

6. From the RAG data provided, provide a header **Best suggestions from RAG data**, and format the response such that all `text` values for the same `category` and `title` are grouped together. Format the response like this:

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

COVER_LETTER_GENERATION_PROMPT = """
Act as a professional cover letter crafter. Your task is to draft a personalized cover letter based on the inputs provided: resume_text and job_description_text.

First, identify the four most important qualities or skills the job description seeks in an ideal candidate. Use these "four points" as the foundation to highlight my strengths and experiences, showcasing why I am a perfect fit for this role. Additionally, emphasize any specific skills mentioned in the job description and illustrate how I have successfully applied these skills in relevant experiences.

Identify the key challenges or pain points this position aims to address for the company, and articulate how my skills and experiences position me as an ideal candidate to solve them. Emphasize how my unique contributions would support the company's goals and address these challenges effectively.

Mention how the company's values align with my own, explaining why joining this team would create a mutually beneficial and inspiring partnership.

Keep the tone cheerful, enthusiastic, and engaging. Ensure the cover letter is concise, clear, and crafted in a way that feels genuine and enjoyable to read. Avoid copying directly from my resume; instead, present my experiences in an interesting way that demonstrates my enthusiasm and suitability for the role.

Bold the most important keywords, especially the specific skills and qualities mentioned in the job description.

Inputs provided will be in the format as below: "resume_text" : "", "job_description_text" :  
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

RAG_DATA_STRUCTURING_MODEL = "llama3-70b-8192"

IDENTIFY_JOB_DESCRIPTION_PROMPT = """
Extract the main job description, including qualifications, responsibilities, skills, and any relevant information directly related to the nature of the job role. Do not include company information, application instructions, or compensation details. The output should focus on the key qualifications, tasks, responsibilities, and desired skills listed for the role.
For the following input, return only the job description section:
"""

IDENTIFY_JOB_DESCRIPTION_MODEL = "llama3-70b-8192"