import json
import random
import asyncio
from crawl4ai import AsyncWebCrawler
from crawl4ai.extraction_strategy import JsonCssExtractionStrategy

# Load proxies from the file
def load_proxies():
    with open("valid_proxies.txt", "r") as f:
        proxies = f.read().splitlines()  # Read all lines and split by newline
    return proxies

# Select a random proxy from the list of valid proxies
def get_random_proxy(proxies):
    if proxies:
        return random.choice(proxies)
    return None

def main_get_job_link():
    job_link = input("Please share the job link that you want the details from\n")
    print(f"Okay, so accessing the link {job_link}")
    return job_link

# Function to extract job description
async def extract_job_description(url, proxies):
    print("\n--- Using JsonCssExtractionStrategy for Fast Structured Output ---")

    # Define the extraction schema as a list of dictionaries
    schema = {
        "name": "job description",
        "baseSelector": "div.JobDetails_jobDescriptionWrapper___tqxc",
        "fields": [
            {
                "name": "job description: ",
                "selector": "div",
                "type": "text",
            },
        ]
    }

    # Get a random proxy to use
    proxy = get_random_proxy(proxies)
    if proxy:
        proxy = "http://" + proxy  # Format the proxy
        print(f"Using proxy: {proxy}")

    # Create the extraction strategy
    extraction_strategy = JsonCssExtractionStrategy(schema, verbose=True)

    # Use the AsyncWebCrawler with the extraction strategy and formatted proxy
    async with AsyncWebCrawler(verbose=True, proxy="http://66.29.154.105:3128") as crawler:
        result = await crawler.arun(
            url=url,
            extraction_strategy=extraction_strategy,
            bypass_cache=True
        )

        if not result.success:
            print("Failed to crawl the page")
            return

        # Parse the extracted content
        try:
            job_descriptions = json.loads(result.extracted_content)
            if job_descriptions:
                print("Extracted job description content")
            else:
                print("No job description data extracted.")
        except json.JSONDecodeError:
            print("Failed to parse extracted content as JSON.")

    return job_descriptions

# Function to extract job details
async def extract_job_details(url, proxies):
    print("\n--- Using JsonCssExtractionStrategy for Fast Structured Output ---")

    # Define the extraction schema
    schema = {
        "name": "header",
        "baseSelector": ".JobDetails_jobDetailsHeader__Hd9M3",
        "fields": [
            {
                "name": "company name",
                "selector": "h4",
                "type": "text",
            },
            {
                "name": "Job role",
                "selector": "h1",
                "type": "text",
            },
            {
                "name": "company rating",
                "selector": "span",
                "type": "text",
            },
            {
                "name": "Job Location",
                "selector": "div.JobDetails_location__mSg5h",
                "type": "text",
            }
        ],
    }

    # Get a random proxy to use
    proxy = get_random_proxy(proxies)
    if proxy:
        proxy = "http://" + proxy  # Format the proxy
        print(f"Using proxy: {proxy}")

    # Create the extraction strategy
    extraction_strategy = JsonCssExtractionStrategy(schema, verbose=True)

    # Use the AsyncWebCrawler with the extraction strategy and formatted proxy
    async with AsyncWebCrawler(verbose=True, proxy="http://66.29.154.105:3128") as crawler:
        result = await crawler.arun(
            url=url,
            extraction_strategy=extraction_strategy,
            bypass_cache=True
        )

        if not result.success:
            print("Failed to crawl the page")
            return

        # Parse the extracted content
        try:
            job_details = json.loads(result.extracted_content)
            if job_details:
                print("Extracted job details content")
            else:
                print("No job details data extracted.")
        except json.JSONDecodeError:
            print("Failed to parse extracted content as JSON.")

    return job_details
