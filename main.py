#from get_job_details import main_get_job_link, call_reader_api
from get_job_details_crawl4ai import main_get_job_link, extract_job_description, extract_job_details

import asyncio


async def main():
    print("Welcome to the python program that automates applyinh to jobs!!")
    print("Called 01 file")
    job_link = main_get_job_link()
    await extract_job_description(job_link)
    await extract_job_details(job_link)



# Ensure the event loop is run properly
if __name__ == "__main__":
    asyncio.run(main())  # Run the async main function