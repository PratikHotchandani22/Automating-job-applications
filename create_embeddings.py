# pip install accelerate
from transformers import T5Tokenizer, T5ForConditionalGeneration

from langchain_ollama import OllamaEmbeddings
import pandas as pd

import os
import pandas as pd
import asyncio
from openai import OpenAI
from credentials import OPENAI_API


async def generate_embeddings(dataframe, embedding_of):
    # Ensure that OpenAI API client is set up
    openai_client = OpenAI(api_key=OPENAI_API)

    if embedding_of == "resume":
        embeddings = []
        for index, row in dataframe.iterrows():
            final_str_cleaned = row['resume_text']
            
            # Generate embeddings using OpenAI API
            response = openai_client.embeddings.create(
                input=final_str_cleaned,
                model="text-embedding-3-small"
            )
            
            embeddings.append(response.data[0].embedding)  # Assuming this is the correct structure
        
        # Add embeddings to the DataFrame
        dataframe['resume_embedding'] = embeddings
        return dataframe
    
    elif embedding_of == "job":
        embeddings = []
        for index, row in dataframe.iterrows():
            job_description = row['job_description']
            
            # Generate embeddings using OpenAI API
            response = openai_client.embeddings.create(
                input=job_description,
                model="text-embedding-3-small"
            )
            
            embeddings.append(response.data[0].embedding)  # Append the embedding for each job
        
        # Add embeddings to the DataFrame
        dataframe['job_description_embeddings'] = embeddings
        return dataframe
    
    else:
        return "Incorrect embedding of parameter passed."

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

def embed_text_in_column(text_data, text_type) -> pd.DataFrame:

    embeddings = OllamaEmbeddings(
    model="llama3.1:8b"
    )

    if text_type == "resume":
    
        emb = embeddings.embed_documents(text_data)

        print("Embedding generated: ", emb)

        return pd.DataFrame({
            'resume_data': text_data,
            'resume_emb': emb
        })

    elif text_type == "job":

        emb = embeddings.embed_documents(text_data)

        print("Embedding generated: ", emb)

        return pd.DataFrame({
            'job_data': text_data,
            'job_emb': emb
        })
    
    else:
        return pd.DataFrame({
            'job_data': "empty string",
            'job_emb': "Empty embeddings"
        })