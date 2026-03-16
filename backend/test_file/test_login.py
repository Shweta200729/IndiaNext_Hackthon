import requests

url = "http://127.0.0.1:8000/api/auth/login"
payload = {"email": "testbylocal@example.com", "password": "Password123!"}

try:
    response = requests.post(url, json=payload)
    print("Status:", response.status_code)
    try:
        print("Response:", response.json())
    except Exception as e:
        print("Text:", response.text)
except Exception as e:
    print("Request failed:", e)
