import requests

url = "http://127.0.0.1:8000/api/auth/signup"
payload = {
    "name": "Test User",
    "email": "testbylocal@example.com",
    "phone": "+1234567890",
    "password": "Password123!",
    "confirm_password": "Password123!",
}

try:
    response = requests.post(url, json=payload)
    print("Status:", response.status_code)
    try:
        print("Response:", response.json())
    except Exception as e:
        print("Text:", response.text)
except Exception as e:
    print("Request failed:", e)
