import streamlit as st
import asyncio
from get_job_details_crawl4ai import extract_job_description, extract_job_details
import json
from prompt_llm_for_resume import  run_llama_prompt, summarize_job_description, parse_response_to_df, save_job_dict_response
from supabase_backend import create_supabase_connection, chunk_data, insert_data_into_table, fetch_data_from_table
from create_embeddings import generate_embeddings
from find_optimal_resume import process_resumes, get_file_paths, find_best_resume, suggest_resume_improvements, prepare_cover_letter
from supabase_helper_functions import prepare_data_resume, prepare_data_job_description
import pandas as pd
from configuration import COVER_LETTER_GENERATION_PROMPT, COVER_LETTER_GENERATION_MODEL, PROVIDING_SUGGESTIONS_MODEL, SUGGESTIONS_JOB_BASED_ON_RESUME, IDENTIFY_DETAILS_FORM_RESUME_MODEL, SUMMARIZE_JOB_DESCRIPTION_MODEL, IDENTIFY_DETAILS_FROM_JOB_PROMPT, SUMMARY_PROMPT, EMBEDDING_MODEL, IDENTIFY_DETAILS_FROM_JOB_MODEL, IDENTIFY_DETAILS_FROM_RESUME_PROMPT

async def main():
    # Initialize session state for resume and job link if they don't exist
    if "resume" not in st.session_state:
        st.session_state.resume = None
    if "job_link" not in st.session_state:
        st.session_state.job_link = ""

    st.session_state.job_emb = pd.DataFrame()
    # Set the title for the app
    st.title("Is This Job for You?")

    supabase_client = await create_supabase_connection()
    
   # Select between existing resume or new resume
    option = st.radio("Choose an option:", ["Select Existing Resume", "Upload New Resume"])

    if option == "Select Existing Resume":
        st.subheader("Select a Resume")

        # Call the fetch_data_from_table function
        # Replace 'supabase_client' and 'resume_data' with your actual Supabase client and table name
        df = await fetch_data_from_table(supabase_client, 'resume_data')

        if not df.empty:
            resume_names = df['resume_name'].tolist()  # Assuming you have a 'resume_name' column
            
            # Add checkbox for selecting all resumes
            select_all = st.checkbox("Select All Resumes")

            # Use a multiselect widget to allow multiple or single resume selection
            if select_all:
                selected_resumes = resume_names  # Select all resumes if checkbox is checked
                selected_details = df[df['resume_name'].isin(selected_resumes)]
                #st.session_state.selected_resumes = selected_details
                st.session_state.resume = selected_details
            else:
                selected_resumes = st.multiselect("Choose resume(s):", resume_names)
            
            if not select_all and st.button("Select"):
                # Display selected resume details
                if selected_resumes:
                    selected_details = df[df['resume_name'].isin(selected_resumes)]
                    st.write("Selected Resume Details:")
                    st.dataframe(selected_details)  # Display the filtered DataFrame
                    #st.session_state.selected_resumes = selected_details 
                    st.session_state.resume = selected_details
                else:
                    st.write("No resumes selected.")
        else:
            st.write("No resumes available.")

    elif option == "Upload New Resume":
        st.subheader("Upload a New Resume")
        uploaded_files = st.file_uploader("Choose a resume files", type=["docx"], accept_multiple_files=True)
        
        if uploaded_files is not None and len(uploaded_files)>=1:

            st.write("You have selected the following files:")
            for uploaded_file in uploaded_files:
                st.session_state.resume = uploaded_file
                st.write(uploaded_file.name)
            
            # Button to trigger the upload process
            if st.button("Upload"):
                # Prepare data and insert into database
                file_paths = await get_file_paths(uploaded_files)
                resume_df = await process_resumes(file_paths, IDENTIFY_DETAILS_FROM_RESUME_PROMPT, IDENTIFY_DETAILS_FORM_RESUME_MODEL)  # Step 1: Process resumes
                updated_resume_df = await generate_embeddings(resume_df, EMBEDDING_MODEL , "resume")  # Step 2: Generate embeddings
                resume_prepared_data = prepare_data_resume(updated_resume_df)
                response_insert = await insert_data_into_table(supabase_client, "resume_data", resume_prepared_data, batch_size=100)
                
                st.success("Resume uploaded successfully!")
                st.write(updated_resume_df)  # Display the DataFrame with embeddings
                st.write("selected resumes are:")
                st.write(st.session_state.selected_resumes)

        
    # Section to input the job URL
    st.subheader("Enter Job URL")
    job_url = st.text_input("Paste the job URL here")
    st.session_state.job_link = job_url

    # Submit button
    if st.button("Submit"):
        if st.session_state.job_link:
            st.write("Extracting job details from the posting..")

            st.write("job content: ")

            job_description = await extract_job_description(st.session_state.job_link)
            job_details = await extract_job_details(st.session_state.job_link)

            # Create a dictionary combining both variables
            job_data = {
                "job_description": job_description,
                "job_details": job_details
            }

            # Show detailed summary inside an expander:
            with st.expander("Job Description details: "):
                st.write(job_data)

            # Prompting llm using groq api for llama to identify details from a job description
            job_data_prompt = json.dumps(job_data)
            llama_response = await run_llama_prompt(job_data_prompt, IDENTIFY_DETAILS_FROM_JOB_PROMPT, IDENTIFY_DETAILS_FROM_JOB_MODEL)

            # Show detailed summary inside an expander:
            with st.expander("View detailed summary"):
                st.write(llama_response)

            ## Prompting llm using groq api for job description summarization
            summary_response = await summarize_job_description(SUMMARY_PROMPT, llama_response, SUMMARIZE_JOB_DESCRIPTION_MODEL)
            with st.expander("View summary"):
                st.write(summary_response)
            
            
            # Creating a dataframe from the llm response
            job_df = parse_response_to_df(llama_response)
            job_df['job_description'] = json.dumps(job_description)
            

            ## Generating embedding for job description:
            job_emb = await generate_embeddings(job_df, EMBEDDING_MODEL, "job")  # Step 2: Generate embeddings
            #st.dataframe(job_emb)
            st.session_state.job_emb = job_emb
            job_prepared_data = prepare_data_job_description(job_emb)
            response_insert = await insert_data_into_table(supabase_client, "job_info", job_prepared_data, batch_size=100)

            # Assuming job_emb_df['job_emb'].values[0] is the single embedding vector for the job description
            best_resume_text, updated_emb_df = find_best_resume(st.session_state.resume, st.session_state.job_emb)
            # Print the DataFrame with percentage matches
            
            st.write("Resume Percentage Match: ")
            st.write(updated_emb_df[['resume_name', 'percentage_match']])

            ## Providing suggestions based on selected resume or the restume with the highest match.
            suggestions = await suggest_resume_improvements(SUGGESTIONS_JOB_BASED_ON_RESUME, llama_response, best_resume_text, PROVIDING_SUGGESTIONS_MODEL)
            
            with st.expander("Suggestions: "):
                st.write(suggestions)
            save_job_dict_response(suggestions, "suggestions")

            ## Providing suggestions based on selected resume or the restume with the highest match.
            cover_letter = await prepare_cover_letter(COVER_LETTER_GENERATION_PROMPT, llama_response, best_resume_text, COVER_LETTER_GENERATION_MODEL)
            # Show detailed summary inside an expander:
            with st.expander("Cover letter: "):
                st.write(cover_letter)
            save_job_dict_response(cover_letter, "cover_letter")

            

            
        else:
            st.error("Please upload at least one resume and provide a job URL before submitting.")


# Ensure the event loop is run properly
if __name__ == "__main__":
    asyncio.run(main())  # Run the async main function
