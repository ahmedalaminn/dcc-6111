#!/bin/bash

trap 'kill $(jobs -p)' EXIT

echo "Starting ZeroMQ Broker..."
python3 broker.py &
sleep 1

echo "Starting Flask Server..."
python3 server.py --endpoint tcp://localhost:5555 &

echo "Starting React Frontend..."
npm run dev &
sleep 2

echo "Starting Publisher Nodes..."
python3 publisher.py node-alpha &
python3 publisher.py node-beta &
python3 publisher.py node-gamma &

echo "System active. Press Ctrl+C to terminate all processes."
wait