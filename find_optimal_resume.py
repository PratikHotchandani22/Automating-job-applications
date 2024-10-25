import numpy as np


import pandas as pd
import os
from resume_text import extract_text_from_docx, extract_resume_sections_langchain, clean_llm_response_for_resume
from configuration import RESUME_SECTION_IDENTIFICATION_PROMPT
from create_embeddings import embed_text_in_column
from sklearn.metrics.pairwise import cosine_similarity
from prompt_llm_for_resume import run_llama_prompt

# Assuming you have defined these functions elsewhere in your code
# - extract_text_from_docx
# - extract_resume_sections_langchain
# - clean_llm_response_for_resume
# - embed_text_in_column

async def process_resumes(file_paths):
    all_emb_dfs = []  # List to collect DataFrames

    for file_path in file_paths:
        if not os.path.exists(file_path):
            print(f"File not found: {file_path}")
            continue
        
        print(f"Processing file: {file_path}")
        
        # Extracting text from the resume
        print("Extracting text...")
        resume_text = extract_text_from_docx(file_path)
        
        model_name = "qwen2.5:7b"
        
        # Extracting sections using LLM
        print("Extracting sections using LLM...")
        resume_llm_response = await extract_resume_sections_langchain(RESUME_SECTION_IDENTIFICATION_PROMPT, model_name, resume_text)
        
        # Cleaning the LLM response
        cleaned_resume_llm_response = clean_llm_response_for_resume(resume_llm_response)
        
        # Creating embeddings
        print("Creating embeddings...")
        resume_emb_df = embed_text_in_column(cleaned_resume_llm_response, "resume")
        
        # Append the current DataFrame to the list
        all_emb_dfs.append(resume_emb_df)
        
        print("Embeddings generated for:", file_path)

    # Concatenate all DataFrames into a final DataFrame
    final_emb_df = pd.concat(all_emb_dfs, ignore_index=True)
    
    # Save the final DataFrame to a CSV file
    final_emb_df.to_csv("resume_emb_df.csv", index=False)
    print("All embeddings saved to resume_emb_df.csv")

    return final_emb_df


def find_best_resume(emb_df, job_desc_embedding):
    # Ensure embeddings are numpy arrays
    resume_embeddings = np.vstack(emb_df['resume_emb'].to_numpy())
    job_desc_embedding = np.array(job_desc_embedding).reshape(1, -1)
    
    # Calculate cosine similarity and get percentage match
    similarities = cosine_similarity(resume_embeddings, job_desc_embedding)
    emb_df['percentage_match'] = similarities.flatten() * 100  # Convert to percentage

    # Get resume_data with the highest match
    best_resume_row = emb_df.loc[emb_df['percentage_match'].idxmax()]
    best_resume_data = best_resume_row['resume_data']  # Extract the resume text
    return best_resume_data, emb_df  # Return best match resume text and full DataFrame with percentage matches


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


# Example usage
# llama_response_text = "..."  # text output from LLaMA identifying job description sections
# resume_text = best_resume_data
# suggestions = await suggest_resume_improvements(llama_response_text, resume_text)
# print("Improvement Suggestions: ", suggestions)
