#from get_job_details import main_get_job_link, call_reader_api
from prompt_llm_for_resume import RESUME_PROMPT, run_llama_prompt, parse_response_to_dict, save_job_dict_response
from get_job_details_crawl4ai import main_get_job_link, extract_job_description, extract_job_details
import json
import pandas as pd
import asyncio


async def main():
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
    # Combine the prompt with the job description text
    full_prompt = RESUME_PROMPT + "\n" + json.dumps(job_data)
    llama_response = await run_llama_prompt(full_prompt)
    print("LLama response is: ", llama_response)
    job_data_dict = parse_response_to_dict(llama_response)
    save_job_dict_response(job_data_dict)
    print("**** fina OUTPUT****")
    
    job_data_df = pd.DataFrame([job_data_dict])

    job_data_df.to_csv('job_data.csv', index=False)
    print("Csv file saved")
    job_data_df


# Ensure the event loop is run properly
if __name__ == "__main__":
    asyncio.run(main())  # Run the async main function