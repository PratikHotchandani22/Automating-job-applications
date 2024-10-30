import ollama
import json
import pandas as pd
import getpass
import os
from langchain_groq import ChatGroq
import streamlit as st
from credentials import GROQ_API


RESUME_PROMPT = """
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


SUMMARY_PROMPT = "Summarize the job details provided, starting with whether the position offers visa sponsorship. Next, describe the type of role and the ideal candidate profile, including key responsibilities, required skills, and years of experience. Conclude with an explanation of what kind of applicants would be top contenders, highlighting any specific technical and soft skills valued for success in this role."


async def run_llama_prompt(prompt, model="llama3-8b-8192"):
    """
    Function to run a custom prompt on LLaMA 3.1 using the Ollama API.

    Args:
    - prompt (str): The input text you want to send to the model.
    - model (str): The model version to use (default is LLaMA 3.1).
    - max_tokens (int): The maximum number of tokens to generate in the response (default is 100).
    - temperature (float): The sampling temperature to use (default is 0.7). 
        Higher values produce more random outputs, while lower values make the output more deterministic.

    Returns:
    - str: The response from the model or an error message.
    """
    try:
        # Ensure prompt is a non-empty string
        if not isinstance(prompt, str) or not prompt.strip():
            raise ValueError("Prompt must be a non-empty string.")

        print("Generating llama response .... ")
        # Send the custom prompt to the LLaMA 3.1 model

        llm = ChatGroq(
            api_key = GROQ_API,
            model=model,
            temperature=0,
            max_tokens=None,
            timeout=None,
            max_retries=2,
            # other params...
        )

        messages = [
            (
                "system",
                f"{RESUME_PROMPT}",
            ),
            ("human", f"{prompt}"),
        ]
        ai_msg = llm.invoke(messages)
        
        return ai_msg.content

    except ValueError as ve:
        return f"Input Error: {str(ve)}"
    except KeyError as ke:
        return f"Response Error: {str(ke)}"
    except Exception as e:
        return f"Unexpected Error: {str(e)}"

async def summarize_job_description(systemPrompt, userPrompt, model="llama3-8b-8192"):
    """
    Function to run a custom prompt using the Groq API to summarize job description.

    Args:
    - prompt (str): The input text you want to send to the model.
    - model (str): The model version to use (default is LLaMA 3.1).
    - max_tokens (int): The maximum number of tokens to generate in the response (default is 100).
    - temperature (float): The sampling temperature to use (default is 0.7). 
        Higher values produce more random outputs, while lower values make the output more deterministic.

    Returns:
    - str: The response from the model or an error message.
    """
    try:
        # Ensure prompt is a non-empty string
        if not isinstance(userPrompt, str) or not userPrompt.strip():
            raise ValueError("Prompt must be a non-empty string.")

        print("Generating summary of the job description.... ")
        # Send the custom prompt to the LLaMA 3.1 model

        llm = ChatGroq(
            api_key = GROQ_API,
            model=model,
            temperature=0.5,
            max_tokens=None,
            timeout=None,
            max_retries=2,
            # other params...
        )

        messages = [
            (
                "system",
                f"{systemPrompt}",
            ),
            ("human", f"{userPrompt}"),
        ]
        ai_msg = llm.invoke(messages)

        return ai_msg.content

    except ValueError as ve:
        return f"Input Error: {str(ve)}"
    except KeyError as ke:
        return f"Response Error: {str(ke)}"
    except Exception as e:
        return f"Unexpected Error: {str(e)}"

def parse_response_to_df(response):
    # Check if response is None or an empty string
    if response is None or (isinstance(response, str) and not response.strip()):
        st.write("The response is empty or None.")
        return None

    # Check if response is a string and not empty
    if isinstance(response, str):
        st.write("Response content:", response)  # Check the actual content of response
        try:
            st.write("Attempting to decode JSON string...")
            response = json.loads(response)  # Attempt to parse JSON string to dict
        except json.JSONDecodeError as e:
            st.write("Failed to decode JSON. Please check the format of the response.")
            st.write("Error message:", str(e))
            return None

    elif not isinstance(response, dict):
        st.write("The response is neither a dictionary nor a JSON string.")
        st.write("Type of response:", type(response))
        return None

    # Define default data structure
    data = {
        "company_name": response.get("Company name"),
        "position_name": response.get("Position name"),
        "seniority_level": response.get("Seniority level"),
        "joining_date": response.get("Joining date"),
        "team_name": response.get("Team name"),
        "location": response.get("Location"),
        "salary": response.get("Salary"),
        "hybrid_or_remote": response.get("Hybrid or Remote?"),
        "company_description": response.get("Company description"),
        "team_description": response.get("Team description"),
        "job_responsibilities": response.get("Job responsibilities", []),
        "preferred_skills": response.get("Preferred skills", []),
        "required_skills": response.get("Required skills", []),
        "exceptional_skills": response.get("Exceptional skills", []),
        "technical_keywords": response.get("Technical keywords", []),
        "necessary_experience": response.get("Necessary experience"),
        "bonus_experience": response.get("Bonus experience"),
        "job_role_classifications": response.get("Job role classifications", []),
        "company_values": response.get("Company values", []),
        "benefits": response.get("Benefits", []),
        "soft_skills": response.get("Soft skills", []),
        "sponsorship": response.get("Visa Sponsorship")
    }

    # Convert to DataFrame
    job_info_df = pd.DataFrame([data])  # Wrap data in list to create a single-row DataFrame
    job_info_df.to_csv("parsed_llm_response.csv", index=False)
    return job_info_df

def save_job_dict_response(job_dict, string_data):

    if string_data == "job":
        # Step 3: Save the dictionary to a JSON file
        with open('job_data.json', 'w') as json_file:
            json.dump(job_dict, json_file, indent=4)

        print("Job data saved to 'job_data.json'")

    else:
        # Step 3: Save the dictionary to a JSON file
        with open('suggestions_data.json', 'w') as json_file:
            json.dump(job_dict, json_file, indent=4)

        print("Job data saved to 'suggestions_data.json'")


