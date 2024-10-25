import docx
import pandas as pd
from langchain_ollama import ChatOllama
import json
import numpy as np
from pprint import pprint


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
    #responses = []  # Store model responses

    try:
        print("Prompt template is valid.")

        # Define the LLM with customizable parameters
        llm = ChatOllama(
            model=model_name,
            temperature=0.2  # Adjust temperature as needed
        )
        
        # Prepare the messages for the LLM
        messages = [
            ("system", prompt),
            ("human", f"resume text: {resume_text}")
        ]

        # Invoke the model
        response = llm.invoke(messages)

        # Append the response
        #responses.append(response.content)

        return response.content

    except Exception as e:
        print(f"Error occurred: {e}")
        return response.content  # Return DataFrame with responses on error
    

def clean_llm_response_for_resume(response):
    cleaned_json_text = response.replace('\n', '').strip()
    cleaned_json_text = cleaned_json_text.replace('[', '').strip()
    cleaned_json_text = cleaned_json_text.replace(']', '').strip()
    cleaned_json_text = cleaned_json_text.replace("```", '').strip()

    return cleaned_json_text


