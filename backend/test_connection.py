import requests

COLAB_URL = "https://uncrested-joltingly-ayesha.ngrok-free.dev/" 

print(f"Testing connection to: {COLAB_URL}/predict")

try:
    response = requests.post(f"{COLAB_URL}/predict", json={"text": "oponu!"}, timeout=5)
    
    print(f"\nHTTP Status Code: {response.status_code}")
    
    try:
        data = response.json()
        print("\nSUCCESS! Received JSON response:")
        print(data)
    except requests.exceptions.JSONDecodeError:
        print("\nFAILED! Could not parse JSON.")
        print("Raw response received (First 500 chars):")
        print("-" * 50)
        print(response.text[:500])
        print("-" * 50)
        
        if "ngrok" in response.text.lower() and "visit-site" in response.text.lower():
            print("\n>>> DIAGNOSIS: CONFIRMED. Ngrok is blocking the request with a warning page.")
        else:
            print("\n>>> DIAGNOSIS: The server returned non-JSON data (likely an error page).")

except Exception as e:
    print(f"\nCRITICAL FAILURE: {e}")