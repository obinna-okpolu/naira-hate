from flask import Flask, request, jsonify
from flask_cors import CORS
import requests 
import sqlite3
from datetime import datetime

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

# --- PASTE NGROK URL HERE ---
# Example: "https://a1b2-34-56.ngrok-free.app"
COLAB_URL = "https://uncrested-joltingly-ayesha.ngrok-free.dev/" 

# --- HELPER: PREDICTION ---
def get_prediction(text):
    # 1. Try Colab
    if COLAB_URL:
        try:
            # FIX: I added "/predict" to the end of the URL here
            response = requests.post(f"{COLAB_URL}/predict", json={"text": text}, timeout=100)
            if response.status_code == 200:
                return response.json().get('label', 'NEUTRAL')
        except Exception as e:
            print(f"Colab connection failed: {e}")

    # # 2. Fallback (Mock)
    # print("Using Mock Logic (Colab down)")
    # text_lower = text.lower()
    # if "hate" in text_lower: return "HATE"
    # elif "stupid" in text_lower: return "ABUSE"
    # return "NEUTRAL"

@app.route('/predict', methods=['POST'])
def predict():
    data = request.json
    text = data.get('text', '')
    
    label = get_prediction(text)
    print(f"[PREDICT] {text[:15]}... -> {label}")
    return jsonify({'label': label})

@app.route('/feedback', methods=['POST'])
def feedback():
    # Keeping this simple for now - just ack success
    return jsonify({'status': 'success'})

if __name__ == '__main__':
    print(f"Gateway connected to: {COLAB_URL}")
    app.run(debug=True, port=5000)