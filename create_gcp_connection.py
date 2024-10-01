import os
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build

# Define the SCOPES needed for your application
SCOPES = ['https://www.googleapis.com/auth/drive', 
          'https://www.googleapis.com/auth/spreadsheets']

# Path to your OAuth 2.0 client secrets JSON file
CLIENT_SECRET_FILE = '/Users/pratikhotchandani/Downloads/Github/Automating-job-applications/client_secret.json'
TOKEN_PATH = '/Users/pratikhotchandani/Downloads/Github/Automating-job-applications/token.json'  # Where to store tokens

# Get credentials and create services
def authenticate_google_apis():
    creds = None
    # Check if token.json exists
    if os.path.exists(TOKEN_PATH):
        creds = Credentials.from_authorized_user_file(TOKEN_PATH, SCOPES)
    
    # If there are no valid credentials available, request login via OAuth 2.0
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
            print("Token refreshed.")
        else:
            flow = InstalledAppFlow.from_client_secrets_file(CLIENT_SECRET_FILE, SCOPES)
            creds = flow.run_local_server(port=0)
            # Save the credentials for future use
            with open(TOKEN_PATH, 'w') as token:
                token.write(creds.to_json())
            print("New token saved.")

    # Build the Google Drive and Sheets service objects
    drive_service = build('drive', 'v3', credentials=creds)
    sheets_service = build('sheets', 'v4', credentials=creds)

    print("Drive service created.")
    print("Sheets service created.")

    return drive_service, sheets_service

def extract_job_data_from_sheet(sheets_service, spreadsheet_id, sheet_name):
    """
    Fetches the data from the Google Sheet and extracts the columns for ID and Job Link.
    
    Parameters:
    - sheets_service: Google Sheets API service object.
    - spreadsheet_id: The ID of the Google Spreadsheet.
    - sheet_name: The name of the specific sheet to read from.

    Returns:
    - A list of dictionaries, each containing 'ID' and 'Job Link'.
    """
    # Define the range to fetch all data from the sheet
    range_name = f'{sheet_name}!A:Z'  # Adjust the range as needed (assuming columns are within A-Z)
    
    # Fetch data from Google Sheets
    result = sheets_service.spreadsheets().values().get(spreadsheetId=spreadsheet_id, range=range_name).execute()
    rows = result.get('values', [])

    # Check if the sheet contains data
    if not rows:
        print('No data found in the sheet.')
        return []

    # Assuming the first row contains headers, find the indexes for 'ID' and 'Job Link'
    headers = rows[0]
    try:
        id_index = headers.index('ID')  # Adjust if column header is different
        job_link_index = headers.index('Job Link')  # Adjust if column header is different
    except ValueError:
        print('Required columns (ID, Job Link) not found in the sheet.')
        return []

    # Extract data for 'ID' and 'Job Link' columns
    job_data = []
    for row in rows[1:]:  # Skip the header row
        if len(row) > max(id_index, job_link_index):  # Ensure the row has enough columns
            job_data.append({
                'ID': row[id_index],
                'Job Link': row[job_link_index]
            })

    return job_data

# Assuming you have authenticated and have the `sheets_service`
spreadsheet_id = '1se48TIjgf49cu4NjieXUW6VNrOB0SdcFb9UNbvDbdOw'  # Replace with your actual Spreadsheet ID
sheet_name = 'Sheet1'  # Replace with the name of your sheet
#job_data_list = extract_job_data_from_sheet(sheets_service, spreadsheet_id, sheet_name)

