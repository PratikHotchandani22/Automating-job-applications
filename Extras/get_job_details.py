import requests

READER_API_KEY = ""  # Ensure this is correct

def main_get_job_link():
    job_link = input("Please share the job link that you want the details from\n")
    print(f"Okay, so accessing the link {job_link}")
    return job_link

def construct_reader_response_header():
    return {
        "Authorization": "Bearer " + READER_API_KEY,
        "X-No-Cache": "false",
        "X-Return-Format": "markdown",
        "X-Timeout": "100",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3",
        "Accept-Language": "en-US,en;q=0.9",
        "Connection": "keep-alive",
    }

def call_reader_api(job_link):
    reader_link = "https://r.jina.ai/" + job_link
    print(f"Final reader URL is: {reader_link}")

    with requests.Session() as session:  # Use a session to handle cookies
        response = session.get(reader_link, headers=construct_reader_response_header())

        if response.status_code != 200:
            print(f"Failed to get job details. Status code: {response.status_code}")
            print("Response:", response.json())  # Print the response for debugging
            return

        print("The response that we are getting is: ", response.text)
