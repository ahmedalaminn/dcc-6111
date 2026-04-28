## BBB demo flow

On the BeagleBone Black:

Terminal 1
```bash
cd /path/to/project2
./run_bbb_broker.sh
```

Terminal 2
```bash
cd /path/to/project2
./run_bbb_server.sh
```

Open the dashboard from a Mac browser:

```text
http://<bbb-ip>:5000
```

On the MacBook, simulate publisher nodes:

Terminal 3
```bash
cd /path/to/project2
python3 python/publisher.py node-alpha --endpoint tcp://<bbb-ip>:5556
```

Terminal 4
```bash
cd /path/to/project2
python3 python/publisher.py node-beta --endpoint tcp://<bbb-ip>:5556
```

Optional burst test:

```bash
python3 python/publisher.py node-gamma --endpoint tcp://<bbb-ip>:5556 --interval 0.5 --count 40
```

## Local Mac-only smoke test

Terminal 1
```bash
cd /path/to/project2/python
python3 broker.py
```

Terminal 2
```bash
cd /path/to/project2/python
python3 server.py --endpoint tcp://127.0.0.1:5555
```

Terminal 3
```bash
cd /path/to/project2/python
python3 publisher.py node-alpha --endpoint tcp://127.0.0.1:5556
```

Open:

```text
http://127.0.0.1:5000
```
