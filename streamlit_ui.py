import streamlit as st
import asyncio
from get_job_details_crawl4ai import extract_job_description, extract_job_details
import json
from prompt_llm_for_resume import  run_llama_prompt, summarize_job_description, parse_response_to_df, save_job_dict_response
from supabase_backend import create_supabase_connection, chunk_data, insert_data_into_table, fetch_data_from_table
from create_embeddings import generate_embeddings
from find_optimal_resume import find_rag_data_match_percentage, process_resumes, get_file_paths, find_best_resume, suggest_resume_improvements, prepare_cover_letter
from supabase_helper_functions import prepare_data_rag, prepare_data_resume, prepare_data_job_description
import pandas as pd
from configuration import IDENTIFY_JOB_DESCRIPTION_PROMPT, IDENTIFY_JOB_DESCRIPTION_MODEL, RAG_DATA_STRUCTURNG_PROMPT, RAG_DATA_STRUCTURING_MODEL, COVER_LETTER_GENERATION_PROMPT, COVER_LETTER_GENERATION_MODEL, PROVIDING_SUGGESTIONS_MODEL, SUGGESTIONS_JOB_BASED_ON_RESUME, IDENTIFY_DETAILS_FORM_RESUME_MODEL, SUMMARIZE_JOB_DESCRIPTION_MODEL, IDENTIFY_DETAILS_FROM_JOB_PROMPT, SUMMARY_PROMPT, EMBEDDING_MODEL, IDENTIFY_DETAILS_FROM_JOB_MODEL, IDENTIFY_DETAILS_FROM_RESUME_PROMPT
from helper_functions import save_as_pdf, save_as_docx
from streamlit_quill import st_quill


async def main():
    # Initialize session state for resume and job link if they don't exist
    if "resume" not in st.session_state:
        st.session_state.resume = None
    if "job_link" not in st.session_state:
        st.session_state.job_link = ""
    if "job_entry" not in st.session_state:
        st.session_state.job_entry = ""
    if "job_data" not in st.session_state:
        st.session_state.job_data = ""
    if "cover_letter" not in st.session_state:
        st.session_state.cover_letter = " empty cover letter"    

    # Initialize the session state for form fields if not already initialized
    if "category" not in st.session_state:
        st.session_state["category"] = ""
    if "title" not in st.session_state:
        st.session_state["title"] = ""
    if "text" not in st.session_state:
        st.session_state["text"] = ""
    
    if "rag_df" not in st.session_state:
        st.session_state["rag_df"] = None

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

    # Initialize session state for entries
    if "entries" not in st.session_state:
        st.session_state.entries = []

    # Create a checkbox
    include_rag_data = st.checkbox("Include RAG data")

    # Use the checkbox value to conditionally include RAG data
    if include_rag_data:
        st.write("RAG data will be included in the processing.")
        rag_df = await fetch_data_from_table(supabase_client, 'extra_info')
        st.session_state["rag_df"] = rag_df
        #st.write(rag_df)

    else:
        st.write("RAG data is excluded from the processing.")
        st.session_state["rag_df"] = None


    # Toggle form visibility on button click
    if st.button("Add Extra Info for RAG System"):
        st.session_state.form_visible = True  # Show the form

    # Show the form if the button is clicked
    if "form_visible" in st.session_state and st.session_state.form_visible:
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
                #st.session_state.entries.clear()  # Clear current entries
                st.session_state.form_visible = False  # Hide form after submission
                #st.write("Prompting llm to structure data properly...")
                json_entries = json.dumps(st.session_state.entries)
                structured_rag_data = await run_llama_prompt(json_entries, RAG_DATA_STRUCTURNG_PROMPT, RAG_DATA_STRUCTURING_MODEL, model_temp= 0)
                #st.write(structured_rag_data)
                
                # Convert the string to a list of dictionaries
                data_list = json.loads(structured_rag_data)

                # Convert the list of dictionaries to a DataFrame
                rag_df = pd.DataFrame(data_list)
                #st.write(rag_df)


                # generating embedding of the "text" key in the rag df 
                #st.write("generating embedding of extra text.")
                updated_rag_df = await generate_embeddings(rag_df, EMBEDDING_MODEL , "rag_text")  # Step 2: Generate embeddings
                #st.write(updated_rag_df)
                rag_prepared_data = prepare_data_rag(updated_rag_df)
                response_insert = await insert_data_into_table(supabase_client, "extra_info", rag_prepared_data, batch_size=100)
                st.success("All entries successfully saved!")

                #st.write("inserted data into supabase table: ", response_insert)

                # inserting rag data into subpabase table

                    
                # Create DataFrame
                #df = pd.DataFrame(structured_rag_data)
                #st.write(df)
                #st.write("All entries: ", st.session_state.entries)

    # Select between existing resume or new resume
    option = st.radio("Choose an option:", ["Provide Job URL (works only for Glassdoor urls)", "Enter job description manually"])

    if option == "Provide Job URL":

        # Section to input the job URL
        #st.subheader("Enter Job URL")
        job_url = st.text_input("Paste the job URL here")
        st.session_state.job_link = job_url
        job_description_input = ""
    
    elif option == "Enter job description manually":
        job_description_input = st.text_area("Paste the job description here", height=200)
        st.session_state.job_entry = job_description_input
        st.session_state.job_link = ""

    # Submit button
    
    if st.button("Submit"):
        if st.session_state.get("job_link", "").strip() or st.session_state.get("job_entry", "").strip():

            if st.session_state.get("job_link", "").strip():
                st.write("Extracting job details from the posting..")

                job_description = await extract_job_description(st.session_state.job_link)
                job_details = await extract_job_details(st.session_state.job_link)

                # Create a dictionary combining both variables
                job_data = {
                    "job_description": job_description,
                    "job_details": job_details
                }

                job_data_prompt = json.dumps(job_data)
                st.session_state.job_data = job_data_prompt

            else:
                st.session_state.job_data = json.dumps(st.session_state.job_entry)
                job_description = await run_llama_prompt(st.session_state.job_data, IDENTIFY_JOB_DESCRIPTION_PROMPT, IDENTIFY_JOB_DESCRIPTION_MODEL)

            # Prompting llm using groq api for llama to identify details from a job description
            #job_data_prompt = json.dumps(job_data)
            llama_response = await run_llama_prompt(st.session_state.job_data, IDENTIFY_DETAILS_FROM_JOB_PROMPT, IDENTIFY_DETAILS_FROM_JOB_MODEL)

            ## Prompting llm using groq api for job description summarization
            summary_response = await summarize_job_description(SUMMARY_PROMPT, llama_response, SUMMARIZE_JOB_DESCRIPTION_MODEL)
            with st.expander("View Summary"):
                st.write(summary_response)
            
            # Creating a dataframe from the llm response
            job_df = parse_response_to_df(llama_response)
            job_df['job_description'] = json.dumps(job_description)
            job_df['job_link'] = st.session_state.job_link
            

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

            st.write("RAG data percentage Match: ")
            best_rag_data, updated_rag_df_percentage = find_rag_data_match_percentage(st.session_state["rag_df"], st.session_state.job_emb)

            st.write("best match with rag data: ")
            best_rag_data = best_rag_data.sort_values(by='percentage_match', ascending=False)
            st.write(best_rag_data)
            best_rag_data = best_rag_data[['category','title','text']]
            #st.write(updated_rag_df_percentage)

            ## Providing suggestions based on selected resume or the restume with the highest match.
            rag_data_prompt = best_rag_data.to_json(orient="records")
            suggestions = await suggest_resume_improvements(SUGGESTIONS_JOB_BASED_ON_RESUME, llama_response, best_resume_text, rag_data_prompt, PROVIDING_SUGGESTIONS_MODEL)
            
            with st.expander("Suggestions: "):
                st.write(suggestions)
            save_job_dict_response(suggestions, "suggestions")

            ## Providing suggestions based on selected resume or the restume with the highest match.
            st.session_state.cover_letter = await prepare_cover_letter(COVER_LETTER_GENERATION_PROMPT, llama_response, best_resume_text, COVER_LETTER_GENERATION_MODEL)
            
            # Show detailed summary inside an expander:
            with st.expander("Cover letter: "):
               st.write(st.session_state.cover_letter)

            save_job_dict_response(st.session_state.cover_letter, "cover_letter")

            # Add download buttons
            st.write("Download Cover Letter:")
            #cover_letter_string = json.dumps(cover_letter)
            # Generate files
            pdf_data = save_as_pdf(st.session_state.cover_letter)
            docx_data = save_as_docx(st.session_state.cover_letter)

            # Add download buttons with unique keys
            st.download_button(
                label="Download as PDF",
                data=pdf_data,
                file_name="cover_letter.pdf",
                mime="application/pdf",
                key="download_pdf"
            )

            st.download_button(
                label="Download as Word Document",
                data=docx_data,
                file_name="cover_letter.docx",
                mime="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                key="download_docx"
            )
            
        else:
            st.error("Please upload at least one resume and provide a job URL before submitting.")


# Ensure the event loop is run properly
if __name__ == "__main__":
    asyncio.run(main())  # Run the async main function
