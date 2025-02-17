from litellm import acompletion
import json

async def run_liteLLM_call(model_response, system_prompt, llm_model, llm_temperature=0.2):

    user_prompt = json.dumps(model_response)

    try:
        # Validate inputs
        if not isinstance(user_prompt, str) or not user_prompt.strip():
            raise ValueError("user_prompt must be a non-empty string.")
        
        if not isinstance(system_prompt, str) or not system_prompt.strip():
            raise ValueError("system_prompt must be a non-empty string.")
        
        print("Generating LLM chat response from liteLLM...")
        
        messages=[
                {"role": "system", 
                 "content": system_prompt,
                 "cache_control": {"type": "ephemeral"}},
                {
                    "role": "user",
                    "content": user_prompt
                }
            ]
        
        response = await acompletion(model=llm_model,
                                     messages=messages, 
                                     temperature=llm_temperature)

        try:
    # Access the main content directly
            if response and hasattr(response, "choices") and len(response.choices) > 0:
                response_content = response.choices[0].message.content
                print("LLM Response Content:", response_content)
            else:
                raise KeyError("No valid choices received in the API response.")
        except AttributeError as e:
            print(f"Unexpected Error: {e}")
            print("Check the structure of the 'completion' object:", dir(response))


        return response.choices[0].message.content

    except ValueError as ve:
        return f"Input Error: {str(ve)}"
    except KeyError as ke:
        return f"Response Parsing Error: {str(ke)}"
    except Exception as e:
        return f"Unexpected Error: {str(e)}"



