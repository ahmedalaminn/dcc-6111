Open five separate WSL terminal windows.

Terminal 1
Start broker.
```bash
cd /mnt/c/Users/31547/dcc-6111/project2/frontend/python
python3 broker.py
```

Terminal 2
Start Flask server.
```bash
cd /mnt/c/Users/31547/dcc-6111/project2/frontend/python
python3 server.py --endpoint tcp://127.0.0.1:5555
```

Terminal 3
Start first publisher node.
```bash
cd /mnt/c/Users/31547/dcc-6111/project2/frontend/python
python3 publisher.py node-alpha
```

Terminal 4
Start second publisher node.
```bash
cd /mnt/c/Users/31547/dcc-6111/project2/frontend/python
python3 publisher.py node-beta
```

Terminal 5
Start React frontend.
```bash
cd /mnt/c/Users/31547/dcc-6111/project2/frontend
npm run dev
```

Open your web browser. Go to http://localhost:5173 to view your dashboard.