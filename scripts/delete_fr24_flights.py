#!/usr/bin/env python3
"""Delete all flights from a myFlightradar24 account."""

import os
import re
import sys
import time

import requests

EMAIL = os.environ.get("FR24_EMAIL")
PASSWORD = os.environ.get("FR24_PASSWORD")
FR24_USERNAME = os.environ.get("FR24_USERNAME")  # your my.flightradar24.com profile name

if not EMAIL or not PASSWORD or not FR24_USERNAME:
    print("Usage: FR24_EMAIL=... FR24_PASSWORD=... FR24_USERNAME=... python3 delete_fr24_flights.py")
    sys.exit(1)

s = requests.Session()
s.headers.update({"User-Agent": "Mozilla/5.0"})

print("Logging in...")
resp = s.post("https://www.flightradar24.com/user/login",
              data={"email": EMAIL, "password": PASSWORD})
if not resp.json().get("success"):
    print("Login failed")
    sys.exit(1)

time.sleep(1)
s.get("https://my.flightradar24.com/sign-in")
time.sleep(1)
print("Logged in.")

deleted = 0
while True:
    resp = s.get(f"https://my.flightradar24.com/{FR24_USERNAME}/flights")
    hashes = list(set(re.findall(r"delete-flight/([a-f0-9]{48})", resp.text)))
    if not hashes:
        break
    for h in hashes:
        s.get(f"https://my.flightradar24.com/delete-flight/{h}")
        deleted += 1
        print(f"\rDeleted {deleted}...", end="", flush=True)
        time.sleep(0.3)
    print()

print(f"Done. Deleted {deleted} flights total.")
