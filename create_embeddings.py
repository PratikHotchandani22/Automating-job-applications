# pip install accelerate
from transformers import T5Tokenizer, T5ForConditionalGeneration

def load_tokenizer_t5():
    print("Downloading model and tokenizer....")
    tokenizer = T5Tokenizer.from_pretrained("google/flan-t5-large")
    model = T5ForConditionalGeneration.from_pretrained("google/flan-t5-large", device_map="auto")
    print("Download completed....")
    return tokenizer, model

def split_text_into_chunks(text, tokenizer, max_length):
    # Tokenize the text and split into chunks of max_length tokens
    tokens = tokenizer(text, return_tensors="pt", padding=True).input_ids[0]
    chunks = [tokens[i:i + max_length] for i in range(0, len(tokens), max_length)]
    return chunks

def generate_embedding_t5(text, tokenizer, model, max_length=512):
    print("Generating embeddings...")

    # Split the text into chunks if it exceeds the max_length
    chunks = split_text_into_chunks(text, tokenizer, max_length)
    
    all_outputs = []
    
    for chunk in chunks:
        # Move each chunk to the mps device and process it
        chunk = chunk.unsqueeze(0).to("mps")
        outputs = model.generate(chunk, max_new_tokens=50)  # Generate for each chunk
        all_outputs.append(outputs)
    
    print("Embeddings generated..")
    return all_outputs  # Return the combined outputs