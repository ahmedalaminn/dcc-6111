import queue
import threading
import time
import zmq

from proto.log_message_pb2 import LogMessage

RECONNECT_DELAY_S = 2.0
RECV_TIMEOUT_MS   = 500

class ZmqSubscriber(threading.Thread):
    def __init__(self, endpoint: str, topic: bytes, out_queue: queue.Queue) -> None:
        super().__init__(name="ZmqSubscriber", daemon=True)
        self.endpoint  = endpoint
        self.topic     = topic
        self.out_queue = out_queue
        self._stop_evt = threading.Event()

    def run(self) -> None:
        ctx = zmq.Context()

        while not self._stop_evt.is_set():
            sock   = ctx.socket(zmq.SUB)
            poller = zmq.Poller()
            try:
                sock.connect(self.endpoint)
                sock.setsockopt(zmq.SUBSCRIBE, self.topic)
                poller.register(sock, zmq.POLLIN)
                print(f"[ZMQ] Connected to {self.endpoint}")

                while not self._stop_evt.is_set():
                    events = dict(poller.poll(RECV_TIMEOUT_MS))
                    if sock not in events:
                        continue

                    frames = sock.recv_multipart()
                    if len(frames) < 2:
                        continue
                    _, raw = frames[0], frames[1]

                    try:
                        msg = LogMessage.FromString(raw)
                    except Exception as exc:
                        print(f"[ZMQ] Deserialise error: {exc}")
                        continue

                    if self.out_queue.full():
                        try:
                            self.out_queue.get_nowait()
                        except queue.Empty:
                            pass
                    self.out_queue.put_nowait(msg)

            except Exception as exc:
                print(f"[ZMQ] Error: {exc} retrying in {RECONNECT_DELAY_S}s")
                time.sleep(RECONNECT_DELAY_S)
            finally:
                sock.close()

        ctx.term()
        print("[ZMQ] Subscriber stopped.")

    def stop(self) -> None:
        self._stop_evt.set()