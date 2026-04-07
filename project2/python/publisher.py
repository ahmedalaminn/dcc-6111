import time
import sys
import zmq
from proto.log_message_pb2 import LogMessage

def run_publisher(node_id):
    context = zmq.Context()
    pub = context.socket(zmq.PUB)
    pub.connect("tcp://localhost:5556")
    
    while True:
        msg = LogMessage(
            node_id=node_id,
            timestamp_ms=int(time.time() * 1000),
            payload=f"Diagnostic telemetry from {node_id}",
            topic="diag"
        )
        
        pub.send_multipart([b"diag", msg.SerializeToString()])
        print(f"[{node_id}] Message sent.")
        time.sleep(2)

if __name__ == "__main__":
    node_name = sys.argv[1] if len(sys.argv) > 1 else "node-1"
    run_publisher(node_name)