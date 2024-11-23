import streamlit as st
from openai import OpenAI
from credentials import OPENAI_API
import asyncio


async def generate_ui():

    # Initialize session state for messages and job description
    if "messages" not in st.session_state:
        st.session_state.messages = [
            {"role": "system", "content": "You are a helpful assistant specialized in answering questions based on a specific job description. Only provide information directly related to the given job description. If a question is not relevant to the job description, politely inform the user that you can only answer questions about the provided job description."}
        ]
    if "job_data" not in st.session_state:
        st.session_state.job_data = ""  # Initialize job data as empty

    st.title("Job Description QA Chatbot")
    st.caption("Provide a job description, and I'll answer questions related to it.")

    # Job description input
    job_desc_input = st.text_area(
        "Paste the job description here:",
        value=st.session_state.job_data,
        height=300,
    )

    if job_desc_input.strip():  # Update the session state with the job description
        st.session_state.job_data = job_desc_input
        st.session_state.messages = [
            {"role": "system", "content": "You are a helpful assistant specialized in answering questions based on a specific job description. Only provide information directly related to the given job description. If a question is not relevant to the job description, politely inform the user that you can only answer questions about the provided job description."},
            {"role": "user", "content": f"Here's the job description:\n\n{job_desc_input}\n\nPlease answer questions based only on this job description."},
            {"role": "assistant", "content": "Understood. I will answer questions based solely on the provided job description. How may I assist you?"}
        ]

    # Chat history container
    chat_container = st.container()
    input_container = st.container()

    # Function to generate response from OpenAI with streaming
    async def generate_response(prompt):
        full_prompt = f"Based on the job description provided earlier, please answer the following question: {prompt}"
        st.session_state.messages.append({"role": "user", "content": full_prompt})

        # Display the user's message
        with chat_container:
            st.markdown(
                f'<div style="text-align: right; color: white; background-color: #1e90ff; '
                f'padding: 8px; border-radius: 10px; margin: 5px;">'
                f'👤 <b>You:</b> {prompt}</div>',
                unsafe_allow_html=True,
            )

        # Initialize a placeholder for the assistant's response
        assistant_placeholder = chat_container.empty()

        # Stream response from OpenAI
        response_text = ""
        stream = st.session_state.openai_client.chat.completions.create(
            model="gpt-4o-mini",  # Replace with your desired model
            messages=st.session_state.messages,
            stream=True,
            temperature=0.3,  # Lower temperature for more focused responses
            max_tokens=150,  # Limit response length
        )

        for chunk in stream:
            if chunk.choices[0].delta.content is not None:
                token = chunk.choices[0].delta.content
                response_text += token
                assistant_placeholder.markdown(
                    f'<div style="text-align: left; color: black; background-color: #f0f0f0; '
                    f'padding: 8px; border-radius: 10px; margin: 5px;">'
                    f'🤖 <b>Chatbot:</b> {response_text}</div>',
                    unsafe_allow_html=True,
                )

        # Append the complete assistant response to the session state
        st.session_state.messages.append({"role": "assistant", "content": response_text})

    # Display chat history
    with chat_container:
        for message in st.session_state.messages[3:]:  # Skip the system message
            if message["role"] == "user":
                display_message = message["content"].split("Based on the job description provided earlier, please answer the following question: ")[-1]
                st.markdown(
                    f'<div style="text-align: right; color: white; background-color: #1e90ff; '
                    f'padding: 8px; border-radius: 10px; margin: 5px;">'
                    f'👤: {display_message}</div>',
                    unsafe_allow_html=True,
                )
            elif message["role"] == "assistant":
                st.markdown(
                    f'<div style="text-align: left; color: black; background-color: #f0f0f0; '
                    f'padding: 8px; border-radius: 10px; margin: 5px;">'
                    f'🤖: {message["content"]}</div>',
                    unsafe_allow_html=True,
                )

    # Input box at the bottom
    with input_container:
        user_input = st.text_input("Your question:", key="user_input")

        # Generate and display response when input is provided
        if user_input.strip():
            if st.session_state.job_data.strip():
                await generate_response(user_input)
                st.session_state.user_input = ""  # Clear input box after processing
            else:
                st.warning("Please provide a job description before asking questions.")
