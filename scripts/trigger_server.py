#!/usr/bin/env python3
"""
Simple HTTP server that triggers the ingestion pipeline on demand.
Runs on port 8080 inside the worker container.
"""

import http.server
import subprocess
import threading
import json
from pathlib import Path

PORT = 8080
SCRIPT_DIR = Path(__file__).resolve().parent
PIPELINE_SCRIPT = SCRIPT_DIR / "run_report_pipeline.py"

# Track if ingestion is currently running
is_running = False
last_result = {"status": "idle", "message": "No ingestion has been run yet"}


class TriggerHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        global is_running, last_result

        if self.path == "/health":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"status": "ok"}).encode())
            return

        if self.path == "/status":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            response = {
                "is_running": is_running,
                "last_result": last_result
            }
            self.wfile.write(json.dumps(response).encode())
            return

        self.send_response(404)
        self.end_headers()

    def do_POST(self):
        global is_running, last_result

        if self.path == "/trigger":
            # Handle CORS preflight
            self.send_header("Access-Control-Allow-Origin", "*")

            if is_running:
                self.send_response(409)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({
                    "success": False,
                    "error": "Ingestion is already running"
                }).encode())
                return

            # Start ingestion in background thread
            is_running = True
            last_result = {"status": "running", "message": "Ingestion started"}

            def run_ingestion():
                global is_running, last_result
                try:
                    reports = [
                        "Referral Source - Appointments",
                        "Patient Recalls",
                        "All Active Patients"
                    ]
                    results = []
                    for report in reports:
                        result = subprocess.run(
                            ["python3", str(PIPELINE_SCRIPT), "--report-name", report, "--window", "short"],
                            capture_output=True,
                            text=True,
                            timeout=600
                        )
                        results.append({
                            "report": report,
                            "success": result.returncode == 0,
                            "stdout": result.stdout[-1000:] if result.stdout else "",
                            "stderr": result.stderr[-500:] if result.stderr else ""
                        })

                    all_success = all(r["success"] for r in results)
                    last_result = {
                        "status": "completed" if all_success else "partial",
                        "message": f"Completed {sum(1 for r in results if r['success'])}/{len(results)} reports",
                        "details": results
                    }
                except Exception as e:
                    last_result = {
                        "status": "error",
                        "message": str(e)
                    }
                finally:
                    is_running = False

            thread = threading.Thread(target=run_ingestion)
            thread.start()

            self.send_response(202)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({
                "success": True,
                "message": "Ingestion started in background"
            }).encode())
            return

        self.send_response(404)
        self.end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def log_message(self, format, *args):
        print(f"[TriggerServer] {args[0]}")


if __name__ == "__main__":
    server = http.server.HTTPServer(("0.0.0.0", PORT), TriggerHandler)
    print(f"Trigger server running on port {PORT}")
    server.serve_forever()
