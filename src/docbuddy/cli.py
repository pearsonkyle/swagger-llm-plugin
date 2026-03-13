#!/usr/bin/env python3
"""CLI entry point for launching DocBuddy standalone webpage."""

import argparse
import functools
import http.server
import sys
import threading
import time
import webbrowser
from importlib.resources import files


def main():
    """Launch DocBuddy standalone webpage on port 8008."""
    parser = argparse.ArgumentParser(
        prog="docbuddy",
        description="Launch the DocBuddy standalone AI-enhanced API documentation page.",
        epilog="Example: docbuddy --host 127.0.0.1 --port 9000",
    )
    parser.add_argument(
        "--host",
        type=str,
        default="localhost",
        help="Host to bind the server to (default: localhost)",
    )
    parser.add_argument(
        "--port",
        "-p",
        type=int,
        default=8008,
        help="Port to run the server on (default: 8008)",
    )

    args = parser.parse_args()

    # Locate packaged assets via importlib.resources (works for both editable
    # and normal pip installs; no os.chdir() needed).
    pkg_ref = files("docbuddy")
    standalone_ref = pkg_ref.joinpath("standalone.html")

    if not standalone_ref.is_file():
        print(
            f"Error: Could not find 'standalone.html' in the docbuddy package ({pkg_ref})",
            file=sys.stderr,
        )
        sys.exit(1)

    # Serve only the package directory – not the whole repo/site-packages root.
    pkg_dir = str(pkg_ref)
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=pkg_dir)

    url = f"http://{args.host}:{args.port}/standalone.html"

    print(f"Serving DocBuddy at {url}")
    print("Press Ctrl+C to stop the server")

    with http.server.HTTPServer((args.host, args.port), handler) as httpd:

        def open_browser():
            time.sleep(0.5)
            webbrowser.open(url)

        thread = threading.Thread(target=open_browser, daemon=True)
        thread.start()

        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer stopped.")
            sys.exit(0)
