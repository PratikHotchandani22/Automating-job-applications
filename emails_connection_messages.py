from prompt_openai import run_openai_chat_completion
import json
from llm_api_calls_LiteLLM import run_liteLLM_call


async def generate_connection_messages_email(openai_client, system_prompt, structured_job_data, resume_text, model_name, model_temp):
    
    ## Construct a user_prompt that will have structure job description 
    # Convert all columns in the job description DataFrame to a single text string
    #job_description_text = " ".join(structured_job_data.fillna("").astype(str).values.flatten())

    # Prepare the user_prompt with resume_text and job_description_text
    user_prompt = f'''
    "resume_text" : "{resume_text}",
    "job_description_text" : "{structured_job_data}"
    '''
    
    # Generate suggestions using the LLaMA model
    suggestions = await run_openai_chat_completion(openai_client, user_prompt, system_prompt, model_name, model_temp)
    #suggestions = await run_liteLLM_call(json.dumps(user_prompt), system_prompt, model_name)

    return suggestions

