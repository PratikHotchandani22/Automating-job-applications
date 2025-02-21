import anthropic
import json

async def initialize_anthropic_client(anthropic_api_key):
    client = anthropic.Anthropic(
        # defaults to os.environ.get("ANTHROPIC_API_KEY")
        api_key=anthropic_api_key,
    )
    return client


async def run_anthropic_chat_completion(client, llama_response, system_prompt, model, temperature=0.2):
    """
    Function to run a custom prompt on Anthropic's Chat Completion API.
    Args:
    - llama_response: The input text you want to send to the model
    - system_prompt (str): The system-level instruction to guide the model's behavior
    - model (str): The model version to use
    - temperature (float): The sampling temperature (default is 0.2)
    Returns:
    - dict: The response content and usage statistics
    """
    print("Inside anthropic chat completion call!!!")
    user_prompt = json.dumps(llama_response)
    
    try:
        # Validate inputs
        if not isinstance(user_prompt, str) or not user_prompt.strip():
            raise ValueError("user_prompt must be a non-empty string.")
        if not isinstance(system_prompt, str) or not system_prompt.strip():
            raise ValueError("system_prompt must be a non-empty string.")

        print("Generating Anthropic chat response...")
        response = client.messages.create(
            max_tokens=1024,
            model=model,
            system=[
                {
                    "type": "text",
                    "text": system_prompt,
                    "cache_control": {"type": "ephemeral"}
                }
            ],
            messages=[{"role": "user", "content": user_prompt}],
            temperature=temperature
        )
        print("Response generated from anthropic model..")
        
        # Extract text content from the response
        content_text = response.content[0].text if isinstance(response.content, list) else response.content.text
        
        # Create a response dictionary with both content and usage stats
        response_dict = {
            "content": content_text,
            "usage": response.usage.model_dump_json() if response.usage else None,
            "stop_reason": response.stop_reason,
            "message_id": response.id
        }
        
        print(f"Usage statistics: {response_dict['usage']}")
        return response_dict

    except ValueError as ve:
        return {"error": f"Input Error: {str(ve)}"}
    except Exception as e:
        return {"error": f"Unexpected Error: {str(e)}"}