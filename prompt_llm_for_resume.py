import ollama

async def run_llama_prompt(prompt, model="llama3.1"):
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

        # Send the custom prompt to the LLaMA 3.1 model
        response = ollama.generate(
            model=model,
            prompt=prompt
        )
        
        return response

    except ValueError as ve:
        return f"Input Error: {str(ve)}"
    except KeyError as ke:
        return f"Response Error: {str(ke)}"
    except Exception as e:
        return f"Unexpected Error: {str(e)}"

RESUME_PROMPT = """
You are a very smart job application finder. Your task is to extract specific information from a provided job description text. Specifically, identify and extract the following details:

1. Company name
2. Position name
3. Seniority level
4. Joining date
5. Team name
6. Location
7. Salary
8. Hybrid or Remote?
9. What does the company do?
10. What does the team do?
11. List of job responsibilities
12. Skills that are preferred to have
13. Skills that are absolutely required to have
14. Exceptional skills the team would appreciate if you have
15. Technical keywords relevant to the job role
16. Necessary experience
17. Bonus experience
18. Multi-label classification of the job role into:
    A. Data Scientist
    B. Data Analyst
    C. Software Engineer
    D. Data Engineer
    E. Machine Learning Engineer
    F. AI Engineer
    G. Gen AI Engineer
    H. NLP Engineer
19. Company values they would love in the candidate
20. Benefits
21. Soft skills required for the role

Example job description:
\"\"\"
We are seeking a Senior Software Engineer to join the Artificial Intelligence team at Tech Solutions Corp starting from January 2024. The role is based remotely, with an optional hybrid arrangement available from our San Francisco office. The salary range for this position is $120,000 to $150,000 per year. Tech Solutions Corp. specializes in providing cutting-edge AI technologies to various industries. The AI team focuses on developing machine learning models and AI-driven applications. Responsibilities include designing algorithms, conducting experiments, and deploying scalable software solutions. Preferred skills include experience with containerization and cloud services. Required skills are proficiency in Python and experience with TensorFlow. Exceptional skills such as knowledge of reinforcement learning would be appreciated. Keywords: Machine Learning, AI, Python, TensorFlow, Cloud Services, Docker. Required experience includes 5+ years of software development and 3+ years of experience in AI projects. Bonus experience includes contributions to open-source projects. 

Values: Innovativeness, teamwork, and commitment to excellence.
Benefits: 401(k), health insurance, and remote work options.
Soft skills required: Strong communication skills, problem-solving, and teamwork.

Job role classification: 
- Software Engineer
\"\"\"

From the example above, extract the following details:
1. Company name: Tech Solutions Corp.
2. Position name: Senior Software Engineer
3. Seniority level: Senior
4. Joining date: January 2024
5. Team name: Artificial Intelligence
6. Location: San Francisco (optional hybrid) / Remote
7. Salary: $120,000 to $150,000 per year
8. Hybrid or Remote?: Remote (optional hybrid)
9. What does the company do?: Tech Solutions Corp. specializes in providing cutting-edge AI technologies to various industries.
10. What does the team do?: The AI team focuses on developing machine learning models and AI-driven applications.
11. List of job responsibilities: Designing algorithms, conducting experiments, and deploying scalable software solutions.
12. Skills that are preferred to have: Experience with containerization and cloud services.
13. Skills that are absolutely required to have: Proficiency in Python and experience with TensorFlow.
14. Exceptional skills the team would appreciate: Knowledge of reinforcement learning.
15. Technical keywords relevant to the job role: Machine Learning, AI, Python, TensorFlow, Cloud Services, Docker.
16. Necessary experience: 5+ years of software development and 3+ years of experience in AI projects.
17. Bonus experience: Contributions to open-source projects.
18. Job role classification: C. Software Engineer
19. Company values: Innovativeness, teamwork, and commitment to excellence.
20. Benefits: 401(k), health insurance, and remote work options.
21. Soft skills required: Strong communication skills, problem-solving, and teamwork.

Please provide the job description text from which you require information.

"""

import json

def extract_info_from_response(response):
    """
    Extracts information from the 'response' key in the provided dictionary.

    Args:
        response (dict): A dictionary containing the 'response' key.

    Returns:
        dict: A dictionary containing the extracted information in JSON format.

    Raises:
        ValueError: If no relevant information is found in the response.
        json.JSONDecodeError: If the extracted JSON string is not valid.
    """
    
    # Step 1: Extract the string from the 'response' key in the dictionary
    response_str = response.get('response')  # Safely access the string associated with the 'response' key

    if response_str is None:
        raise ValueError("The 'response' key is missing or contains None.")

    # Step 2: Find the index where the relevant information starts
    start_index = response_str.find("Here are the extracted details:")
    
    if start_index != -1:
        # Extract the substring starting from the relevant part
        json_str = response_str[start_index:].split("\\n")[-1]  # Split to get the last part after line breaks
    else:
        raise ValueError("No relevant information found in the response.")

    # Step 3: Clean the extracted string to ensure it's valid JSON
    json_str = json_str.replace("And here is the extracted information in JSON format:", "").strip()
    json_str = json_str.replace('\\n', '').replace('\\', '')  # Remove unnecessary escape characters

    # Step 4: Load the cleaned JSON string into a Python dictionary
    try:
        extracted_info = json.loads(json_str)
        # Return the structured data
        return extracted_info
    except json.JSONDecodeError as e:
        print("JSON Decode Error:", e)
        print("Extracted JSON string was:", json_str)  # Print the extracted JSON for debugging
        raise
