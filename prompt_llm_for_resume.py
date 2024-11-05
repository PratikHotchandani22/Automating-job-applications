import json
import pandas as pd
from langchain_groq import ChatGroq
import streamlit as st
from credentials import GROQ_API

async def run_llama_prompt(user_prompt, system_prompt, model):
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
        if not isinstance(user_prompt, str) or not user_prompt.strip():
            raise ValueError("user_prompt must be a non-empty string.")

        print("Generating llama response .... ")
        # Send the custom prompt to the LLaMA 3.1 model

        llm = ChatGroq(
            api_key = GROQ_API,
            model=model,
            temperature=0.2,
            max_tokens=None,
            timeout=None,
            max_retries=2,
            # other params...
        )

        messages = [
            (
                "system",
                f"{system_prompt}",
            ),
            ("human", f"{user_prompt}"),
        ]

        ai_msg = llm.invoke(messages)
        
        return ai_msg.content

    except ValueError as ve:
        return f"Input Error: {str(ve)}"
    except KeyError as ke:
        return f"Response Error: {str(ke)}"
    except Exception as e:
        return f"Unexpected Error: {str(e)}"

async def summarize_job_description(systemPrompt, userPrompt, model):
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
            temperature=0,
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
        #st.write("Response content:", response)  # Check the actual content of response
        try:
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
