import docx
import streamlit as st
from langchain_groq import ChatGroq
from credentials import GROQ_API
import re

def extract_text_from_docx(file_path):
    # Open the .docx file
    doc = docx.Document(file_path)
    
    # Extract all the text
    resume_text = []
    for paragraph in doc.paragraphs:
        # Add non-empty paragraphs to the list
        if paragraph.text.strip():
            resume_text.append(paragraph.text.strip())
    
    return resume_text
 
async def extract_resume_sections_langchain(prompt, model_name, resume_text):
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
            model=model_name,
            temperature=0,
            max_tokens=None,
            timeout=None,
            max_retries=2,
            # other params...
        )

        messages = [
            (
                "system",
                f"{prompt}",
            ),
            ("human", f"{resume_text}"),
        ]
        ai_msg = llm.invoke(messages)
        
        return ai_msg.content

    except ValueError as ve:
        return f"Input Error: {str(ve)}"
    except KeyError as ke:
        return f"Response Error: {str(ke)}"
    except Exception as e:
        return f"Unexpected Error: {str(e)}"


def remove_json_prefix(text):
    # Remove "json" at the start and any leading whitespace after it
    if text.strip().startswith("json"):
        return text.strip()[4:].strip()
    return text.strip()

def clean_llm_response_for_resume(response):
    modified_text = remove_json_prefix(response)
    cleaned_json_text = modified_text.replace('\n', '').strip()
    cleaned_json_text = cleaned_json_text.replace('[', '').strip()
    cleaned_json_text = cleaned_json_text.replace(']', '').strip()
    cleaned_json_text = cleaned_json_text.replace("```", '').strip()

    return cleaned_json_text

