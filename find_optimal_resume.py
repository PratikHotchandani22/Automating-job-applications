import numpy as np
import pandas as pd
import os
from resume_text import extract_text_from_docx, extract_resume_sections_langchain, clean_llm_response_for_resume
from sklearn.metrics.pairwise import cosine_similarity
from prompt_llm_for_resume import run_llama_prompt
import streamlit as st

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
        resume_llm_response = await extract_resume_sections_langchain(IDENTIFY_DETAILS_FROM_RESUME_PROMPT, model, resume_text)
        
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
    st.write("finding optimal resume")
    st.write("resume")
    st.dataframe(resume_df)
    st.write("job")
    st.dataframe(job_desc_embedding)

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

async def get_file_paths(uploaded_files):
    file_paths = []
    
    for uploaded_file in uploaded_files:
        # Save the uploaded files temporarily
        file_path = os.path.join(TEMP_DIR, uploaded_file.name)
        with open(file_path, "wb") as f:
            f.write(uploaded_file.getbuffer())
        file_paths.append(file_path)

    return file_paths

async def suggest_resume_improvements(llama_response_dict, resume_text, model_name="llama3.1:8b"):
    # Convert the dictionary into a readable string format
    llama_response_text = "\n".join(
        [f"{key}: {value}" for key, value in llama_response_dict.items()]
    )
    
    # Prompt LLaMA with job description and resume
    prompt_text = (
        f"Given the following job description breakdown:\n\n{llama_response_text}\n\n"
        f"And the following resume:\n\n{resume_text}\n\n"
        "Suggest improvements to make the resume align more closely with the job requirements. "
        "Identify any missing skills, experiences, or keywords and suggest improvements in structure or wording."
    )
    
    # Generate suggestions using the LLaMA model
    suggestions = await run_llama_prompt(prompt_text, model_name)
    
    return suggestions
