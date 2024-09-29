import json
import asyncio
from crawl4ai import AsyncWebCrawler
from crawl4ai.extraction_strategy import JsonCssExtractionStrategy

def main_get_job_link():
    job_link = input("Please share the job link that you want the details from\n")
    print(f"Okay, so accessing the link {job_link}")
    return job_link

async def extract_job_description(url):
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

    # Create the extraction strategy
    extraction_strategy = JsonCssExtractionStrategy(schema, verbose=True)

    # Use the AsyncWebCrawler with the extraction strategy
    async with AsyncWebCrawler(verbose=True) as crawler:
        result = await crawler.arun(
            url=url,
            extraction_strategy=extraction_strategy,
            bypass_cache=True,
        )

        if not result.success:
            print("Failed to crawl the page")
            return

        # Print raw extracted content for debugging
        print("Extracted Content: ", result.extracted_content)

        # Parse the extracted content
        try:
            job_descriptions = json.loads(result.extracted_content)
            if job_descriptions:
                print(f"Successfully extracted {len(job_descriptions)} job descriptions")
                print(json.dumps(job_descriptions[0], indent=2))
            else:
                print("No data extracted.")
        except json.JSONDecodeError:
            print("Failed to parse extracted content as JSON.")

    return job_descriptions


async def extract_job_details(url):
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
    # Create the extraction strategy
    extraction_strategy = JsonCssExtractionStrategy(schema, verbose=True)

    # Use the AsyncWebCrawler with the extraction strategy
    async with AsyncWebCrawler(verbose=True) as crawler:
        result = await crawler.arun(
            url=url,
            extraction_strategy=extraction_strategy,
            bypass_cache=True,
        )

        if not result.success:
            print("Failed to crawl the page")
            return

        # Print raw extracted content for debugging
        print("Extracted Content: ", result.extracted_content)

        # Parse the extracted content
        try:
            job_descriptions = json.loads(result.extracted_content)
            if job_descriptions:
                print(f"Successfully extracted {len(job_descriptions)} job descriptions")
                print(json.dumps(job_descriptions[0], indent=2))
            else:
                print("No data extracted.")
        except json.JSONDecodeError:
            print("Failed to parse extracted content as JSON.")

    return job_descriptions