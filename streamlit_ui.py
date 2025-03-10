import streamlit as st
import asyncio
from get_job_details_crawl4ai import extract_job_description, extract_job_details
import json
from prompt_llm_for_resume import  run_llama_prompt, summarize_job_description, parse_response_to_df, save_job_dict_response
from supabase_backend import create_supabase_connection, chunk_data, insert_data_into_table, fetch_data_from_table
from create_embeddings import generate_embeddings
from find_optimal_resume import find_rag_data_match_percentage, process_resumes, get_file_paths, find_best_resume, suggest_resume_improvements, prepare_cover_letter, extract_tags_content
from supabase_helper_functions import prepare_data_rag, prepare_data_resume, prepare_data_job_description
import pandas as pd
from configuration import IDENTIFY_JOB_DESCRIPTION_PROMPT, IDENTIFY_JOB_DESCRIPTION_MODEL, RAG_DATA_STRUCTURNG_PROMPT, RAG_DATA_STRUCTURING_MODEL, COVER_LETTER_GENERATION_PROMPT, COVER_LETTER_GENERATION_MODEL, PROVIDING_SUGGESTIONS_MODEL, SUGGESTIONS_JOB_BASED_ON_RESUME, IDENTIFY_DETAILS_FORM_RESUME_MODEL, SUMMARIZE_JOB_DESCRIPTION_MODEL, IDENTIFY_DETAILS_FROM_JOB_PROMPT, SUMMARY_PROMPT, EMBEDDING_MODEL, IDENTIFY_DETAILS_FROM_JOB_MODEL, IDENTIFY_DETAILS_FROM_RESUME_PROMPT
from helper_functions import save_as_pdf, save_as_docx
from prompt_openai import run_openai_chat_completion, initialize_openai_client
import numpy as np
from configuration import COLD_EMAILS_MESSAGES_PROMPT, COLD_EMAILS_MESSAGES_MODEL, RESUME_SUMMARY_PROMPT, RESUME_SUMMARY_MODEL
from emails_connection_messages import generate_connection_messages_email
from llm_api_calls_LiteLLM import run_liteLLM_call
import os
from credentials import OPENAI_API, ANTHROPIC_API
from prompt_anthropic import initialize_anthropic_client, run_anthropic_chat_completion
from configuration import JOB_ANALYSIS_SUGGESTION_PROMPT, JOB_ANALYSIS_SUGGESTION_MODEL, COVER_LETTER_GENERATION_PROMPT_ANTHROPIC

## set ENV variables
os.environ["OPENAI_API_KEY"] = OPENAI_API
os.environ["ANTHROPIC_API_KEY"] = ANTHROPIC_API

def initialize_session_states():
    if "resume" not in st.session_state:
        st.session_state.resume = None
    if "job_link" not in st.session_state:
        st.session_state.job_link = ""
    if "job_entry" not in st.session_state:
        st.session_state.job_entry = ""
    if "job_data" not in st.session_state:
        st.session_state.job_data = ""
    if "cover_letter" not in st.session_state:
        st.session_state.cover_letter = "empty cover letter"    
    if "openai_client" not in st.session_state:
        st.session_state.openai_client = None 
    if "entries" not in st.session_state:
        st.session_state.entries = []
    if "category" not in st.session_state:
        st.session_state["category"] = ""
    if "title" not in st.session_state:
        st.session_state["title"] = ""
    if "text" not in st.session_state:
        st.session_state["text"] = ""
    if "rag_df" not in st.session_state:
        st.session_state["rag_df"] = None
    if "job_emb" not in st.session_state:
        st.session_state["job_emb"] = None
    if "rag_form_visible" not in st.session_state:
        st.session_state["rag_form_visible"] = False
    if "include_rag_data_checkbox" not in st.session_state:
        st.session_state["include_rag_data_checkbox"] = False 
    if "job_link_option" not in st.session_state:
        st.session_state["job_link_option"] = None    
    if "resume_option" not in st.session_state:
        st.session_state["resume_option"] = False
    if "supabase_client" not in st.session_state:
        st.session_state["supabase_client"] = None
    if "job_description" not in st.session_state:
        st.session_state["job_description"] = None
    if "summary_response" not in st.session_state:
        st.session_state["summary_response"] = None
    if "parsed_job_df" not in st.session_state:
        st.session_state["parsed_job_df"] = pd.DataFrame()
    if "best_resume_text" not in st.session_state:
        st.session_state["best_resume_text"] = None
    if "updated_emb_df" not in st.session_state:
        st.session_state["updated_emb_df"] = None    
    if "best_rag_data" not in st.session_state:
        st.session_state["best_rag_data"] = pd.DataFrame()  
    if "rag_data_prompt" not in st.session_state:
        st.session_state["rag_data_prompt"] = None
    if "llama_response" not in st.session_state:
        st.session_state["llama_response"] = None  
    if "suggestions" not in st.session_state:
        st.session_state["suggestions"] = None     

    if "linkedin_recruiter_message" not in st.session_state:
        st.session_state["linkedin_recruiter_message"] = None     

    if "recruiter_email" not in st.session_state:
        st.session_state["recruiter_email"] = None     

    if "linkedin_connection_message" not in st.session_state:
        st.session_state["linkedin_connection_message"] = None     

    # Initialize session state for checkboxes
    if 'generate_cover_letter' not in st.session_state:
        st.session_state.generate_cover_letter = False
    if 'reach_out' not in st.session_state:
        st.session_state.reach_out = False
    if 'anthropic_client' not in st.session_state:
        st.session_state.anthropic_client = None
    if 'master_resume' not in st.session_state:
        st.session_state.master_resume = None
    if 'master_resume_job_description_combined' not in st.session_state:
        st.session_state.master_resume_job_description_combined = None
    if 'resume_summary' not in st.session_state:
        st.session_state.resume_summary = None
    if 'cold_email_messages' not in st.session_state:
        st.session_state.cold_email_messages = None
    if 'hiring_manager_email' not in st.session_state:
        st.session_state.hiring_manager_email = None
    if 'job_analysis_suggestions' not in st.session_state:
        st.session_state.job_analysis_suggestions = None
    if 'improvement_suggestions' not in st.session_state:
        st.session_state.improvement_suggestions = None
    if 'professional_sumary' not in st.session_state:
        st.session_state.professional_sumary = None
    if 'suggestions_skills' not in st.session_state:
        st.session_state.suggestions_skills = None
    if 'suggestions_work_ex' not in st.session_state:
        st.session_state.suggestions_work_ex = None
    if 'suggestions_project' not in st.session_state:
        st.session_state.suggestions_project = None
    if 'missing_keyword_skills' not in st.session_state:
        st.session_state.missing_keyword_skills = None
    if 'suggestion_mentorship' not in st.session_state:
        st.session_state.suggestion_mentorship = None
    if 'refactored_resume' not in st.session_state:
        st.session_state.refactored_resume = None

async def initialize_clients():
    st.session_state["supabase_client"] = await create_supabase_connection()
    st.session_state["openai_client"] = await initialize_openai_client()
    st.session_state["anthropic_client"] = await initialize_anthropic_client(ANTHROPIC_API)

async def get_resumes_ui():
    st.subheader("Select a Resume")

    # Call the fetch_data_from_table function
    # Replace 'supabase_client' and 'resume_data' with your actual Supabase client and table name
    df = await fetch_data_from_table(st.session_state["supabase_client"], 'resume_data')

    if not df.empty:
    
        resume_names = df['resume_name'].tolist()
        
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
                st.session_state.resume = df[df['resume_name'].isin(selected_resumes)]
                st.write("Selected Resume Details:")
                st.dataframe(st.session_state.resume)  # Display the filtered DataFrame
                #st.session_state.resume = selected_details
            else:
                st.write("No resumes selected.")
    else:
        st.write("No resumes available.")

async def upload_resume():
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
            response_insert = await insert_data_into_table(st.session_state["supabase_client"], "resume_data", resume_prepared_data, batch_size=100)
            
            st.success("Resume uploaded successfully!")
            st.write(updated_resume_df)  # Display the DataFrame with embeddings

async def include_rag_data():
# Create a checkbox
    st.session_state["include_rag_data_checkbox"] = st.checkbox("Include RAG data")

    # Use the checkbox value to conditionally include RAG data
    if st.session_state["include_rag_data_checkbox"]:
        st.write("RAG data will be included in the processing.")
        rag_df = await fetch_data_from_table(st.session_state["supabase_client"], 'extra_info')
        st.session_state["rag_df"] = rag_df
        #st.write(rag_df)

    else:
        st.write("RAG data is excluded from the processing.")
        st.session_state["rag_df"] = None

async def add_extra_rag_data():
    # Toggle form visibility on button click
    if st.button("Add Extra Info for RAG System"):
        st.session_state.rag_form_visible = True  # Show the form

    # Show the form if the button is clicked
    if st.session_state.rag_form_visible:
        with st.form("extra_info_form"):
            
            # Input fields for category, title, and text
            category = st.selectbox(
                "Category",
                options=["Work Experience", "Project", "Skills", "Achievements", "Certifications"],
                index=["Work Experience", "Project", "Skills", "Achievements", "Certifications"].index(st.session_state.category) if st.session_state.category else 0
            )
            title = st.text_input("Title", help="A short title or name for the entry", value=st.session_state.title)
            text = st.text_area("Text", help="Detailed description of skills, experience, or project", value=st.session_state.text)

            # Button to add current entry to the current_entries list
            if st.form_submit_button("Add Entry (+)"):
                if category and title and text:
                    # Add the entry to the current session state list for this form
                    st.session_state.entries.append({
                        "category": category,
                        "title": title,
                        "text": text
                    })

                    # TODO: Fix this (the inputs are not getting cleared)
                    # Reset the fields after adding the entry
                    st.session_state["category"] = ""
                    st.session_state["title"] = ""
                    st.session_state["text"] = ""

                    st.success("Entry added. You can add more or submit all entries.")

            # Show current entries for user confirmation
            st.write("Current Entries:")
            for entry in st.session_state.entries:
                st.write(f"- **Category**: {entry['category']}, **Title**: {entry['title']}, **Text**: {entry['text']}")

            # Button to submit all entries at once
            if st.form_submit_button("Submit All"):
                # Clear current form entries (not in the main list)

                st.session_state.rag_form_visible = False 
                json_entries = json.dumps(st.session_state.entries)
                structured_rag_data = await run_llama_prompt(json_entries, RAG_DATA_STRUCTURNG_PROMPT, RAG_DATA_STRUCTURING_MODEL, model_temp= 0)
             
                
                # Convert the string to a list of dictionaries
                data_list = json.loads(structured_rag_data)

                # Convert the list of dictionaries to a DataFrame
                rag_df = pd.DataFrame(data_list)

                updated_rag_df = await generate_embeddings(rag_df, EMBEDDING_MODEL , "rag_text")  
                #st.write(updated_rag_df)
                rag_prepared_data = prepare_data_rag(updated_rag_df)
                response_insert = await insert_data_into_table(st.session_state["supabase_client"], "extra_info", rag_prepared_data, batch_size=100)
                st.success("All entries successfully saved!")

async def job_posting_submission():
    # Select between existing resume or new resume
    st.session_state["job_link_option"] = st.radio("Choose an option:", ["Provide Job URL (works only for Glassdoor urls)", "Enter job description manually"])

    if st.session_state["job_link_option"]  == "Provide Job URL (works only for Glassdoor urls)":

        # Section to input the job URL
        #st.subheader("Enter Job URL")
        job_url = st.text_input("Paste the job URL here")
        st.session_state.job_link = job_url
        job_description_input = ""
    
    elif st.session_state["job_link_option"]  == "Enter job description manually":
        job_description_input = st.text_area("Paste the job description here", height=200)
        st.session_state.job_entry = job_description_input
        st.session_state.job_link = ""

def update_selections():
    """Callback to update individual checkboxes when Select All changes"""
    st.session_state.generate_cover_letter = st.session_state.select_all
    st.session_state.reach_out = st.session_state.select_all

async def generate_suggestions_cover_letter():

    # Creating a dataframe from the llm response
    st.session_state["parsed_job_df"] = parse_response_to_df(st.session_state["llama_response"])
    st.session_state["parsed_job_df"]['job_description'] = json.dumps(st.session_state["job_description"])
    st.session_state["parsed_job_df"]['job_link'] = st.session_state.job_link

    ## Generating embedding for job description:
    st.session_state.job_emb  = await generate_embeddings(st.session_state["parsed_job_df"], EMBEDDING_MODEL, "job")  # Step 2: Generate embeddings
    #st.dataframe(job_emb)
    
    # code to structure data 
    job_prepared_data = prepare_data_job_description(st.session_state.job_emb )
    response_insert = await insert_data_into_table(st.session_state["supabase_client"], "job_info", job_prepared_data, batch_size=100)

    # Assuming job_emb_df['job_emb'].values[0] is the single embedding vector for the job description
    st.session_state["best_resume_text"], st.session_state["updated_emb_df"] = find_best_resume(st.session_state.resume, st.session_state.job_emb)
    # Print the DataFrame with percentage matches
    
    st.write("Resume Percentage Match: ")
    st.write(st.session_state["updated_emb_df"][['resume_name', 'percentage_match']])

    if st.session_state["rag_df"] is not None and not st.session_state["rag_df"].empty:
        st.write("RAG data percentage Match: ")
        st.session_state["best_rag_data"], updated_rag_df_percentage = find_rag_data_match_percentage(st.session_state["rag_df"], st.session_state.job_emb)
        st.session_state["best_rag_data"] = st.session_state["best_rag_data"].sort_values(by='percentage_match', ascending=False)
        st.write(st.session_state["best_rag_data"])
        st.session_state["best_rag_data"] = st.session_state["best_rag_data"][['category', 'title', 'text']]
        # Providing suggestions based on selected resume or the resume with the highest match.
        st.session_state["rag_data_prompt"] = st.session_state["best_rag_data"].to_json(orient="records")
        st.session_state["suggestions"] = await suggest_resume_improvements(st.session_state.anthropic_client, SUGGESTIONS_JOB_BASED_ON_RESUME, st.session_state["llama_response"], st.session_state["best_resume_text"], st.session_state["rag_data_prompt"], PROVIDING_SUGGESTIONS_MODEL, model_temp = 0.2)
    else:
        st.session_state["suggestions"] = await suggest_resume_improvements(st.session_state.anthropic_client, SUGGESTIONS_JOB_BASED_ON_RESUME, st.session_state["llama_response"], st.session_state["best_resume_text"], "", PROVIDING_SUGGESTIONS_MODEL, model_temp = 0.2)


    st.session_state["suggestions"] = extract_tags_content(st.session_state.suggestions,['refactored_experience'])

    with st.expander("Suggestions: "):
        st.write(st.session_state["suggestions"])
    save_job_dict_response(st.session_state["suggestions"], "suggestions")

    ## Providing suggestions based on selected resume or the restume with the highest match.
    st.session_state.cover_letter = await prepare_cover_letter(st.session_state.openai_client, COVER_LETTER_GENERATION_PROMPT_ANTHROPIC, st.session_state["llama_response"], st.session_state["refactored_resume"], COVER_LETTER_GENERATION_MODEL, model_temp = 0.2)

    # Show detailed summary inside an expander:
    with st.expander("Cover letter: "):
        st.write(st.session_state.cover_letter)

    save_job_dict_response(st.session_state.cover_letter, "cover_letter")

    # Add download buttons
    #st.write("Download Cover Letter:")
    #cover_letter_string = json.dumps(cover_letter)
    # Generate files
    #pdf_data = save_as_pdf(st.session_state.cover_letter)
    #docx_data = save_as_docx(st.session_state.cover_letter)

async def generate_reach_out_messages():

    # Show detailed summary inside an expander:
    st.session_state["cold_email_messages"] = await generate_connection_messages_email(COLD_EMAILS_MESSAGES_PROMPT, st.session_state["summary_response"], st.session_state["best_resume_text"], COLD_EMAILS_MESSAGES_MODEL, max_tokens = 2500, model_temp = 0.2)
    
    st.session_state["linkedin_recruiter_message"] = extract_tags_content(st.session_state.cold_email_messages,['linkedin_message_recruiter'])
    with st.expander("Recruiter LinkedIn Message: "):
        st.write(st.session_state.linkedin_recruiter_message)

    st.session_state["recruiter_email"] = extract_tags_content(st.session_state.cold_email_messages,['cold_email_recruiter'])
    with st.expander("Recruiter Cold Email: "):
        st.write(st.session_state.recruiter_email)

    st.session_state["linkedin_connection_message"] = extract_tags_content(st.session_state.cold_email_messages,['linkedin_message_hiring_manager'])
    with st.expander("Hiring Manager Linkedin Message: "):
        st.write(st.session_state.linkedin_connection_message)

    st.session_state["hiring_manager_email"] = extract_tags_content(st.session_state.cold_email_messages,['cold_email_hiring_manager'])
    with st.expander("Hiring Manager Cold Email: "):
        st.write(st.session_state.hiring_manager_email)

async def generate_resume_summary():
    st.session_state.master_resume_job_description_combined = {
                "job_description": st.session_state["llama_response"],
                "resume": st.session_state['master_resume']['resume_text']
            }

            # Convert the combined structure to a JSON string
    st.session_state.master_resume_job_description_combined = json.dumps(st.session_state.master_resume_job_description_combined)
    st.session_state["resume_summary"] = await run_anthropic_chat_completion(st.session_state.anthropic_client, st.session_state.master_resume_job_description_combined, RESUME_SUMMARY_PROMPT, RESUME_SUMMARY_MODEL, max_tokens = 1024, model_temp = 0.2)
    st.session_state["resume_summary"] = extract_tags_content(st.session_state.resume_summary['content'],['resume_summary'])
    with st.expander("Ideal Resume Summary: "):
        st.write(st.session_state["resume_summary"])

async def analyse_job_provide_suggestions():
    
    ## get suggestions from LLM on what to improve in resume
    st.session_state["job_analysis_suggestions"] = await suggest_resume_improvements(st.session_state.anthropic_client, JOB_ANALYSIS_SUGGESTION_PROMPT, st.session_state["llama_response"], st.session_state["resume"]['resume_text'].values[0], JOB_ANALYSIS_SUGGESTION_MODEL, max_tokens = 4040, model_temp = 0.2)

    ## complete refactored resume
    st.session_state["refactored_resume"] = extract_tags_content(st.session_state.job_analysis_suggestions,['refactored_resume'])
    
    ## 1. Missing keyword skills
    #st.session_state["missing_keyword_skills"] = extract_tags_content(st.session_state.job_analysis_suggestions,['missing_keyword_skills'])
    with st.expander("suggestion!!: "):
        st.write(st.session_state["job_analysis_suggestions"])

    ## 1. Missing keyword skills
    st.session_state["missing_keywords_skills"] = extract_tags_content(st.session_state.job_analysis_suggestions,['missing_keywords_skills'])
    with st.expander("missing_keywords_skills: "):
        st.write(st.session_state["missing_keywords_skills"])

    ## 2. Professional Summary
    st.session_state["professional_sumary"] = extract_tags_content(st.session_state.job_analysis_suggestions,['professional_summary'])
    with st.expander("professional_sumary: "):
        st.write(st.session_state["professional_sumary"])
    
     ## 3. skills
    st.session_state["suggestions_skills"] = extract_tags_content(st.session_state.job_analysis_suggestions,['skills'])
    with st.expander("suggestions_skills: "):
        st.write(st.session_state["suggestions_skills"])

    ## 4. work experience
    st.session_state["suggestions_work_ex"] = extract_tags_content(st.session_state.job_analysis_suggestions,['work_experience'])
    with st.expander("suggestions_work_ex: "):
        st.write(st.session_state["suggestions_work_ex"])

    ## 5. projects
    st.session_state["suggestions_project"] = extract_tags_content(st.session_state.job_analysis_suggestions,['projects'])
    with st.expander("suggestions_project: "):
        st.write(st.session_state["suggestions_project"])

    ## 6. Mentorship
    st.session_state["suggestion_mentorship"] = extract_tags_content(st.session_state.job_analysis_suggestions,['mentorship'])
    with st.expander("suggestion_mentorship: "):
        st.write(st.session_state["suggestion_mentorship"])

   

    #save_job_dict_response(st.session_state.cover_letter, "cover_letter")

async def generate_cover_letter():
     ## Providing suggestions based on selected resume or the restume with the highest match.
    st.session_state.cover_letter = await prepare_cover_letter( COVER_LETTER_GENERATION_PROMPT_ANTHROPIC, st.session_state["llama_response"], st.session_state["refactored_resume"], COVER_LETTER_GENERATION_MODEL, max_tokens = 2048 ,model_temp = 0.2)

    # Show detailed summary inside an expander:
    with st.expander("Cover letter: "):
        st.write(st.session_state.cover_letter)

async def insert_job_data_into_supabase_table():
    # Creating a dataframe from the llm response
    st.session_state["parsed_job_df"] = parse_response_to_df(st.session_state["llama_response"])
    st.session_state["parsed_job_df"]['job_description'] = json.dumps(st.session_state["job_description"])
    st.session_state["parsed_job_df"]['job_link'] = st.session_state.job_link

    ## Generating embedding for job description:
    st.session_state.job_emb  = await generate_embeddings(st.session_state["parsed_job_df"], EMBEDDING_MODEL, "job")  # Step 2: Generate embeddings
    #st.dataframe(job_emb)
    
    # code to structure data 
    job_prepared_data = prepare_data_job_description(st.session_state.job_emb )
    response_insert = await insert_data_into_table(st.session_state["supabase_client"], "job_info", job_prepared_data, batch_size=100)

async def main():
    # Initialize session state for resume and job link if they don't exist
    initialize_session_states()

    # Calculate Select All state based on individual checkboxes
    select_all_state = st.session_state.cover_letter and st.session_state.reach_out

    # initialize clients
    await initialize_clients()

    st.session_state.job_emb = pd.DataFrame()

    # Set the title for the app
    st.title("Is This Job for You?")

   # Select between existing resume or new resume
    st.session_state["resume_option"] = st.radio("Choose an option:", ["Select Existing Resume", "Upload New Resume"])

    if st.session_state["resume_option"] == "Select Existing Resume":
        await get_resumes_ui()

    elif st.session_state["resume_option"] == "Upload New Resume":
        await upload_resume()

    await include_rag_data()
    
    #await add_extra_rag_data()

    await job_posting_submission()

    # Individual checkboxes
    st.checkbox('Cover Letter and Suggestions', key='generate_cover_letter')
    st.checkbox('Reach out Messages', key='reach_out')
    # Select All checkbox
    st.checkbox(
        'Generate All',
        key='select_all',
        value=select_all_state,
        on_change=update_selections
    )

    # Submit button
    
    if st.button("Analyze"):
        if st.session_state.get("job_link", "").strip() or st.session_state.get("job_entry", "").strip():
            #st.session_state.openai_client = await initialize_openai_client()

            if st.session_state.get("job_link", "").strip():


                st.write("Extracting job details from the posting..")

                st.session_state["job_description"] = await extract_job_description(st.session_state.job_link)
                job_details = await extract_job_details(st.session_state.job_link)

                # Create a dictionary combining both variables
                job_data = {
                    "job_description": st.session_state["job_description"],
                    "job_details": job_details
                }

                job_data_prompt = json.dumps(job_data)
                st.session_state.job_data = job_data_prompt

            else:
                st.session_state.job_data = json.dumps(st.session_state.job_entry)
                #job_description = await run_llama_prompt(st.session_state.job_data, IDENTIFY_JOB_DESCRIPTION_PROMPT, IDENTIFY_JOB_DESCRIPTION_MODEL)
                st.session_state["job_description"] = await run_openai_chat_completion(st.session_state.openai_client, st.session_state.job_data, IDENTIFY_JOB_DESCRIPTION_PROMPT, IDENTIFY_JOB_DESCRIPTION_MODEL)


            with st.expander("View Job Description"):
                st.write(st.session_state["job_description"])

            # Prompting llm using groq api for llama to identify details from a job description
            #job_data_prompt = json.dumps(job_data)
            st.session_state["llama_response"] = await run_openai_chat_completion(st.session_state.openai_client, st.session_state.job_data, IDENTIFY_DETAILS_FROM_JOB_PROMPT, IDENTIFY_DETAILS_FROM_JOB_MODEL)
            #llama_response = await run_llama_prompt(st.session_state.job_data, IDENTIFY_DETAILS_FROM_JOB_PROMPT, IDENTIFY_DETAILS_FROM_JOB_MODEL)
            #llama_response_str = json.dumps(st.session_state["llama_response"])
            

            ## Prompting llm using groq api for job description summarization
            #summary_response = await summarize_job_description(SUMMARY_PROMPT, llama_response, SUMMARIZE_JOB_DESCRIPTION_MODEL)
            st.session_state["summary_response"] = await run_openai_chat_completion(st.session_state.openai_client, st.session_state["llama_response"], SUMMARY_PROMPT, SUMMARIZE_JOB_DESCRIPTION_MODEL)

            with st.expander("View Summary"):
                st.write(st.session_state["summary_response"])

            await insert_job_data_into_supabase_table()
        
            #await generate_resume_summary()

            if select_all_state:

                #await generate_suggestions_cover_letter()
                await analyse_job_provide_suggestions()
                await generate_cover_letter()
                await generate_reach_out_messages()
            
            elif st.session_state["reach_out"]:

                await generate_reach_out_messages()
            
            else: 
                await analyse_job_provide_suggestions()

        else:
            st.error("Please upload at least one resume and provide a job URL before submitting.")

# Ensure the event loop is run properly
if __name__ == "__main__":
    asyncio.run(main())  # Run the async main function
