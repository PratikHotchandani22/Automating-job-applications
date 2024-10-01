from supabase import create_client, Client
from datetime import date


# Initialize the client
def create_supabase_connection(URL, KEY):
    supabase: Client = create_client(URL, KEY)
    print("Supabase connection created: ", supabase)
    return supabase


def prepare_data_insertion_structure(table_name, job_description, job_details, embedding):
    # Prepare the JSON structure
    data = {
        "company_name": job_details.get("company_name", None),
        "position_name": job_details.get("position_name", None),
        "seniority_level": job_details.get("seniority_level", None),
        "joining_date": job_details.get("joining_date").isoformat() if isinstance(job_details.get("joining_date"), date) else None,  # Convert date to ISO format
        "team_name": job_details.get("team_name", None),
        "location": job_details.get("location", None),
        "salary": job_details.get("salary", None),
        "hybrid_or_remote": job_details.get("hybrid_or_remote", None),
        "company_description": job_details.get("company_description", None),
        "team_description": job_details.get("team_description", None),
        "job_responsibilities": job_details.get("job_responsibilities", []),  # Expecting a list
        "preferred_skills": job_details.get("preferred_skills", []),  # Expecting a list
        "required_skills": job_details.get("required_skills", []),  # Expecting a list
        "exceptional_skills": job_details.get("exceptional_skills", []),  # Expecting a list
        "technical_keywords": job_details.get("technical_keywords", []),  # Expecting a list
        "necessary_experience": job_details.get("necessary_experience", None),
        "bonus_experience": job_details.get("bonus_experience", None),
        "job_role_classifications": job_details.get("job_role_classifications", []),  # Expecting a list
        "company_values": job_details.get("company_values", []),  # Expecting a list
        "benefits": job_details.get("benefits", []),  # Expecting a list
        "soft_skills": job_details.get("soft_skills", []),  # Expecting a list
        "job_description_embeddings": embedding,  # Embeddings, assuming they are already prepared
        "job_description": job_description  # Raw job description text
    }
    
    return data


# Insert data into the table
def insert_data_into_table(supabase, table_name, job_data_json):
    response = supabase.table('table_name').insert(job_data_json).execute()
    print("Data insertion response: ")
    print(f"Table name: {table_name}")
    print(f"Response is: {response}")
    return response

# Fetch information from the database  
def fetch_data_from_table(supabase, table_name):
    print(f"Fetching data from table: {table_name}")
    response = supabase.table('job_info').select('*').execute()
    print(f"Response is: {response}")
    return response




