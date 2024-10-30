#from get_job_details import main_get_job_link, call_reader_api
from prompt_llm_for_resume import RESUME_PROMPT, run_llama_prompt, parse_response_to_df, save_job_dict_response
from get_job_details_crawl4ai import main_get_job_link, extract_job_description, extract_job_details
from create_embeddings import load_tokenizer_t5, generate_embedding_t5, embed_text_in_column
from create_gcp_connection import authenticate_google_apis, extract_job_data_from_sheet
from configuration import RESUME_SECTION_IDENTIFICATION_PROMPT
from resume_text import extract_text_from_docx, extract_resume_sections_langchain, clean_llm_response_for_resume
from find_optimal_resume import find_best_resume, process_resumes, suggest_resume_improvements


import json
import pandas as pd
import asyncio
import torch

SPREADSHEET_ID = ''  # Replace with your actual Spreadsheet ID
SHEET_NAME = 'Sheet1'  # Replace with the name of your sheet
    

async def main():

    
    print("Authenticating google sign in")
    drive_service, sheets_service = authenticate_google_apis()

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
        #full_prompt = RESUME_PROMPT + "\n" + json.dumps(job_data)
        full_prompt = json.dumps(job_data)
        llama_response = await run_llama_prompt(full_prompt)
        print("response generated...", llama_response)
        #print("Llama response is: ", llama_response)
        print("parsing llama response..")
        job_data_dict = parse_response_to_df(llama_response)
        save_job_dict_response(job_data_dict, "job")

        # Extract job description string
        job_description_text = job_description[0].get('job description: ', '')
        print("job description text is: ", job_description)
        print("creating embeddings for job description....")
        job_emb_df = embed_text_in_column(job_description_text, "job")
        job_emb_df.to_csv("job_emb_df.csv")
        print("job emb saved..")
        """
        file_path = "/Users/pratikhotchandani/Downloads/Github/Automating-job-applications/Extras/Pratik Hotchandani GenAI.docx"
        print("extracting text...")
        resume_text = extract_text_from_docx(file_path)
        model_name = "qwen2.5:7b"
        print("extracting sections using llm...")
        resume_llm_response = await extract_resume_sections_langchain(RESUME_SECTION_IDENTIFICATION_PROMPT, model_name, resume_text)
        cleaned_resume_llm_response = clean_llm_response_for_resume(resume_llm_response)
        print("creating embeddings....")
        resume_emb_df = embed_text_in_column(cleaned_resume_llm_response, "resume")
        print("embeddings generated...")
        resume_emb_df.to_csv("resume_emb_df.csv")
        """
        print("processing resumes..")
        file_paths = ["/Users/pratikhotchandani/Downloads/Github/Automating-job-applications/Extras/Pratik Hotchandani GenAI.docx",
                      "/Users/pratikhotchandani/Downloads/Github/Automating-job-applications/Pratik Hotchandani AI.docx",
                      "/Users/pratikhotchandani/Downloads/Github/Automating-job-applications/Pratik Hotchandani ML.docx",
                      "/Users/pratikhotchandani/Downloads/Github/Automating-job-applications/Pratik Hotchandani Sr. Data Scientist.docx"]
        # Run the process_resumes function with your list of file paths
        emb_df = await process_resumes(file_paths)


        # Assuming job_emb_df['job_emb'].values[0] is the single embedding vector for the job description
        best_resume_text, updated_emb_df = find_best_resume(emb_df, job_emb_df['job_emb'].values[0])
        # Print the DataFrame with percentage matches
        print(updated_emb_df[['resume_data', 'percentage_match']])

        print("generating suggestions...")
        suggestions = await suggest_resume_improvements(job_data_dict, best_resume_text, "llama3.1:8b")
        save_job_dict_response(suggestions, "suggestions")
        print("suggestions saved: ", suggestions)
        """
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
