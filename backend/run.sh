#!/bin/bash

PORT=8002
RUN_LOCAL=false

# Parse args
for arg in "$@"; do
    case $arg in
        --local|-l)
            RUN_LOCAL=true
            shift
            ;;
    esac
done

# Check if port is in use
PID=$(lsof -ti tcp:$PORT)

if [ -n "$PID" ]; then
    echo "Port $PORT is in use by PID(s): $PID"
    echo "Killing process(es)..."
    kill -9 $PID
    sleep 1
else
    echo "Port $PORT is free"
fi

# Run app
if [ "$RUN_LOCAL" = true ]; then
    echo "Running in LOCAL mode (foreground)..."
    uv run python main.py
else
    echo "Running in background (nohup)..."
    nohup uv run python main.py > app.log 2>&1 &
fi