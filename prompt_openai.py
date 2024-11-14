import os
from openai import OpenAI
from credentials import OPENAI_API


# Initialize the OpenAI client
async def initialize_openai_client():
    client = OpenAI(api_key=OPENAI_API)
    return client

async def run_openai_chat_completion(client, user_prompt, system_prompt, model, temperature=0.2):
    """
    Function to run a custom prompt on OpenAI's Chat Completion API.

    Args:
    - user_prompt (str): The input text you want to send to the model.
    - system_prompt (str): The system-level instruction to guide the model's behavior.
    - model (str): The model version to use (default is "gpt-4o").
    - temperature (float): The sampling temperature to use (default is 0.2). 
        Higher values produce more random outputs, while lower values make the output more deterministic.

    Returns:
    - str: The response from the model or an error message.
    """
    try:
        # Validate inputs
        if not isinstance(user_prompt, str) or not user_prompt.strip():
            raise ValueError("user_prompt must be a non-empty string.")
        
        if not isinstance(system_prompt, str) or not system_prompt.strip():
            raise ValueError("system_prompt must be a non-empty string.")
        
        print("Generating OpenAI chat response...")

        # Call the OpenAI Chat Completion API
        completion = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {
                    "role": "user",
                    "content": user_prompt
                }
            ],
            temperature=temperature
        )

        try:
    # Access the main content directly
            if completion and hasattr(completion, "choices") and len(completion.choices) > 0:
                response_content = completion.choices[0].message.content
                print("LLM Response Content:", response_content)
            else:
                raise KeyError("No valid choices received in the API response.")
        except AttributeError as e:
            print(f"Unexpected Error: {e}")
            print("Check the structure of the 'completion' object:", dir(completion))


        return completion.choices[0].message.content

    except ValueError as ve:
        return f"Input Error: {str(ve)}"
    except KeyError as ke:
        return f"Response Parsing Error: {str(ke)}"
    except Exception as e:
        return f"Unexpected Error: {str(e)}"
