#from get_job_details import main_get_job_link, call_reader_api
from prompt_llm_for_resume import RESUME_PROMPT, run_llama_prompt, parse_response_to_dict, save_job_dict_response
from get_job_details_crawl4ai import main_get_job_link, extract_job_description, extract_job_details
from create_embeddings import load_tokenizer_t5, generate_embedding_t5
from create_gcp_connection import authenticate_google_apis, extract_job_data_from_sheet
from supabase_backend import create_supabase_connection, insert_data_into_table, fetch_data_from_table, prepare_data_insertion_structure
from configuration import SUPABASE_URL, SUPABASE_KEY, SPREADSHEET_ID, SHEET_NAME, JOB_DETAILS_TABLE_NAME

import json
import pandas as pd
import asyncio
import torch

async def main():

    print("Authenticating google sign in")

    # connections
    drive_service, sheets_service = authenticate_google_apis()
    supabase = create_supabase_connection(SUPABASE_URL, SUPABASE_KEY)

    # getting data
    sheets_data = extract_job_data_from_sheet(sheets_service, SPREADSHEET_ID, SHEET_NAME)

    # Print the extracted job data
    for job in sheets_data:
        print(f"ID: {job['ID']}, Job Link: {job['Job Link']}")
        job_description = await extract_job_description(job['Job Link'])
        job_details = await extract_job_details(job['Job Link'])


        # Create a dictionary combining both variables
        job_data = {
            "job_description": job_description,
            "job_details": job_details
        }

        # Convert to JSON object (string)
        json_data = json.dumps(job_data, indent=2)

        ## Prompting LLM
        # Combine the prompt with the job description text
        full_prompt = RESUME_PROMPT + "\n" + json.dumps(job_data)
        llama_response = await run_llama_prompt(full_prompt)
        #print("Llama response is: ", llama_response)
        job_data_dict = parse_response_to_dict(llama_response)
        save_job_dict_response(job_data_dict)

        # Extract job description string
        job_description_text = job_description[0].get('job description: ', '')

        ## Create embedding of unstructured job description
        tokenizer, model = load_tokenizer_t5()
        emb = generate_embedding_t5(job_description_text,tokenizer, model)
        if len(emb) > 1:
            concatenated_emb = emb[0]  # Start with the first tensor
            for i in range(1, len(emb)):  # Iterate over the rest of the tensors
                concatenated_emb = torch.cat((concatenated_emb, emb[i]), dim=1)  # Concatenate along the appropriate dimension

            print(f"Concatenated Embedding: {concatenated_emb}")
        else:
            concatenated_emb = emb[0]  # If there's only one tensor, use it as is
            print(f"Single Embedding: {concatenated_emb}")    
        
        print("Enddd of job : ", job['ID'], "......")
        
        print("Preparing json data that needs to be inserted into the table...")
        table_json_data = prepare_data_insertion_structure(JOB_DETAILS_TABLE_NAME, job_description_text, job_details, concatenated_emb)
        print("prepared json data is: ", table_json_data)

        insert_data_into_table(supabase, JOB_DETAILS_TABLE_NAME, table_json_data)


    """
    ## Getting started
    print("Welcome to the python program that automates applyinh to jobs!!")
    print("Called 01 file")
    job_link = main_get_job_link()
    job_description = await extract_job_description(job_link)
    job_details = await extract_job_details(job_link)
    # Create a dictionary combining both variables
    job_data = {
        "job_description": job_description,
        "job_details": job_details
    }
    # Convert to JSON object (string)
    json_data = json.dumps(job_data, indent=2)

    ## Prompting LLM
    # Combine the prompt with the job description text
    full_prompt = RESUME_PROMPT + "\n" + json.dumps(job_data)
    llama_response = await run_llama_prompt(full_prompt)
    job_data_dict = parse_response_to_dict(llama_response)
    save_job_dict_response(job_data_dict)
    
    # Extract job description string
    job_description_text = job_description[0].get('job description: ', '')

    ## Create embedding of unstructured job description
    tokenizer, model = load_tokenizer_t5()
    emb = generate_embedding_t5(job_description_text,tokenizer, model)
    if len(emb) > 1:
        concatenated_emb = emb[0]  # Start with the first tensor
        for i in range(1, len(emb)):  # Iterate over the rest of the tensors
            concatenated_emb = torch.cat((concatenated_emb, emb[i]), dim=1)  # Concatenate along the appropriate dimension

        print(f"Concatenated Embedding: {concatenated_emb}")
    else:
        concatenated_emb = emb[0]  # If there's only one tensor, use it as is
        print(f"Single Embedding: {concatenated_emb}")        
    
    ## Create embedding of resumes
    
    ## Saving data to csv and json
    #job_data_df = pd.DataFrame([job_data_dict])

    #job_data_df.to_csv('job_data.csv', index=False)
    #print("Csv file saved")
    #job_data_df
    """



# Ensure the event loop is run properly
if __name__ == "__main__":
    asyncio.run(main())  # Run the async main function