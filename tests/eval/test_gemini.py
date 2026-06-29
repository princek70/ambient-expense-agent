import os
from google import genai

client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))
print("Listing models:")
try:
    for m in client.models.list():
        print(f"Model name: {m.name}")
except Exception as e:
    print(f"Error listing: {e}")
