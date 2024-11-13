import pandas as pd
import streamlit as st

def prepare_data_resume(df: pd.DataFrame):
    # Initialize a list to hold all the prepared data for each row
    all_data = []

    # Iterate over each row in the DataFrame and corresponding embeddings
    for idx, row_data in df.iterrows():  # Unpack the index and row data
        # Prepare the JSON structure for each row, including the embeddings
        data = {
            "resume_name": row_data.get("resume_name", None),   # Extract submission_id
            "resume_text": row_data.get("resume_text", None),  # Handle embedding for summary
            "resume_embedding": row_data.get("resume_embedding", None)   # Extract the summary from the DataFrame
        }

        # Append the prepared data for this row to the list
        all_data.append(data)

    # Return the list of dictionaries (ready for insertion into the database)
    return all_data

def prepare_data_job_description(df: pd.DataFrame):
    # Initialize a list to hold all the prepared data for each row
    all_data = []

    # Iterate over each row in the DataFrame
    for idx, row_data in df.iterrows():
        # Prepare the JSON structure for each row, matching the database columns
        data = {
            "job_link" : row_data.get("job_link",None),
            "company_name": row_data.get("company_name", None),
            "position_name": row_data.get("position_name", None),
            "seniority_level": row_data.get("seniority_level", None),
            "joining_date": row_data.get("joining_date", None),
            "team_name": row_data.get("team_name", None),
            "location": row_data.get("location", None),
            "salary": row_data.get("salary", None),
            "hybrid_or_remote": row_data.get("hybrid_or_remote", None),
            "company_description": row_data.get("company_description", None),
            "team_description": row_data.get("team_description", None),
            "job_responsibilities": row_data.get("job_responsibilities", []),
            "preferred_skills": row_data.get("preferred_skills", []),
            "required_skills": row_data.get("required_skills", []),
            "exceptional_skills": row_data.get("exceptional_skills", []),
            "technical_keywords": row_data.get("technical_keywords", []),
            "necessary_experience": row_data.get("necessary_experience", None),
            "bonus_experience": row_data.get("bonus_experience", None),
            "job_role_classifications": row_data.get("job_role_classifications", []),
            "company_values": row_data.get("company_values", []),
            "benefits": row_data.get("benefits", []),
            "soft_skills": row_data.get("soft_skills", []),
            "job_description_embeddings": row_data.get("job_description_embeddings", None),
            "job_description": row_data.get("job_description", None),
            "sponsorship": row_data.get("sponsorship", None)
        }

        # Append the prepared data for this row to the list
        all_data.append(data)

    # Return the list of dictionaries (ready for insertion into the database)
    return all_data

def prepare_data_rag(df: pd.DataFrame):
    # Initialize a list to hold all the prepared data for each row
    all_data = []

    # Iterate over each row in the DataFrame and corresponding embeddings
    for idx, row_data in df.iterrows():  # Unpack the index and row data
        # Prepare the JSON structure for each row, including the embeddings
        data = {
            "category": row_data.get("category", None),   # Extract submission_id
            "title": row_data.get("title", None),  # Handle embedding for summary
            "text": row_data.get("text", None),   # Extract the summary from the DataFrame
            "text_embedding": row_data.get("text_embedding", None)   # Extract the summary from the DataFrame
        }

        # Append the prepared data for this row to the list
        all_data.append(data)

    # Return the list of dictionaries (ready for insertion into the database)
    return all_data