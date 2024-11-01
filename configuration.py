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

SUMMARIZE_JOB_DESCRIPTION_MODEL = "llama-3.1-8b-instant"