#!/bin/bash
scp -r cyclecast/dist dan@192.168.1.101:/var/www/cyclecast/
scp backend/main.py dan@192.168.1.101:/home/dan/Code/cyclecast/backend/main.py
scp backend/pyproject.toml dan@192.168.1.101:/home/dan/Code/cyclecast/backend/pyproject.toml
scp backend/run.sh dan@192.168.1.101:/home/dan/Code/cyclecast/backend/run.sh
scp backend/.env dan@192.168.1.101:/home/dan/Code/cyclecast/backend/.env