import streamlit as st
from openai import OpenAI
from credentials import OPENAI_API
import asyncio

# Initialize the OpenAI client
async def initialize_openai_client():
    client = OpenAI(api_key=OPENAI_API)
    return client

async def main():
    openai_client = await initialize_openai_client()

    # Initialize session state for messages and job description
    if "messages" not in st.session_state:
        st.session_state.messages = [
            {"role": "system", "content": "You are a helpful assistant specialized in answering questions based on a specific job description. Only provide information directly related to the given job description. If a question is not relevant to the job description, politely inform the user that you can only answer questions about the provided job description."}
        ]
    if "job_description" not in st.session_state:
        st.session_state.job_description = ""

    # Streamlit app layout
    st.title("Job Description QA Chatbot")
    st.caption("Provide a job description, and I'll answer questions related to it.")

    # Job description input
    with st.sidebar:
        st.header("Job Description")
        job_desc_input = st.text_area(
            "Paste the job description here:",
            value=st.session_state.job_description,
            height=300,
        )
        if st.button("Update Job Description"):
            st.session_state.job_description = job_desc_input
            st.session_state.messages = [
                {"role": "system", "content": "You are a helpful assistant specialized in answering questions based on a specific job description. Only provide information directly related to the given job description. If a question is not relevant to the job description, politely inform the user that you can only answer questions about the provided job description."},
                {"role": "user", "content": f"Here's the job description:\n\n{job_desc_input}\n\nPlease answer questions based only on this job description."},
                {"role": "assistant", "content": "Understood. I will answer questions based solely on the provided job description. How may I assist you?"}
            ]
            st.success("Job description updated!")

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
        stream = openai_client.chat.completions.create(
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
        with st.form("user_input_form", clear_on_submit=True):
            user_input = st.text_input("Your question:", key="user_input")
            submit_button = st.form_submit_button("Send")

            # Generate and display response
            if submit_button and user_input:
                if st.session_state.job_description.strip():
                    await generate_response(user_input)
                else:
                    st.warning("Please provide a job description before asking questions.")

# Ensure the event loop is run properly
if __name__ == "__main__":
    asyncio.run(main())
