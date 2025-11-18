from flask import Flask, request, jsonify, render_template_string
from flask_cors import CORS
import sqlite3
import requests 
from datetime import datetime

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

# --- CONFIGURATION ---
# Ngrok url
COLAB_URL = "https://uncrested-joltingly-ayesha.ngrok-free.dev/" 

# --- DATABASE SETUP ---
def init_db():
    with sqlite3.connect("database.db") as conn:
        # Create table if not exists
        conn.execute("""
            CREATE TABLE IF NOT EXISTS feedback (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT,
                text TEXT,
                user_label TEXT,
                model_prediction TEXT,
                reviewer_verdict TEXT DEFAULT 'PENDING'
            )
        """)

init_db()

# --- HELPER: PREDICTION ---
def get_prediction(text):
    # 1. Try to hit the Colab Model
    if COLAB_URL:
        try:
            print(f"Forwarding to Colab: {COLAB_URL}")
            response = requests.post(f"{COLAB_URL}/predict", json={"text": text}, timeout=3)
            if response.status_code == 200:
                return response.json().get('label', 'NEUTRAL')
        except Exception as e:
            print(f"Colab Error: {e}")

    # 2. Fallback to Mock logic if Colab is down/undefined
    print("Using Local Mock Logic")
    text_lower = text.lower()
    if "hate" in text_lower: return "HATE"
    elif "stupid" in text_lower or "idiot" in text_lower: return "ABUSE"
    return "NEUTRAL"


# --- ROUTES ---

@app.route('/predict', methods=['POST'])
def predict():
    data = request.json
    text = data.get('text', '')
    if not text: return jsonify({'error': 'No text'}), 400
    
    label = get_prediction(text)
    print(f"[PREDICT] {text[:20]}... -> {label}")
    return jsonify({'label': label})

@app.route('/feedback', methods=['POST'])
def feedback():
    data = request.json
    text = data.get('text', '')
    user_label = data.get('label', '') # What the user said it is
    
    # Optional: Run mock prediction again to store what the model *thought* it was
    model_pred = get_prediction(text)

    with sqlite3.connect("database.db") as conn:
        conn.execute(
            "INSERT INTO feedback (timestamp, text, user_label, model_prediction) VALUES (?, ?, ?, ?)",
            (datetime.now(), text, user_label, model_pred)
        )
    
    print(f"[FEEDBACK SAVED] {user_label}")
    return jsonify({'status': 'success'})

# --- THE REVIEW DASHBOARD ---
@app.route('/dashboard')
def dashboard():
    # Fetch all feedback
    with sqlite3.connect("database.db") as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute("SELECT * FROM feedback ORDER BY id DESC").fetchall()
    
    # Simple HTML Template
    html = """
    <html>
    <head>
        <title>Review Dashboard</title>
        <style>
            body { font-family: sans-serif; padding: 20px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f2f2f2; }
            .HATE { color: red; font-weight: bold; }
            .ABUSE { color: orange; font-weight: bold; }
            .NEUTRAL { color: green; }
            .FALSE_POSITIVE { background-color: #ffcccc; } /* Red tint */
            .FALSE_NEGATIVE { background-color: #ffffcc; } /* Yellow tint */
        </style>
    </head>
    <body>
        <h1>Feedback Queue</h1>
        <table>
            <tr>
                <th>ID</th>
                <th>Timestamp</th>
                <th>Text</th>
                <th>Model Said</th>
                <th>User Said</th>
                <th>Status</th>
            </tr>
            {% for row in rows %}
            <tr class="{{ row.user_label }}">
                <td>{{ row.id }}</td>
                <td>{{ row.timestamp }}</td>
                <td>{{ row.text }}</td>
                <td class="{{ row.model_prediction }}">{{ row.model_prediction }}</td>
                <td>{{ row.user_label }}</td>
                <td>{{ row.reviewer_verdict }}</td>
            </tr>
            {% endfor %}
        </table>
    </body>
    </html>
    """
    return render_template_string(html, rows=rows)

if __name__ == '__main__':
    print("Gateway running on http://localhost:5000")
    app.run(debug=True, port=5000)