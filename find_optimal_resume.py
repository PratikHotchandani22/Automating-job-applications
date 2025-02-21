import numpy as np
import pandas as pd
import os
from resume_text import extract_text_from_docx, extract_resume_sections_langchain, clean_llm_response_for_resume
from sklearn.metrics.pairwise import cosine_similarity
from prompt_llm_for_resume import run_llama_prompt
import streamlit as st
from prompt_openai import run_openai_chat_completion
import json
from credentials import ANTHROPIC_API
from llm_api_calls_LiteLLM import run_liteLLM_call
from prompt_anthropic import run_anthropic_chat_completion


os.environ["ANTHROPIC_API_KEY"] = ANTHROPIC_API


TEMP_DIR = "temp_dir"
os.makedirs(TEMP_DIR, exist_ok=True)  # This will create the directory if it does not exist

async def process_resumes(file_paths, IDENTIFY_DETAILS_FROM_RESUME_PROMPT, model):
    all_resumes = []  # List to collect resumes as dicts

    for file_path in file_paths:
        if not os.path.exists(file_path):
            print(f"File not found: {file_path}")
            continue
        
        print(f"Processing file: {file_path}")
        
        # Extracting text from the resume
        print("Extracting text...")
        resume_text = extract_text_from_docx(file_path)
        
        # Extracting resume name from file path
        resume_name = os.path.basename(file_path).split('.')[0]  # Assuming file name is the resume name
        
        # Extracting sections using LLM
        print("Extracting sections using LLM...")
        #resume_llm_response = await extract_resume_sections_langchain(IDENTIFY_DETAILS_FROM_RESUME_PROMPT, model, resume_text)
        resume_llm_response = await run_openai_chat_completion(st.session_state.openai_client, json.dumps(resume_text), IDENTIFY_DETAILS_FROM_RESUME_PROMPT,model)

        #resume_llm_response = await run_liteLLM_call(json.dumps(resume_text), IDENTIFY_DETAILS_FROM_RESUME_PROMPT, model)
        # Cleaning the LLM response
        cleaned_resume_llm_response = clean_llm_response_for_resume(resume_llm_response)

        # Append to all_resumes list
        all_resumes.append({
            'resume_name': resume_name,
            'resume_text': cleaned_resume_llm_response
        })

    # Convert to DataFrame
    return pd.DataFrame(all_resumes)

def find_best_resume(resume_df, job_desc_embedding):

    # Ensure embeddings are numpy arrays
    resume_embeddings = np.vstack(resume_df['resume_embedding'].to_numpy())
    job_desc_embedding = np.vstack(job_desc_embedding['job_description_embeddings'].to_numpy()).reshape(1, -1)
    
    # Calculate cosine similarity and get percentage match
    similarities = cosine_similarity(resume_embeddings, job_desc_embedding)
    resume_df['percentage_match'] = similarities.flatten() * 100  # Convert to percentage

    # Get resume_data with the highest match
    best_resume_row = resume_df.loc[resume_df['percentage_match'].idxmax()]
    best_resume_data = best_resume_row['resume_text']  # Extract the resume text
    return best_resume_data, resume_df  # Return best match resume text and full DataFrame with percentage matches

def find_rag_data_match_percentage(rag_df, job_desc_embedding):

    # Ensure embeddings are numpy arrays
    rag_embeddings = np.vstack(rag_df['text_embedding'].to_numpy())
    job_desc_embedding = np.vstack(job_desc_embedding['job_description_embeddings'].to_numpy()).reshape(1, -1)
    
    # Calculate cosine similarity and get percentage match
    similarities = cosine_similarity(rag_embeddings, job_desc_embedding)
    rag_df['percentage_match'] = similarities.flatten() * 100  # Convert to percentage

    # Get resume_data with the highest match
    best_rag_data = rag_df[rag_df['percentage_match'] >= 30 ]
    #best_rag_row = rag_df.loc[rag_df['percentage_match'].idxmax()]
    #best_rag_data = best_rag_row['text']  # Extract the rag text
    return best_rag_data, rag_df  # Return best match rag text and full DataFrame with percentage matches

async def get_file_paths(uploaded_files):
    file_paths = []
    
    for uploaded_file in uploaded_files:
        # Save the uploaded files temporarily
        file_path = os.path.join(TEMP_DIR, uploaded_file.name)
        with open(file_path, "wb") as f:
            f.write(uploaded_file.getbuffer())
        file_paths.append(file_path)

    return file_paths

async def suggest_resume_improvements(openai_client, system_prompt, structured_job_data, resume_text, rag_text, model_name, model_temp):
    
    ## Construct a user_prompt that will have structure job description 
    # Convert all columns in the job description DataFrame to a single text string
    #job_description_text = " ".join(structured_job_data.fillna("").astype(str).values.flatten())

    # Prepare the user_prompt with resume_text and job_description_text
    user_prompt = f'''
    "resume_text" : "{resume_text}",
    "job_description_text" : "{structured_job_data}",
    "rag_text" : "{rag_text}",
    '''
    
    # Generate suggestions using the LLaMA model
    suggestions = await run_openai_chat_completion(openai_client, user_prompt, system_prompt, model_name, model_temp)
    
    return suggestions

async def prepare_cover_letter(openai_client, system_prompt, llama_response, best_resume_text, model_name, model_temp):

    ## Construct a user_prompt that will have structure job description 
    # Convert all columns in the job description DataFrame to a single text string
    #job_description_text = " ".join(structured_job_data.fillna("").astype(str).values.flatten())

    # Prepare the user_prompt with resume_text and job_description_text
    user_prompt = f'''
    "resume_text" : "{best_resume_text}",
    "job_description_text" : "{llama_response}"
    '''

    # Generate suggestions using the LLaMA model
    #cover_letter = await run_openai_chat_completion(openai_client, user_prompt, system_prompt, model_name, model_temp)
    #cover_letter = await run_liteLLM_call(json.dumps(user_prompt), system_prompt, model_name)
    cover_letter = await run_anthropic_chat_completion(st.session_state.anthropic_client, json.dumps(user_prompt), system_prompt, model_name)

    return cover_letter['content']