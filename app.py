import requests
from flask import Flask, request, jsonify, render_template

app = Flask(__name__)

MYMEMORY_URL = "https://api.mymemory.translated.net/get"
MAX_BYTES = 500  # MyMemory limit per request


@app.route("/")
def home():
    return render_template("index.html")


@app.route("/translate", methods=["POST"])
def translate():
    data = request.get_json(silent=True) or {}
    text = (data.get("text") or "").strip()
    target = (data.get("target") or "").strip().lower()   # "HI" -> "hi"
    source = (data.get("source") or "en").strip().lower() # default: English

    if not text or not target:
        return jsonify({"error": "Both 'text' and 'target' are required."}), 400

    if source == target:
        return jsonify({"error": "Source and target languages are the same."}), 400

    if len(text.encode("utf-8")) > MAX_BYTES:
        return jsonify({"error": "Text is too long. Please keep it short (max 500 bytes)."}), 400

    try:
        response = requests.get(
            MYMEMORY_URL,
            params={"q": text, "langpair": f"{source}|{target}"},
            timeout=10,
        )
    except requests.exceptions.Timeout:
        return jsonify({"error": "Translation service timed out. Please try again."}), 504
    except requests.exceptions.RequestException:
        return jsonify({"error": "Could not reach the translation service."}), 502

    try:
        result = response.json()
        status = int(result.get("responseStatus", 500))
    except (ValueError, TypeError):
        return jsonify({"error": "Unexpected response from translation service."}), 502

    if status == 200:
        translated = result.get("responseData", {}).get("translatedText", "")
        if not translated:
            return jsonify({"error": "No translation returned."}), 502
        return jsonify({"translatedText": translated}), 200
    if status == 429:
        return jsonify({"error": "Daily free limit reached. Please try again tomorrow."}), 429
    if status in (400, 403):
        return jsonify({"error": "Invalid language code or request."}), 400

    return jsonify({"error": "Translation service error."}), 502


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
