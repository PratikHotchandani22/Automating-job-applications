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
4. Ensure the JSON is correctly formatted to facilitate easy parsing.

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
Summarize the job details provided, starting with whether the position offers
visa sponsorship. Next, describe the type of role and the ideal candidate profile, including key 
responsibilities, required skills, and years of experience. Conclude with an explanation of what 
kind of applicants would be top contenders, highlighting any specific technical and soft skills 
valued for success in this role."""

EMBEDDING_MODEL = "text-embedding-3-small"

IDENTIFY_DETAILS_FORM_RESUME_MODEL = "llama-3.1-8b-instant"

IDENTIFY_DETAILS_FROM_JOB_MODEL = "llama-3.1-8b-instant"

SUMMARIZE_JOB_DESCRIPTION_MODEL = "llama3-70b-8192"

PROVIDING_SUGGESTIONS_MODEL = "llama3-70b-8192"

COVER_LETTER_GENERATION_MODEL = "llama3-70b-8192"

SUGGESTIONS_JOB_BASED_ON_RESUME_old = """ 
You will receive two inputs: resume_text and job_description_text. 
Your task is to analyze the content of both texts and identify ways to align the resume_text more closely with the 
job_description_text to improve cosine similarity. For each recommendation, provide specific phrases, keywords, or sections 
from the job_description_text and suggest how they can be directly incorporated into the resume points in resume_text. 

Your suggestions should be formatted so that they can be seamlessly copy-pasted into the resume without extensive rewriting. 
Use the format and structure of existing resume points wherever possible, and ensure that your recommendations are 
strictly based on the job description's context without adding unrelated information.

Inputs provided will be in the format as below:
"resume_text" : "",
"job_description_text" : ""
"""

SUGGESTIONS_JOB_BASED_ON_RESUME = """ 
You will receive two inputs: resume_text and job_description_text. 
Your task is to analyze the content of both texts and identify ways to align the resume_text more closely with the 
job_description_text to improve cosine similarity. Provide recommendations structured in the S-T-A-R format (Situation, Task, Analysis, Result), ensuring each suggestion is brief, confident, and can be easily integrated into the resume. 

For each recommendation, specify the Situation and Task from the job_description_text, followed by an Analysis and Result that would fit the tone and structure of resume_text points. Ensure that recommendations are strictly derived from the job description context and formatted to be direct and to the point.

Inputs provided will be in the format as below:
"resume_text" : "",
"job_description_text" : ""
"""

COVER_LETTER_GENERATION_PROMPT = """ 
Act as a professional cover letter crafter. Your task is to draft a personalized cover letter based on the inputs provided: resume_text and job_description_text.

1. First, identify the **four most important qualities** or skills the job description seeks in an ideal candidate. Use these "four points" as the foundation to highlight my strengths and experiences, showcasing why I am a perfect fit for this role.
   
2. Identify the **key challenges or pain points** this position aims to address for the company, and articulate how my skills and experiences position me as an ideal candidate to solve them. Emphasize how my unique contributions would support the company's goals and address these challenges.

3. Mention how the **company's values align with my own**, explaining why joining this team would create a mutually beneficial and inspiring partnership.

4. Keep the tone **cheerful, enthusiastic, and engaging**. Ensure the cover letter is concise, clear, and crafted in a way that feels genuine and enjoyable to read. Avoid copying directly from my resume; instead, present my experiences in an interesting way that demonstrates my enthusiasm and suitability for the role.

Inputs provided will be in the format as below:
"resume_text" : "",
"job_description_text" : ""
"""
